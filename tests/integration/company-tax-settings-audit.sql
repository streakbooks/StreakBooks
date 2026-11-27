DO $$
DECLARE
  _company_id uuid := '10000000-0000-4000-8000-000000000011';
  _tax_rows_before integer;
  _count_before integer;
BEGIN
  IF has_function_privilege(
    'authenticated', 'public.audit_company_tax_settings_change()', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Authenticated users must not call the tax audit trigger function directly';
  END IF;

  SELECT count(*) INTO _count_before FROM public.settings_change_log
  WHERE company_id = _company_id AND category = 'tax'
    AND setting_key LIKE 'company_tax_settings.%';
  UPDATE public.company_tax_settings
  SET tax_regime = 'vat', registration_number = 'GB998877', prices_include_tax = false
  WHERE company_id = _company_id;

  IF (SELECT count(*) FROM public.settings_change_log
      WHERE company_id = _company_id AND category = 'tax'
        AND setting_key LIKE 'company_tax_settings.%') <> _count_before + 3 THEN
    RAISE EXCEPTION 'Tax summary update did not create one audit row per changed setting';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.settings_change_log
    WHERE company_id = _company_id
      AND setting_key = 'company_tax_settings.tax_regime'
      AND old_value = '"gst"'::jsonb AND new_value = '"vat"'::jsonb
      AND source = 'tax_settings'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.settings_change_log
    WHERE company_id = _company_id
      AND setting_key = 'company_tax_settings.registration_number'
      AND old_value = '"GSTIN123"'::jsonb AND new_value = '"GB998877"'::jsonb
  ) OR NOT EXISTS (
    SELECT 1 FROM public.settings_change_log
    WHERE company_id = _company_id
      AND setting_key = 'company_tax_settings.prices_include_tax'
      AND old_value = 'true'::jsonb AND new_value = 'false'::jsonb
  ) THEN
    RAISE EXCEPTION 'Tax audit rows omitted exact before/after values';
  END IF;

  SELECT count(*) INTO _count_before FROM public.settings_change_log
  WHERE company_id = _company_id AND category = 'tax';
  UPDATE public.company_tax_settings SET tax_regime = tax_regime WHERE company_id = _company_id;
  IF (SELECT count(*) FROM public.settings_change_log
      WHERE company_id = _company_id AND category = 'tax') <> _count_before THEN
    RAISE EXCEPTION 'No-op Tax settings update created audit noise';
  END IF;

  SELECT count(*) INTO _tax_rows_before FROM public.settings_change_log
  WHERE company_id = _company_id AND category = 'tax';
  UPDATE public.company_tax_settings
  SET tax_regime = 'gst'
  WHERE company_id = '10000000-0000-4000-8000-000000000012';
  IF (SELECT count(*) FROM public.settings_change_log
      WHERE company_id = _company_id AND category = 'tax') <> _tax_rows_before THEN
    RAISE EXCEPTION 'Another organisation update leaked into this organisation audit';
  END IF;

  PERFORM set_config('test.fail_tax_audit', 'on', true);
  BEGIN
    UPDATE public.company_tax_settings SET registration_number = 'ROLLBACK'
    WHERE company_id = _company_id;
    RAISE EXCEPTION 'Injected Tax audit failure was ignored';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Injected Tax audit failure%' THEN RAISE; END IF;
  END;
  PERFORM set_config('test.fail_tax_audit', 'off', true);

  IF (SELECT registration_number FROM public.company_tax_settings
      WHERE company_id = _company_id) <> 'GB998877'
     OR (SELECT count(*) FROM public.settings_change_log
         WHERE company_id = _company_id AND category = 'tax') <> _count_before THEN
    RAISE EXCEPTION 'Tax audit failure did not roll back the setting change';
  END IF;

  BEGIN
    UPDATE public.company_tax_settings
    SET company_id = '10000000-0000-4000-8000-000000000012'
    WHERE company_id = _company_id;
    RAISE EXCEPTION 'Tax settings reassignment was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%cannot move between organisations%' THEN RAISE; END IF;
  END;
END $$;

SELECT 'PASS: Tax configuration edits have field-level audit, no-op suppression, tenant scope and rollback' AS result;
