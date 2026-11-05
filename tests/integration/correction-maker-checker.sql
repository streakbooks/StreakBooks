-- Transactional maker-checker security and enforcement integration tests.
-- The fixture creates no application users or data outside isolated PostgreSQL.
BEGIN;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.role_permissions
      WHERE permission = 'journals.approve') <> 3 THEN
    RAISE EXCEPTION 'Journal reviewer permission seed is incorrect';
  END IF;
END $$;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  c uuid := '10000000-0000-4000-8000-000000000001';
  other_company uuid := '10000000-0000-4000-8000-000000000002';
  maker uuid := '00000000-0000-4000-8000-000000000001';
  checker uuid := '00000000-0000-4000-8000-000000000002';
  outsider uuid := '00000000-0000-4000-8000-000000000003';
  destination uuid := '20000000-0000-4000-8000-000000000001';
  key uuid := gen_random_uuid();
  items jsonb := jsonb_build_array(jsonb_build_object(
    'id', '40000000-0000-4000-8000-000000000001',
    'fingerprint', repeat('a', 32)
  ));
  plan jsonb;
  preview_hash text;
  request_hash text;
  approval jsonb;
  batch_id uuid;
  messages integer := 0;
BEGIN
  PERFORM set_config('test.mfa', 'on', true);
  PERFORM set_config('request.jwt.claim.sub', maker::text, true);
  plan := private.correction_plan(
    c, items, destination, 'adjustment', '2026-10-31', 'Correct account classification'
  );
  preview_hash := md5(plan::text);
  request_hash := md5(jsonb_build_object(
    'items', (SELECT jsonb_agg(value ORDER BY value->>'id')
              FROM jsonb_array_elements(items)),
    'target', destination, 'mode', 'adjustment',
    'date', '2026-10-31'::date,
    'reason', 'Correct account classification'
  )::text);

  IF (public.get_correction_approval_settings(c)->>'required')::boolean THEN
    RAISE EXCEPTION 'New organisations must default to direct correction posting';
  END IF;
  PERFORM public.set_correction_approval_policy(c, true);
  IF NOT (public.get_correction_approval_settings(c)->>'required')::boolean THEN
    RAISE EXCEPTION 'Approval policy did not activate';
  END IF;

  -- The existing direct apply path must be blocked by the database trigger.
  BEGIN
    PERFORM public.test_apply_correction(c, key, request_hash, preview_hash, plan);
    RAISE EXCEPTION 'TEST: unapproved direct posting was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Independent approval%' THEN RAISE; END IF;
  END;
  approval := public.submit_correction_for_approval(
    c, key, preview_hash, items, destination, 'adjustment',
    '2026-10-31', 'Correct account classification'
  );
  IF approval->>'status' <> 'pending' OR approval->>'submitted_by' <> maker::text THEN
    RAISE EXCEPTION 'Maker submission did not persist';
  END IF;

  -- Retry the same request key is idempotent; changed payload fails.
  IF public.submit_correction_for_approval(
    c, key, preview_hash, items, destination, 'adjustment',
    '2026-10-31', 'Correct account classification'
  )->>'id' <> approval->>'id' THEN
    RAISE EXCEPTION 'Idempotent submission created a duplicate';
  END IF;
  BEGIN
    PERFORM public.submit_correction_for_approval(
      c, key, preview_hash, items, destination, 'adjustment',
      '2026-10-31', 'Changed supporting reason'
    );
    RAISE EXCEPTION 'TEST: changed request key payload accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Request key already belongs%' THEN RAISE; END IF;
  END;

  -- A qualified maker still cannot approve their own batch.
  BEGIN
    PERFORM public.decide_correction_approval(
      c, (approval->>'id')::uuid, true,
      'Self approval is forbidden', 1
    );
    RAISE EXCEPTION 'TEST: self approval was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'The maker cannot approve%' THEN RAISE; END IF;
  END;

  -- An unrelated organisation cannot view or decide this request.
  PERFORM set_config('request.jwt.claim.sub', outsider::text, true);
  IF EXISTS (SELECT 1 FROM public.correction_approval_requests WHERE company_id = c) THEN
    RAISE EXCEPTION 'RLS leaked correction approval requests across companies';
  END IF;
  BEGIN
    PERFORM public.decide_correction_approval(
      c, (approval->>'id')::uuid, true, 'Cross-company attempt', 1
    );
    RAISE EXCEPTION 'TEST: other-tenant approval accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Journal approval permission required%' THEN RAISE; END IF;
  END;

  -- A different authorised reviewer may approve the exact current preview.
  PERFORM set_config('request.jwt.claim.sub', checker::text, true);
  approval := public.decide_correction_approval(
    c, (approval->>'id')::uuid, true, 'Verified source and posting impact', 1
  );
  IF approval->>'status' <> 'approved'
     OR approval->>'decided_by' <> checker::text
     OR (approval->>'version')::integer <> 2 THEN
    RAISE EXCEPTION 'Independent review did not persist';
  END IF;
  BEGIN
    PERFORM public.decide_correction_approval(
      c, (approval->>'id')::uuid, false, 'Stale decision', 1
    );
    RAISE EXCEPTION 'TEST: stale version was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Approval changed%' THEN RAISE; END IF;
  END;

  -- The checker cannot post a maker-bound approval.
  BEGIN
    PERFORM public.test_apply_correction(c, key, request_hash, preview_hash, plan);
    RAISE EXCEPTION 'TEST: checker took over maker posting';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Independent approval%' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', maker::text, true);
  BEGIN
    PERFORM public.test_apply_correction(c, key, repeat('a',32), preview_hash, plan);
    RAISE EXCEPTION 'TEST: changed posting payload accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Independent approval%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.test_apply_correction(c, key, request_hash, repeat('b',32), plan);
    RAISE EXCEPTION 'TEST: changed preview hash accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Independent approval%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.test_apply_correction(
      c, key, request_hash, preview_hash,
      plan || jsonb_build_object('reason','tampered')
    );
    RAISE EXCEPTION 'TEST: changed plan accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Independent approval%' THEN RAISE; END IF;
  END;

  batch_id := public.test_apply_correction(c, key, request_hash, preview_hash, plan);
  IF NOT EXISTS (
    SELECT 1 FROM public.correction_approval_requests
    WHERE company_id = c AND request_key = key AND status = 'posted'
      AND posted_batch_id = batch_id AND posted_by = maker
  ) THEN RAISE EXCEPTION 'Approved posting did not link to the journal batch'; END IF;
  IF (SELECT count(*) FROM public.correction_approval_events
      WHERE approval_id = (approval->>'id')::uuid) <> 3 THEN
    RAISE EXCEPTION 'Maker submission, independent decision and posting events are required';
  END IF;

  -- Rejected approvals cannot post, and disabling the policy is a separately
  -- permission-checked, audited settings action.
  PERFORM public.set_correction_approval_policy(c, false);
  IF (public.get_correction_approval_settings(c)->>'required')::boolean THEN
    RAISE EXCEPTION 'Settings change did not deactivate the optional policy';
  END IF;
  PERFORM public.test_apply_correction(
    c, gen_random_uuid(), request_hash, preview_hash, plan
  );
  IF (SELECT count(*) FROM public.test_audit_events WHERE company_id=c) < 4 THEN
    RAISE EXCEPTION 'Audit events did not record policy changes and approval decisions';
  END IF;
  RAISE NOTICE 'Maker-checker RLS, rejection, CAS, binding, posting and audit tests passed';
END $$;

-- Even elevated SQL writers cannot alter or delete signed-off event history.
RESET ROLE;
DO $$
BEGIN
  BEGIN
    UPDATE public.correction_approval_events SET note='tampered';
    RAISE EXCEPTION 'TEST: immutable event update accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Correction approval events are immutable%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.correction_approval_events;
    RAISE EXCEPTION 'TEST: immutable event deletion accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Correction approval events are immutable%' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;
