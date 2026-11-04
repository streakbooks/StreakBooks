-- Atomic, tenant-scoped replacement of enabled transaction currencies.
-- Apply to Supabase before deploying the application code that calls this RPC.
-- Base currency remains implied; no posted journals or exchange rates are changed.

CREATE OR REPLACE FUNCTION public.replace_company_currencies_atomic(
  _company_id uuid,
  _currencies text[],
  _expected_currencies text[]
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  _base text;
  _before text[];
  _wanted text[];
  _expected text[];
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_company_permission(_company_id, 'company.settings.edit') THEN
    RAISE EXCEPTION 'Permission denied for company currency settings'
      USING ERRCODE = '42501';
  END IF;

  IF _currencies IS NULL OR _expected_currencies IS NULL THEN
    RAISE EXCEPTION 'Currency selections and expected values are required';
  END IF;

  -- Serialise saves for one company, even when two editors act simultaneously.
  -- This is an advisory transaction lock; it is automatically released on commit/rollback.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    20261104, pg_catalog.hashtext(_company_id::text)
  );

  SELECT pg_catalog.btrim(c.base_currency::text)
    INTO _base
  FROM public.companies c
  WHERE c.id = _company_id;

  IF _base IS NULL THEN
    RAISE EXCEPTION 'Company not found or not accessible';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(_currencies || _expected_currencies) AS code(value)
    WHERE code.value IS NULL OR code.value !~ '^[A-Z]{3}$'
  ) THEN
    RAISE EXCEPTION 'Currency codes must be three uppercase letters';
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(value ORDER BY value), ARRAY[]::text[])
    INTO _wanted
  FROM (
    SELECT DISTINCT code.value
    FROM pg_catalog.unnest(_currencies) AS code(value)
    WHERE code.value <> _base
  ) AS desired;

  SELECT COALESCE(pg_catalog.array_agg(value ORDER BY value), ARRAY[]::text[])
    INTO _expected
  FROM (
    SELECT DISTINCT code.value
    FROM pg_catalog.unnest(_expected_currencies) AS code(value)
    WHERE code.value <> _base
  ) AS expected;

  SELECT COALESCE(
    pg_catalog.array_agg(pg_catalog.btrim(currency_code::text) ORDER BY currency_code),
    ARRAY[]::text[]
  )
    INTO _before
  FROM public.company_currencies
  WHERE company_id = _company_id;

  IF _before IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION 'Currency settings changed in another session. Reload the latest values.';
  END IF;

  -- Both statements and the audit execute inside ONE database transaction.
  -- A failed insert or audit rolls back the deletion; no partial replacement.
  DELETE FROM public.company_currencies
  WHERE company_id = _company_id
    AND NOT (pg_catalog.btrim(currency_code::text) = ANY (_wanted));

  INSERT INTO public.company_currencies(company_id, currency_code)
  SELECT _company_id, wanted.value
  FROM pg_catalog.unnest(_wanted) AS wanted(value)
  ON CONFLICT (company_id, currency_code) DO NOTHING;

  PERFORM public.record_audit_event(
    _company_id, 'settings.currencies', 'company', _company_id,
    pg_catalog.jsonb_build_object('before', _before, 'after', _wanted)
  );

  RETURN _wanted;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_company_currencies_atomic(uuid, text[], text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_company_currencies_atomic(uuid, text[], text[])
  TO authenticated;

COMMENT ON FUNCTION public.replace_company_currencies_atomic(uuid, text[], text[]) IS
  'Security-invoker, RLS-enforced atomic currency replacement with stale-edit rejection and audit.';
