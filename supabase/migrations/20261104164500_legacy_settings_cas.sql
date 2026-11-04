-- Transactional compare-and-save for legacy Organisation settings editors.
-- Adds RPCs only: does not rewrite existing company, branding, sequence or ledger data.
-- Use matching application code only AFTER this migration has been installed.

CREATE OR REPLACE FUNCTION public.save_company_localisation_if_unchanged(
  _company_id uuid, _expected jsonb, _desired jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  _before jsonb;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_company_permission(_company_id, 'company.settings.edit') THEN
    RAISE EXCEPTION 'Permission denied for organisation settings' USING ERRCODE = '42501';
  END IF;
  IF _expected IS NULL OR _desired IS NULL
     OR pg_catalog.jsonb_typeof(_expected) <> 'object'
     OR pg_catalog.jsonb_typeof(_desired) <> 'object' THEN
    RAISE EXCEPTION 'Expected and desired localisation settings are required';
  END IF;
  IF _desired->>'locale' IS NULL OR _desired->>'locale' NOT IN ('en-GB','en-US','en-AU','en-NZ','en-IE','en-CA')
     OR _desired->>'date_format' IS NULL OR _desired->>'date_format' NOT IN ('DD/MM/YYYY','MM/DD/YYYY','YYYY-MM-DD')
     OR _desired->>'invoice_footer' IS NULL
     OR pg_catalog.length(COALESCE(_desired->>'invoice_footer','')) > 2000
     OR COALESCE(_desired->>'document_theme_color','') !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Invalid localisation preferences';
  END IF;

  -- Row lock serialises concurrent RPCs and direct company-row updates.
  SELECT pg_catalog.jsonb_build_object(
    'locale',c.locale,'date_format',c.date_format,
    'invoice_footer',c.invoice_footer,'document_theme_color',c.document_theme_color
  )
  INTO _before
  FROM public.companies c WHERE c.id=_company_id FOR UPDATE;
  IF _before IS NULL THEN RAISE EXCEPTION 'Organisation not found'; END IF;
  IF _before IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION 'Localisation changed in another session. Reload the latest settings.';
  END IF;
  UPDATE public.companies SET
    locale=_desired->>'locale',
    date_format=_desired->>'date_format',
    invoice_footer=_desired->>'invoice_footer',
    document_theme_color=_desired->>'document_theme_color'
  WHERE id=_company_id;
  PERFORM public.record_audit_event(
    _company_id,'settings.localization','company',_company_id,
    pg_catalog.jsonb_build_object('before',_before,'after',_desired)
  );
  RETURN _desired;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_company_branding_if_unchanged(
  _company_id uuid, _expected jsonb, _desired jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  _before jsonb;
  _exists boolean := false;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_company_permission(_company_id, 'company.settings.edit') THEN
    RAISE EXCEPTION 'Permission denied for organisation branding' USING ERRCODE = '42501';
  END IF;
  IF _expected IS NULL OR _desired IS NULL
     OR pg_catalog.jsonb_typeof(_expected) <> 'object'
     OR pg_catalog.jsonb_typeof(_desired) <> 'object' THEN
    RAISE EXCEPTION 'Expected and desired document branding are required';
  END IF;
  IF pg_catalog.length(COALESCE(_desired->>'trading_name','')) > 160
     OR pg_catalog.length(COALESCE(_desired->>'letterhead_line','')) > 200
     OR pg_catalog.length(COALESCE(_desired->>'invoice_email','')) > 160
     OR pg_catalog.length(COALESCE(_desired->>'invoice_phone','')) > 40
     OR pg_catalog.length(COALESCE(_desired->>'logo_url','')) > 500
     OR (COALESCE(_desired->>'invoice_email','') <> ''
         AND _desired->>'invoice_email' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
     OR (COALESCE(_desired->>'logo_url','') <> ''
         AND _desired->>'logo_url' !~ '^https://') THEN
    RAISE EXCEPTION 'Invalid branding fields';
  END IF;

  -- A shared per-company transaction lock also serialises first-row creation.
  PERFORM pg_catalog.pg_advisory_xact_lock(20261105, pg_catalog.hashtext(_company_id::text));
  SELECT pg_catalog.jsonb_build_object(
    'trading_name',b.trading_name,'letterhead_line',b.letterhead_line,
    'invoice_email',b.invoice_email,'invoice_phone',b.invoice_phone,'logo_url',b.logo_url
  ),true INTO _before,_exists
  FROM public.company_branding b WHERE b.company_id=_company_id FOR UPDATE;
  IF _before IS NULL THEN
    _before := '{"trading_name":null,"letterhead_line":null,"invoice_email":null,"invoice_phone":null,"logo_url":null}'::jsonb;
  END IF;
  IF _before IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION 'Branding changed in another session. Reload the latest settings.';
  END IF;

  IF _exists THEN
    UPDATE public.company_branding SET
      trading_name=NULLIF(pg_catalog.btrim(_desired->>'trading_name'),''),
      letterhead_line=NULLIF(pg_catalog.btrim(_desired->>'letterhead_line'),''),
      invoice_email=NULLIF(pg_catalog.btrim(_desired->>'invoice_email'),''),
      invoice_phone=NULLIF(pg_catalog.btrim(_desired->>'invoice_phone'),''),
      logo_url=NULLIF(pg_catalog.btrim(_desired->>'logo_url'),''),
      updated_at=pg_catalog.now()
    WHERE company_id=_company_id;
  ELSE
    INSERT INTO public.company_branding(
      company_id,trading_name,letterhead_line,invoice_email,invoice_phone,logo_url
    ) VALUES (
      _company_id,
      NULLIF(pg_catalog.btrim(_desired->>'trading_name'),''),
      NULLIF(pg_catalog.btrim(_desired->>'letterhead_line'),''),
      NULLIF(pg_catalog.btrim(_desired->>'invoice_email'),''),
      NULLIF(pg_catalog.btrim(_desired->>'invoice_phone'),''),
      NULLIF(pg_catalog.btrim(_desired->>'logo_url'),'')
    );
  END IF;
  PERFORM public.record_audit_event(
    _company_id,'settings.branding','company',_company_id,
    pg_catalog.jsonb_build_object('before',_before,'after',_desired)
  );
  RETURN _desired;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_document_sequence_if_unchanged(
  _company_id uuid, _document_type text, _expected jsonb, _desired jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  _before jsonb;
  _number bigint;
  _padding integer;
  _prefix text;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_company_permission(_company_id, 'company.settings.edit') THEN
    RAISE EXCEPTION 'Permission denied for document numbering' USING ERRCODE = '42501';
  END IF;
  IF _document_type NOT IN (
    'sales_invoice','purchase_bill','sales_quote','sales_credit_note','purchase_credit_note'
  ) THEN RAISE EXCEPTION 'Unsupported document sequence'; END IF;
  IF _expected IS NULL OR _desired IS NULL
     OR pg_catalog.jsonb_typeof(_expected) <> 'object'
     OR pg_catalog.jsonb_typeof(_desired) <> 'object'
     OR pg_catalog.jsonb_typeof(_desired->'next_number') <> 'number'
     OR pg_catalog.jsonb_typeof(_desired->'padding') <> 'number' THEN
    RAISE EXCEPTION 'Valid document numbering values are required';
  END IF;
  IF (_desired->>'next_number') !~ '^[0-9]{1,10}$'
     OR (_desired->>'padding') !~ '^[0-9]{1,2}$' THEN
    RAISE EXCEPTION 'Number and padding must be whole numbers';
  END IF;
  _number := (_desired->>'next_number')::bigint;
  _padding := (_desired->>'padding')::integer;
  _prefix := pg_catalog.btrim(COALESCE(_desired->>'prefix',''));
  IF _number < 1 OR _number >= 2147483647
     OR _padding < 1 OR _padding > 10
     OR pg_catalog.length(_prefix) > 20 THEN
    RAISE EXCEPTION 'Invalid document sequence range';
  END IF;

  -- Allocation uses UPDATE on this same row, so a later allocation forces a
  -- stale-edit error rather than allowing a number to be issued twice.
  SELECT pg_catalog.jsonb_build_object(
    'prefix',s.prefix,'next_number',s.next_number,'padding',s.padding
  ) INTO _before
  FROM public.document_sequences s
  WHERE s.company_id=_company_id AND s.document_type=_document_type
  FOR UPDATE;
  IF _before IS NULL THEN RAISE EXCEPTION 'Document sequence not initialized'; END IF;
  IF _before IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION 'Document numbering changed in another session. Reload the latest values.';
  END IF;
  IF _number < (_before->>'next_number')::integer THEN
    RAISE EXCEPTION 'The next document number cannot be decreased';
  END IF;

  UPDATE public.document_sequences SET
    prefix=_prefix,next_number=_number,padding=_padding
  WHERE company_id=_company_id AND document_type=_document_type;
  PERFORM public.record_audit_event(
    _company_id,'settings.sequence','document_sequence',null,
    pg_catalog.jsonb_build_object(
      'document_type',_document_type,'before',_before,'after',_desired
    )
  );
  RETURN _desired;
END;
$$;

REVOKE ALL ON FUNCTION public.save_company_localisation_if_unchanged(uuid,jsonb,jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_company_branding_if_unchanged(uuid,jsonb,jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_document_sequence_if_unchanged(uuid,text,jsonb,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_company_localisation_if_unchanged(uuid,jsonb,jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_company_branding_if_unchanged(uuid,jsonb,jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_document_sequence_if_unchanged(uuid,text,jsonb,jsonb)
  TO authenticated;
