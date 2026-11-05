-- PostgreSQL-only regression for Accounting lock-policy compare-and-set.
-- Run only in the isolated Docker workflow fixture, never against live tenants.
SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001"}', false);

DO $$
DECLARE
  c uuid := '10000000-0000-4000-8000-000000000001';
  other_c uuid := '10000000-0000-4000-8000-000000000002';
  v1 bigint;
  v2 bigint;
  v3 bigint;
  audit_before integer;
BEGIN
  -- A missing row may be created only with a NULL version.
  BEGIN
    PERFORM public.set_organisation_lock_policy_if_unchanged(
      c, 9, '2026-01-31', NULL, NULL, true, 'Initial period close'
    );
    RAISE EXCEPTION 'A missing lock policy accepted a stale version';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%changed in another session%' THEN RAISE; END IF;
  END;

  v1 := (public.set_organisation_lock_policy_if_unchanged(
    c, NULL, '2026-01-31', NULL, NULL, true, 'Initial period close'
  )->>'version')::bigint;
  IF v1 < 2 THEN RAISE EXCEPTION 'Initial policy did not advance the version'; END IF;

  -- Two editors loaded v1; only the first save can commit.
  v2 := (public.set_organisation_lock_policy_if_unchanged(
    c, v1, '2026-02-28', NULL, NULL, false, 'Second period close'
  )->>'version')::bigint;
  IF v2 <= v1 THEN RAISE EXCEPTION 'Valid update did not advance the version'; END IF;
  SELECT count(*) INTO audit_before FROM public.settings_change_log
  WHERE company_id=c AND setting_key='lock_policy';

  BEGIN
    PERFORM public.set_organisation_lock_policy_if_unchanged(
      c, v1, '2026-03-31', NULL, NULL, true, 'Stale editor'
    );
    RAISE EXCEPTION 'Stale lock-policy save overwrote the newer value';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%changed in another session%' THEN RAISE; END IF;
  END;
  IF (SELECT lock_date_everyone FROM public.organisation_lock_policy
      WHERE company_id=c) <> DATE '2026-02-28' THEN
    RAISE EXCEPTION 'Stale policy mutated a saved lock date';
  END IF;
  IF (SELECT count(*) FROM public.settings_change_log
      WHERE company_id=c AND setting_key='lock_policy') <> audit_before THEN
    RAISE EXCEPTION 'Rejected stale save recorded an audit entry';
  END IF;

  -- The legacy RPC must also increment version to invalidate fresh-client drafts.
  PERFORM public.set_organisation_lock_policy(
    c, '2026-03-31', NULL, NULL, true, 'Legacy client updates'
  );
  SELECT version INTO v3 FROM public.organisation_lock_policy WHERE company_id=c;
  IF v3 <= v2 THEN RAISE EXCEPTION 'Legacy write failed to advance version'; END IF;
  BEGIN
    PERFORM public.set_organisation_lock_policy_if_unchanged(
      c, v2, '2026-04-30', NULL, NULL, true, 'Stale after legacy write'
    );
    RAISE EXCEPTION 'Legacy write failed to invalidate expected version';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%changed in another session%' THEN RAISE; END IF;
  END;

  -- Rejected audit writes must roll back policy changes and version increments.
  PERFORM set_config('test.fail_audit','on',true);
  BEGIN
    PERFORM public.set_organisation_lock_policy_if_unchanged(
      c, v3, '2026-04-30', NULL, NULL, true, 'Audit failure test'
    );
    RAISE EXCEPTION 'Missing audit failure';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Injected audit failure%' THEN RAISE; END IF;
  END;
  PERFORM set_config('test.fail_audit','off',true);
  IF (SELECT version FROM public.organisation_lock_policy
      WHERE company_id=c) <> v3 THEN
    RAISE EXCEPTION 'Failed audit did not roll back lock-policy version';
  END IF;

  -- Cross-tenant calls remain denied before any data mutation.
  BEGIN
    PERFORM public.set_organisation_lock_policy_if_unchanged(
      other_c, NULL, '2026-01-31', NULL, NULL, true, 'Cross-tenant attempt'
    );
    RAISE EXCEPTION 'Cross-tenant lock-policy write allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%permission%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.set_organisation_lock_policy_if_unchanged(uuid,bigint,date,date,date,boolean,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Anonymous lock-policy RPC access was enabled';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organisation_lock_policy
    WHERE company_id='10000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'Cross-tenant policy was inserted';
  END IF;
END $$;

SELECT 'PASS: lock-policy optimistic concurrency, rollback, legacy version, tenant isolation' AS result;
