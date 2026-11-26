-- Keep base-currency changes serialised with ledger posting and disallow
-- reinterpreting a company that already has posted journals.
CREATE OR REPLACE FUNCTION public.save_company_identity_and_tax(
  _company_id uuid,
  _expected jsonb,
  _desired jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  _before jsonb;
  _month integer;
  _day integer;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_company_permission(_company_id, 'company.settings.edit') THEN
    RAISE EXCEPTION 'Permission denied for organisation settings' USING ERRCODE = '42501';
  END IF;
  IF _expected IS NULL OR _desired IS NULL
     OR pg_catalog.jsonb_typeof(_expected) <> 'object'
     OR pg_catalog.jsonb_typeof(_desired) <> 'object'
     OR NOT (_desired ?& ARRAY[
       'name','legal_name','country_code','base_currency','fiscal_year_end_month',
       'fiscal_year_end_day','timezone','tax_regime','registration_number','prices_include_tax'
     ]) THEN
    RAISE EXCEPTION 'Expected and desired organisation settings are required';
  END IF;
  IF pg_catalog.length(pg_catalog.btrim(COALESCE(_desired->>'name',''))) NOT BETWEEN 2 AND 160
     OR pg_catalog.length(COALESCE(_desired->>'legal_name','')) > 200
     OR COALESCE(_desired->>'country_code','') !~ '^[A-Z]{2}$'
     OR COALESCE(_desired->>'base_currency','') !~ '^[A-Z]{3}$'
     OR pg_catalog.jsonb_typeof(_desired->'fiscal_year_end_month') <> 'number'
     OR pg_catalog.jsonb_typeof(_desired->'fiscal_year_end_day') <> 'number'
     OR COALESCE(_desired->>'fiscal_year_end_month','') !~ '^[0-9]{1,2}$'
     OR COALESCE(_desired->>'fiscal_year_end_day','') !~ '^[0-9]{1,2}$'
     OR COALESCE(_desired->>'timezone','') = ''
     OR pg_catalog.length(_desired->>'timezone') > 64
     OR COALESCE(_desired->>'tax_regime','') NOT IN ('none','vat','gst','sales_tax','other')
     OR pg_catalog.length(COALESCE(_desired->>'registration_number','')) > 60
     OR pg_catalog.jsonb_typeof(_desired->'prices_include_tax') <> 'boolean' THEN
    RAISE EXCEPTION 'Invalid organisation settings';
  END IF;

  _month := (_desired->>'fiscal_year_end_month')::integer;
  _day := (_desired->>'fiscal_year_end_day')::integer;
  IF _month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Invalid financial year end month';
  END IF;
  IF _day < 1 OR _day > EXTRACT(day FROM (pg_catalog.make_date(2024, _month, 1)
                                          + interval '1 month - 1 day'))::integer THEN
    RAISE EXCEPTION 'Invalid financial year end date';
  END IF;

  -- This row lock is shared with post_journal's base-currency read.
  SELECT pg_catalog.jsonb_build_object(
    'name', c.name,
    'legal_name', c.legal_name,
    'country_code', c.country_code,
    'base_currency', c.base_currency,
    'fiscal_year_end_month', c.fiscal_year_end_month,
    'fiscal_year_end_day', c.fiscal_year_end_day,
    'timezone', c.timezone,
    'tax_regime', t.tax_regime,
    'registration_number', t.registration_number,
    'prices_include_tax', t.prices_include_tax
  )
  INTO _before
  FROM public.companies c
  JOIN public.company_tax_settings t ON t.company_id = c.id
  WHERE c.id = _company_id
  FOR UPDATE OF c, t;

  IF _before IS NULL THEN
    RAISE EXCEPTION 'Organisation or tax settings not found';
  END IF;
  IF _before IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION 'Organisation settings changed in another session. Reload the latest values.';
  END IF;
  IF _before->>'base_currency' IS DISTINCT FROM _desired->>'base_currency'
     AND EXISTS (
       SELECT 1 FROM public.journals j
       WHERE j.company_id = _company_id AND j.status = 'posted'
     ) THEN
    RAISE EXCEPTION 'Base currency cannot change after journals have been posted';
  END IF;

  UPDATE public.companies SET
    name = pg_catalog.btrim(_desired->>'name'),
    legal_name = NULLIF(pg_catalog.btrim(_desired->>'legal_name'),''),
    country_code = _desired->>'country_code',
    base_currency = _desired->>'base_currency',
    fiscal_year_end_month = _month,
    fiscal_year_end_day = _day,
    timezone = pg_catalog.btrim(_desired->>'timezone')
  WHERE id = _company_id;

  UPDATE public.company_tax_settings SET
    tax_regime = _desired->>'tax_regime',
    registration_number = NULLIF(pg_catalog.btrim(_desired->>'registration_number'),''),
    prices_include_tax = (_desired->>'prices_include_tax')::boolean
  WHERE company_id = _company_id;

  PERFORM public.record_audit_event(
    _company_id,
    'settings.organization_identity',
    'company',
    _company_id,
    pg_catalog.jsonb_build_object('before', _before, 'after', _desired)
  );
  RETURN _desired;
END;
$$;

REVOKE ALL ON FUNCTION public.save_company_identity_and_tax(uuid,jsonb,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_company_identity_and_tax(uuid,jsonb,jsonb)
  TO authenticated;

-- Add share locks to the central writer and every higher-level posting
-- function that reads base currency before calling it. Fail closed if the
-- expected active posting reads differ from the reviewed source statements.
DO $$
DECLARE
  _function record;
  _definition text;
  _updated text;
  _needle text;
  _replacement text;
  _statement_count integer;
  _changed_statements integer := 0;
  _changed_functions integer := 0;
  _locked_statement text;
  _needles constant text[] := ARRAY[
    'SELECT base_currency INTO _base_currency FROM public.companies WHERE id = _company_id;',
    'SELECT base_currency INTO _base FROM public.companies WHERE id = _company;',
    'SELECT base_currency INTO base FROM public.companies WHERE id=_company;'
  ];
BEGIN
  FOR _function IN
    SELECT p.oid
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prokind = 'f'
      AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%post_journal(%'
  LOOP
    _definition := pg_catalog.pg_get_functiondef(_function.oid);
    _updated := _definition;
    FOREACH _needle IN ARRAY _needles LOOP
      _statement_count := (
        pg_catalog.length(_updated) - pg_catalog.length(pg_catalog.replace(_updated, _needle, ''))
      ) / pg_catalog.length(_needle);
      IF _statement_count > 0 THEN
        _replacement := pg_catalog.replace(_needle, ';', ' FOR SHARE;');
        _updated := pg_catalog.replace(_updated, _needle, _replacement);
        _changed_statements := _changed_statements + _statement_count;
      END IF;
    END LOOP;
    IF _updated IS DISTINCT FROM _definition THEN
      EXECUTE _updated;
      _changed_functions := _changed_functions + 1;
    END IF;
  END LOOP;

  IF _changed_statements < 1 OR _changed_functions < 1 THEN
    RAISE EXCEPTION 'No active journal posting currency reads were patched; refusing unsafe migration';
  END IF;

  -- Verify every matching base-currency read in every installed posting
  -- function, including higher-level functions that compute FX before calling
  -- post_journal. This also makes partial schemas fail closed.
  FOR _function IN
    SELECT p.oid
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prokind = 'f'
      AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%post_journal(%'
  LOOP
    _definition := pg_catalog.pg_get_functiondef(_function.oid);
    FOREACH _needle IN ARRAY _needles LOOP
      _locked_statement := pg_catalog.replace(_needle, ';', ' FOR SHARE;');
      IF pg_catalog.strpos(_definition, _needle) > 0
         AND pg_catalog.strpos(_definition, _locked_statement) = 0 THEN
        RAISE EXCEPTION
          'Posting function % has an unlocked base-currency read',
          _function.oid::regprocedure;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
