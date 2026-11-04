-- Run in an isolated PostgreSQL container only. All changes stay in this fixture.
-- Uses the two companies and owner identities from accounting-workflows.sql.
INSERT INTO public.test_permissions (company_id, user_id, permission) VALUES
 ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'company.settings.edit'),
 ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'company.settings.edit');

INSERT INTO public.company_currencies(company_id,currency_code) VALUES
 ('10000000-0000-4000-8000-000000000001','USD'),
 ('10000000-0000-4000-8000-000000000001','CAD'),
 ('10000000-0000-4000-8000-000000000002','AUD');

CREATE FUNCTION public.test_currency_insert_failure()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('test.fail_currency', true) = 'on'
     AND NEW.currency_code = 'INR' THEN
    RAISE EXCEPTION 'Injected currency insert failure';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER fixture_currency_failure BEFORE INSERT ON public.company_currencies
 FOR EACH ROW EXECUTE FUNCTION public.test_currency_insert_failure();

SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001"}',false);

DO $$
DECLARE
  company_id uuid := '10000000-0000-4000-8000-000000000001';
  other_company_id uuid := '10000000-0000-4000-8000-000000000002';
  saved text[];
  actual text[];
BEGIN
  saved := public.replace_company_currencies_atomic(
    company_id, ARRAY['EUR','CAD','EUR'], ARRAY['CAD','USD']
  );
  IF saved <> ARRAY['CAD','EUR'] THEN
    RAISE EXCEPTION 'Atomic currency save returned unexpected selection: %', saved;
  END IF;
  SELECT array_agg(btrim(currency_code::text) ORDER BY currency_code) INTO actual
    FROM public.company_currencies WHERE company_currencies.company_id=company_id;
  IF actual <> ARRAY['CAD','EUR'] THEN
    RAISE EXCEPTION 'Atomic currency replace failed: %', actual;
  END IF;

  -- Retry from an outdated browser must not clobber newer values.
  BEGIN
    PERFORM public.replace_company_currencies_atomic(
      company_id, ARRAY['INR'], ARRAY['CAD','USD']
    );
    RAISE EXCEPTION 'Stale edit was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%changed in another session%' THEN RAISE; END IF;
  END;

  -- Insert failure must roll back the deletion, not leave the company empty.
  PERFORM set_config('test.fail_currency', 'on', true);
  BEGIN
    PERFORM public.replace_company_currencies_atomic(
      company_id, ARRAY['INR'], ARRAY['CAD','EUR']
    );
    RAISE EXCEPTION 'Injected insert failure was ignored';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Injected currency insert failure%' THEN RAISE; END IF;
  END;
  PERFORM set_config('test.fail_currency', 'off', true);

  -- Audit failure must also roll back the currency changes.
  PERFORM set_config('test.fail_audit', 'on', true);
  BEGIN
    PERFORM public.replace_company_currencies_atomic(
      company_id, ARRAY['NZD'], ARRAY['CAD','EUR']
    );
    RAISE EXCEPTION 'Injected audit failure was ignored';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Injected audit failure%' THEN RAISE; END IF;
  END;
  PERFORM set_config('test.fail_audit', 'off', true);

  SELECT array_agg(btrim(currency_code::text) ORDER BY currency_code) INTO actual
    FROM public.company_currencies WHERE company_currencies.company_id=company_id;
  IF actual <> ARRAY['CAD','EUR'] THEN
    RAISE EXCEPTION 'Failed save changed the currency set: %', actual;
  END IF;

  -- No company owner can modify another tenant's currencies.
  BEGIN
    PERFORM public.replace_company_currencies_atomic(
      other_company_id, ARRAY['CAD'], ARRAY['AUD']
    );
    RAISE EXCEPTION 'Cross-tenant write was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Invalid codes are rejected without changing the saved selection.
  BEGIN
    PERFORM public.replace_company_currencies_atomic(
      company_id, ARRAY['CA1'], ARRAY['CAD','EUR']
    );
    RAISE EXCEPTION 'Invalid currency was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%three uppercase letters%' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;
DO $$
DECLARE
  codes text[];
BEGIN
  SELECT array_agg(btrim(currency_code::text) ORDER BY currency_code) INTO codes
  FROM public.company_currencies
  WHERE company_id='10000000-0000-4000-8000-000000000002';
  IF codes <> ARRAY['AUD'] THEN RAISE EXCEPTION 'Cross-tenant list changed'; END IF;
  IF has_function_privilege(
    'anon', 'public.replace_company_currencies_atomic(uuid,text[],text[])', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Anonymous currency mutation access is enabled';
  END IF;
END $$;

SELECT 'PASS: currency replacement is atomic, audited, tenant-scoped and stale-edit-safe' AS result;
