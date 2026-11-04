-- Integration regression: multicurrency disabling must reject configured currencies,
-- including calls through the direct authenticated database RPC.
-- Execute only in the isolated workflow PostgreSQL container after currency fixtures.

SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001"}', false);

DO $$
DECLARE
  c uuid := '10000000-0000-4000-8000-000000000001';
  other_c uuid := '10000000-0000-4000-8000-000000000002';
  n integer;
BEGIN
  SELECT count(*) INTO n FROM public.company_currencies WHERE company_id=c;
  IF n <> 2 THEN
    RAISE EXCEPTION 'Feature fixture expected two configured currencies, got %', n;
  END IF;

  -- Direct RPC bypass must not disable a feature with configured currencies.
  BEGIN
    PERFORM public.set_organisation_feature(c, 'multicurrency', false);
    RAISE EXCEPTION 'Multicurrency was disabled despite configured currencies';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Multicurrency cannot be disabled%' THEN RAISE; END IF;
  END;

  IF EXISTS (SELECT 1 FROM public.organisation_features
             WHERE company_id=c AND feature_key='multicurrency') THEN
    RAISE EXCEPTION 'Rejected feature save left a feature row';
  END IF;
  IF EXISTS (SELECT 1 FROM public.settings_change_log
             WHERE company_id=c AND setting_key='multicurrency') THEN
    RAISE EXCEPTION 'Rejected feature save left an audit row';
  END IF;

  -- Enabling remains allowed, but an existing enabled row cannot be disabled.
  PERFORM public.set_organisation_feature(c, 'multicurrency', true);
  BEGIN
    PERFORM public.set_organisation_feature(c, 'multicurrency', false);
    RAISE EXCEPTION 'Existing multicurrency feature was disabled with configured currencies';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Multicurrency cannot be disabled%' THEN RAISE; END IF;
  END;
  IF (SELECT enabled FROM public.organisation_features
      WHERE company_id=c AND feature_key='multicurrency') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Rejected disable overwrote the enabled flag';
  END IF;

  -- Failure is scoped by company and enforces permissions before the trigger.
  BEGIN
    PERFORM public.set_organisation_feature(other_c, 'multicurrency', false);
    RAISE EXCEPTION 'Cross-tenant multicurrency operation was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%permission%' THEN RAISE; END IF;
  END;

  -- Once the guarded currency selection is cleared, disabling is safe.
  PERFORM public.replace_company_currencies_atomic(
    c, ARRAY[]::text[], ARRAY['CAD','EUR']::text[]
  );
  PERFORM public.set_organisation_feature(c, 'multicurrency', false);
  IF (SELECT enabled FROM public.organisation_features
      WHERE company_id=c AND feature_key='multicurrency') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Safe disable did not persist';
  END IF;

  -- A direct currency INSERT must not evade the feature guard once disabled.
  BEGIN
    INSERT INTO public.company_currencies(company_id, currency_code)
    VALUES (c, 'USD');
    RAISE EXCEPTION 'Direct currency insertion bypassed disabled feature';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Enable multicurrency before adding%' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.company_currencies WHERE company_id=c) THEN
    RAISE EXCEPTION 'Rejected direct INSERT left a currency row';
  END IF;

  -- The atomic RPC must obey the same DB constraint; re-enable first.
  BEGIN
    PERFORM public.replace_company_currencies_atomic(
      c, ARRAY['USD']::text[], ARRAY[]::text[]
    );
    RAISE EXCEPTION 'Currency RPC bypassed explicitly disabled feature';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Enable multicurrency before adding%' THEN RAISE; END IF;
  END;

  PERFORM public.set_organisation_feature(c, 'multicurrency', true);
  PERFORM public.replace_company_currencies_atomic(
    c, ARRAY['USD']::text[], ARRAY[]::text[]
  );
  BEGIN
    PERFORM public.set_organisation_feature(c, 'multicurrency', false);
    RAISE EXCEPTION 'A newly configured currency did not prevent disabling';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Multicurrency cannot be disabled%' THEN RAISE; END IF;
  END;
  PERFORM public.replace_company_currencies_atomic(
    c, ARRAY[]::text[], ARRAY['USD']::text[]
  );
  PERFORM public.set_organisation_feature(c, 'multicurrency', false);

  -- Existing transaction + audit guarantees must still roll back mutations.
  PERFORM set_config('test.fail_audit', 'on', true);
  BEGIN
    PERFORM public.set_organisation_feature(c, 'multicurrency', true);
    RAISE EXCEPTION 'Feature audit failure was not propagated';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Injected audit failure%' THEN RAISE; END IF;
  END;
  PERFORM set_config('test.fail_audit', 'off', true);
  IF (SELECT enabled FROM public.organisation_features
      WHERE company_id=c AND feature_key='multicurrency') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Audit failure failed to roll back feature change';
  END IF;
END $$;

-- Independently prove the guard applies to company B.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002"}', false);
DO $$
BEGIN
  BEGIN
    PERFORM public.set_organisation_feature(
      '10000000-0000-4000-8000-000000000002', 'multicurrency', false
    );
    RAISE EXCEPTION 'Second tenant bypassed configured currency guard';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Multicurrency cannot be disabled%' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;
DO $$
BEGIN
  IF has_function_privilege(
    'anon', 'public.guard_multicurrency_feature_disable()', 'EXECUTE'
  ) OR has_function_privilege(
    'anon', 'public.set_organisation_feature(uuid,text,boolean,jsonb,text,text)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Anonymous feature guard or mutation execution is enabled';
  END IF;
END $$;

SELECT 'PASS: multicurrency disable blocked transactionally; rollback and tenant protection verified' AS result;
