SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001"}', false);

DO $$
DECLARE
  c uuid := '10000000-0000-4000-8000-000000000011';
  other_c uuid := '10000000-0000-4000-8000-000000000012';
  posted_c uuid := '10000000-0000-4000-8000-000000000013';
  expected jsonb := '{"name":"Company Identity Fixture","legal_name":"Fixture Legal Entity","country_code":"GB","base_currency":"GBP","fiscal_year_end_month":3,"fiscal_year_end_day":31,"timezone":"Europe/London","tax_regime":"vat","registration_number":"GB123456789","prices_include_tax":false}'::jsonb;
  desired jsonb := '{"name":"Updated Fixture","legal_name":"Updated Legal Entity","country_code":"IN","base_currency":"INR","fiscal_year_end_month":6,"fiscal_year_end_day":30,"timezone":"Asia/Kolkata","tax_regime":"gst","registration_number":"GSTIN123","prices_include_tax":true}'::jsonb;
  posted_expected jsonb := '{"name":"Posted Ledger Fixture","legal_name":null,"country_code":"GB","base_currency":"GBP","fiscal_year_end_month":3,"fiscal_year_end_day":31,"timezone":"Europe/London","tax_regime":"vat","registration_number":null,"prices_include_tax":false}'::jsonb;
  posted_desired jsonb := '{"name":"Posted Ledger Fixture","legal_name":null,"country_code":"GB","base_currency":"INR","fiscal_year_end_month":3,"fiscal_year_end_day":31,"timezone":"Europe/London","tax_regime":"vat","registration_number":null,"prices_include_tax":false}'::jsonb;
  localisation_expected jsonb := '{"locale":"en-GB","date_format":"DD/MM/YYYY","invoice_footer":"","document_theme_color":"#0F766E"}'::jsonb;
  localisation_desired jsonb := '{"locale":"en-US","date_format":"MM/DD/YYYY","invoice_footer":"","document_theme_color":"#0F766E"}'::jsonb;
  audit_row public.audit_events%ROWTYPE;
  audit_before integer;
  posted_journal uuid;
BEGIN
  SELECT count(*) INTO audit_before
  FROM public.audit_events
  WHERE company_id=c AND action='settings.organization_identity';

  -- One successful save updates both tables and records the same transaction's before/after.
  PERFORM public.save_company_identity_and_tax(c, expected, desired);
  IF (SELECT name FROM public.companies WHERE id=c) <> 'Updated Fixture'
     OR (SELECT legal_name FROM public.companies WHERE id=c) <> 'Updated Legal Entity'
     OR (SELECT fiscal_year_end_month FROM public.companies WHERE id=c) <> 6
     OR (SELECT fiscal_year_end_day FROM public.companies WHERE id=c) <> 30
     OR (SELECT tax_regime FROM public.company_tax_settings WHERE company_id=c) <> 'gst'
     OR NOT (SELECT prices_include_tax FROM public.company_tax_settings WHERE company_id=c) THEN
    RAISE EXCEPTION 'Organisation identity and tax settings were not saved together';
  END IF;
  SELECT * INTO audit_row FROM public.audit_events
   WHERE company_id=c AND action='settings.organization_identity'
   ORDER BY id DESC LIMIT 1;
  IF audit_row.id IS NULL
     OR audit_row.details->'before' IS DISTINCT FROM expected
     OR audit_row.details->'after' IS DISTINCT FROM desired THEN
    RAISE EXCEPTION 'Organisation save did not record exact before/after audit evidence';
  END IF;

  -- Locale and document date style are saved as one versioned company preference
  -- and are passed into customer-facing document/email formatting.
  PERFORM public.save_company_localisation_if_unchanged(c, localisation_expected, localisation_desired);
  IF (SELECT locale FROM public.companies WHERE id=c) <> 'en-US'
     OR (SELECT date_format FROM public.companies WHERE id=c) <> 'MM/DD/YYYY' THEN
    RAISE EXCEPTION 'Organisation locale and date format were not saved together';
  END IF;
  SELECT * INTO audit_row FROM public.audit_events
   WHERE company_id=c AND action='settings.localization'
   ORDER BY id DESC LIMIT 1;
  IF audit_row.id IS NULL
     OR audit_row.details->'before' IS DISTINCT FROM localisation_expected
     OR audit_row.details->'after' IS DISTINCT FROM localisation_desired THEN
    RAISE EXCEPTION 'Localisation save did not record exact before/after audit evidence';
  END IF;

  -- Unsupported direct RPC values and stale snapshots cannot change locale or create audit noise.
  BEGIN
    PERFORM public.save_company_localisation_if_unchanged(
      c, localisation_desired, jsonb_set(localisation_desired, '{locale}', '"fr-FR"'::jsonb)
    );
    RAISE EXCEPTION 'Unsupported localisation locale was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Invalid localisation preferences%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.save_company_localisation_if_unchanged(c, localisation_expected, localisation_expected);
    RAISE EXCEPTION 'Stale localisation snapshot was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Localisation changed in another session%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.save_company_localisation_if_unchanged(
      other_c, localisation_expected, localisation_desired
    );
    RAISE EXCEPTION 'Unauthorised localisation save was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Permission denied%' THEN RAISE; END IF;
  END;
  PERFORM set_config('test.fail_audit','on',true);
  BEGIN
    PERFORM public.save_company_localisation_if_unchanged(
      c,
      localisation_desired,
      jsonb_set(localisation_desired, '{locale}', '"en-AU"'::jsonb)
    );
    RAISE EXCEPTION 'Injected localisation audit failure was not propagated';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Injected audit failure%' THEN RAISE; END IF;
  END;
  PERFORM set_config('test.fail_audit','off',true);
  IF (SELECT locale FROM public.companies WHERE id=c) <> 'en-US'
     OR EXISTS (SELECT 1 FROM public.audit_events
                WHERE company_id=c AND action='settings.localization'
                GROUP BY action HAVING count(*) <> 1) THEN
    RAISE EXCEPTION 'Rejected localisation updates changed preferences or wrote audit history';
  END IF;

  posted_journal := public.post_journal(jsonb_build_object(
    'company_id', c,
    'journal_date', current_date,
    'idempotency_key', 'settings_base_currency_consumer',
    'memo', 'Settings base-currency consumer regression',
    'lines', jsonb_build_array(
      jsonb_build_object('account_id', '20000000-0000-4000-8000-000000000011', 'debit_minor', 100, 'credit_minor', 0),
      jsonb_build_object('account_id', '20000000-0000-4000-8000-000000000012', 'debit_minor', 0, 'credit_minor', 100)
    )
  ));
  IF (SELECT currency_code FROM public.journals WHERE id=posted_journal) <> 'INR' THEN
    RAISE EXCEPTION 'New journal did not consume the configured base currency';
  END IF;

  -- Posted ledger history makes the base currency immutable, even through a
  -- direct authenticated RPC call. The rejected save must leave audit history untouched.
  BEGIN
    PERFORM public.save_company_identity_and_tax(posted_c, posted_expected, posted_desired);
    RAISE EXCEPTION 'Base currency changed after a journal was posted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Base currency cannot change after journals have been posted%' THEN RAISE; END IF;
  END;
  IF (SELECT base_currency FROM public.companies WHERE id=posted_c) <> 'GBP'
     OR EXISTS (SELECT 1 FROM public.audit_events
                WHERE company_id=posted_c AND action='settings.organization_identity') THEN
    RAISE EXCEPTION 'Rejected base-currency change modified identity or audit history';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prokind = 'f'
      AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%post_journal(%'
      AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%SELECT base_currency INTO%'
      AND pg_catalog.pg_get_functiondef(p.oid) NOT LIKE '%SELECT base_currency INTO%FOR SHARE;%'
  ) THEN
    RAISE EXCEPTION 'A posting function reads company currency without a share lock';
  END IF;

  -- Stale callers cannot overwrite another editor's settings or create audit noise.
  BEGIN
    PERFORM public.save_company_identity_and_tax(c, expected, expected);
    RAISE EXCEPTION 'Stale organisation snapshot was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%changed in another session%' THEN RAISE; END IF;
  END;
  IF (SELECT name FROM public.companies WHERE id=c) <> 'Updated Fixture' THEN
    RAISE EXCEPTION 'Stale organisation save changed the company';
  END IF;

  -- February 30 is invalid and must fail before either table changes.
  BEGIN
    PERFORM public.save_company_identity_and_tax(
      c, desired,
      jsonb_set(
        jsonb_set(desired, '{fiscal_year_end_month}', '2'::jsonb),
        '{fiscal_year_end_day}', '30'::jsonb
      )
    );
    RAISE EXCEPTION 'Invalid February 30 year end was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%financial year end date%' THEN RAISE; END IF;
  END;
  IF (SELECT fiscal_year_end_day FROM public.companies WHERE id=c) <> 30 THEN
    RAISE EXCEPTION 'Invalid date partially changed company settings';
  END IF;

  -- Audit failure aborts the company and tax writes as one transaction.
  PERFORM set_config('test.fail_audit','on',true);
  BEGIN
    PERFORM public.save_company_identity_and_tax(
      c, desired, jsonb_set(desired, '{name}', '"Must Roll Back"'::jsonb)
    );
    RAISE EXCEPTION 'Injected audit failure was not propagated';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Injected audit failure%' THEN RAISE; END IF;
  END;
  PERFORM set_config('test.fail_audit','off',true);
  IF (SELECT name FROM public.companies WHERE id=c) <> 'Updated Fixture'
     OR (SELECT tax_regime FROM public.company_tax_settings WHERE company_id=c) <> 'gst' THEN
    RAISE EXCEPTION 'Audit failure did not roll back company and tax rows';
  END IF;

  -- Membership alone is insufficient; only the explicitly granted settings editor may save.
  BEGIN
    PERFORM public.save_company_identity_and_tax(other_c, expected, desired);
    RAISE EXCEPTION 'Cross-company settings save was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Permission denied%' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.audit_events
      WHERE company_id=c AND action='settings.organization_identity') <> audit_before + 1 THEN
    RAISE EXCEPTION 'Rejected organisation saves wrote audit records';
  END IF;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF has_function_privilege(
    'anon', 'public.save_company_identity_and_tax(uuid,jsonb,jsonb)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Anonymous access to organisation settings save was granted';
  END IF;
END $$;

SELECT 'PASS: atomic organisation/tax save, optimistic snapshot, audit rollback and permission checks' AS result;
