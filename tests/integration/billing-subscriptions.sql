-- Billing phase 4 assertions: lifecycle history, cancellation, legal documents, pause/resume and
-- the lifecycle sweep. Runs after billing-pricing.sql on the same database.
\set ON_ERROR_STOP 1
SET client_min_messages = notice;

CREATE FUNCTION pg_temp.ok(_cond boolean, _label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT coalesce(_cond, false) THEN RAISE EXCEPTION 'FAIL %', _label; END IF;
  RAISE NOTICE 'PASS %', _label;
END $$;
CREATE FUNCTION pg_temp.expect_error(_sql text, _state text, _label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE _sql;
  EXCEPTION WHEN others THEN
    IF SQLSTATE <> _state THEN
      RAISE EXCEPTION 'FAIL %: expected SQLSTATE % but got % (%)', _label, _state, SQLSTATE, SQLERRM;
    END IF;
    RAISE NOTICE 'PASS %', _label;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL %: expected SQLSTATE % but the statement succeeded', _label, _state;
END $$;
CREATE FUNCTION pg_temp.act(_uid text, _aal text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    CASE WHEN _uid IS NULL THEN '' ELSE json_build_object('sub', _uid, 'role', 'authenticated', 'aal', _aal)::text END,
    false);
$$;
CREATE FUNCTION pg_temp.sub(_company uuid) RETURNS public.company_subscriptions LANGUAGE sql SECURITY DEFINER AS $$
  SELECT * FROM public.company_subscriptions WHERE company_id = _company;
$$;
CREATE FUNCTION pg_temp.history(_company uuid) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT string_agg(event_type || '/' || source, ' > ' ORDER BY id) FROM billing.subscription_events WHERE company_id = _company;
$$;
CREATE FUNCTION pg_temp.make_due(_company uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  ALTER TABLE billing.cancellation_requests DISABLE TRIGGER cancellation_requests_guard;
  UPDATE billing.cancellation_requests SET effective_at = now() - interval '1 minute'
   WHERE company_id = _company AND status = 'scheduled';
  ALTER TABLE billing.cancellation_requests ENABLE TRIGGER cancellation_requests_guard;
END $$;
SELECT pg_temp.act(NULL, NULL);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000b4', 'life-owner@example.test'),
  ('00000000-0000-0000-0000-0000000000b5', 'life-staff@example.test'),
  ('00000000-0000-0000-0000-0000000000b6', 'life-other@example.test');
INSERT INTO public.companies (id, name, created_by, country_code)
  VALUES ('30000000-0000-0000-0000-000000000001', 'Lifecycle One', '00000000-0000-0000-0000-0000000000b4', 'GB');
INSERT INTO public.company_members (company_id, user_id, role, status) VALUES
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b4', 'owner', 'active'),
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b5', 'staff', 'active');

-- ---------------------------------------------------------------- history
SELECT pg_temp.ok((SELECT event_type = 'trial_started' AND source = 'migration' FROM billing.subscription_events
  WHERE idempotency_key = 'backfill:10000000-0000-0000-0000-00000000000a'), 'Existing trials are backfilled into history');
SELECT pg_temp.ok(pg_temp.history('30000000-0000-0000-0000-000000000001') = 'trial_started/system',
  'A new organisation''s trial is recorded');
SELECT pg_temp.expect_error($$UPDATE billing.subscription_events SET source = 'job'$$, '55000', 'History is append-only');

-- ---------------------------------------------------------------- state and permissions
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000b5', 'aal1');
SELECT pg_temp.expect_error($$SELECT public.billing_subscription_state('30000000-0000-0000-0000-000000000001')$$, '42501',
  'Staff without billing access cannot see the subscription');
SELECT pg_temp.expect_error($$SELECT public.billing_cancel_subscription('30000000-0000-0000-0000-000000000001', true, NULL, NULL, NULL, NULL)$$,
  '42501', 'Staff cannot cancel');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000b4', 'aal1');
SELECT pg_temp.ok((SELECT s->>'status' = 'trialing' AND s->>'access' = 'full' AND (s->'eligibility'->>'allowed')::boolean
  AND (s->'eligibility'->>'effectiveAt')::timestamptz = (pg_temp.sub('30000000-0000-0000-0000-000000000001')).trial_ends_at
  AND s->'policy' = 'null'::jsonb AND (s->>'canManage')::boolean
  FROM (SELECT public.billing_subscription_state('30000000-0000-0000-0000-000000000001') AS s) x),
  'Owner sees a cancellable trial ending at the trial end date');

-- ---------------------------------------------------------------- cancellation and reversal
SELECT pg_temp.expect_error($$SELECT public.billing_cancel_subscription('30000000-0000-0000-0000-000000000001', false, NULL, NULL, NULL, NULL)$$,
  '22023', 'Cancellation needs explicit confirmation');
SELECT pg_temp.expect_error($$SELECT public.billing_cancel_subscription('30000000-0000-0000-0000-000000000001', true, NULL, 'bored', NULL, NULL)$$,
  '22023', 'Unknown reason codes are refused');
SELECT pg_temp.expect_error($$SELECT public.billing_cancel_subscription('30000000-0000-0000-0000-000000000001', true, gen_random_uuid(), NULL, NULL, NULL)$$,
  '40001', 'A policy that is not the current one is refused');
SELECT pg_temp.ok((public.billing_cancel_subscription('30000000-0000-0000-0000-000000000001', true, NULL, 'not_using', 'Trying it out', NULL)->>'status') = 'scheduled',
  'Trial cancellation is scheduled for the trial end');
SELECT pg_temp.ok((pg_temp.sub('30000000-0000-0000-0000-000000000001')).status = 'trialing'
  AND (pg_temp.sub('30000000-0000-0000-0000-000000000001')).cancel_at_period_end
  AND public.subscription_allows_posting('30000000-0000-0000-0000-000000000001'), 'Access stays full until the effective date');
SELECT pg_temp.expect_error($$SELECT public.billing_cancel_subscription('30000000-0000-0000-0000-000000000001', true, NULL, NULL, NULL, NULL)$$,
  'P0001', 'A second cancellation is refused');
SELECT pg_temp.ok((public.billing_reverse_cancellation('30000000-0000-0000-0000-000000000001')->>'status') = 'reversed'
  AND NOT (pg_temp.sub('30000000-0000-0000-0000-000000000001')).cancel_at_period_end, 'Cancellation can be reversed before it takes effect');
SELECT pg_temp.expect_error($$SELECT public.billing_reverse_cancellation('30000000-0000-0000-0000-000000000001')$$,
  'P0001', 'Nothing to reverse twice');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000b1', 'aal1');
SELECT pg_temp.expect_error($$SELECT public.billing_cancel_subscription('10000000-0000-0000-0000-00000000000b', true, NULL, NULL, NULL, NULL)$$,
  'P0001', 'Card and mandate subscriptions are cancelled through the payment provider');
RESET ROLE;
INSERT INTO public.companies (id, name, created_by, country_code, is_demo)
  VALUES ('30000000-0000-0000-0000-000000000002', 'Demo Company Ltd', '00000000-0000-0000-0000-0000000000b6', 'GB', true);
INSERT INTO public.company_members (company_id, user_id, role, status)
  VALUES ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b6', 'owner', 'active');
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000b6', 'aal1');
SELECT pg_temp.expect_error($$SELECT public.billing_cancel_subscription('30000000-0000-0000-0000-000000000002', true, NULL, NULL, NULL, NULL)$$,
  'P0001', 'Demo organisations are not billed');

-- ---------------------------------------------------------------- legal documents
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT public.platform_draft_legal_document('CANCELLATION_POLICY', 'en', 'Cancellation policy',
  'Synthetic test text that stands in for reviewed legal wording.', 'Test draft')->>'id' AS policy_id \gset
SELECT pg_temp.expect_error($$SELECT public.platform_draft_legal_document('CANCELLATION_POLICY', 'en', 'Short', 'Too short', 'x reason')$$,
  '22023', 'Document text has a minimum length');
SELECT pg_temp.expect_error(format($$SELECT public.platform_approve_legal_document(%L, 'self')$$, :'policy_id'), '42501',
  'The author cannot approve their own text');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f1', 'aal2');
SELECT pg_temp.expect_error(format($$SELECT public.platform_approve_legal_document(%L, 'finance')$$, :'policy_id'), '42501',
  'Finance staff cannot approve legal text');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f3', 'aal2');
SELECT pg_temp.ok((public.platform_approve_legal_document(:'policy_id', 'Reviewed by counsel')->>'requiresLegalReview')::boolean = false,
  'A second owner approves and clears the legal-review flag');
SELECT pg_temp.expect_error(format($$SELECT public.platform_approve_legal_document(%L, 'again')$$, :'policy_id'), '22023',
  'Approval happens once');
SELECT pg_temp.ok((public.platform_publish_legal_document(:'policy_id', 'Publish')->>'status') = 'published', 'Approved text is published');
RESET ROLE;
SELECT pg_temp.expect_error(format($$UPDATE billing.legal_documents SET body = body || ' changed' WHERE id = %L$$, :'policy_id'),
  '55000', 'Published text cannot change');
SELECT pg_temp.expect_error(format($$DELETE FROM billing.legal_documents WHERE id = %L$$, :'policy_id'),
  '55000', 'Published text cannot be deleted');
SELECT pg_temp.ok((SELECT body_sha256 = encode(extensions.digest(convert_to(body, 'UTF8'), 'sha256'), 'hex')
  FROM billing.legal_documents WHERE id = :'policy_id'), 'The stored hash matches the text');
SET ROLE anon;
SELECT pg_temp.ok(jsonb_array_length(public.billing_published_legal_documents(ARRAY['CANCELLATION_POLICY'], 'en')) = 1,
  'Published documents are public');
SELECT pg_temp.expect_error($$SELECT public.platform_legal_documents()$$, '42501', 'Drafts are not public');
SELECT pg_temp.expect_error('SELECT * FROM billing.legal_acceptances', '42501', 'Acceptances are not readable by clients');
RESET ROLE;

-- ---------------------------------------------------------------- cancellation with a published policy
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000b4', 'aal1');
SELECT pg_temp.ok((public.billing_subscription_state('30000000-0000-0000-0000-000000000001')->'policy'->>'id') = :'policy_id',
  'The customer is shown the current policy');
SELECT pg_temp.expect_error($$SELECT public.billing_cancel_subscription('30000000-0000-0000-0000-000000000001', true, NULL, NULL, NULL, NULL)$$,
  '40001', 'Cancelling without seeing the new policy is refused');
SELECT public.billing_cancel_subscription('30000000-0000-0000-0000-000000000001', true, :'policy_id', 'other', NULL,
  repeat('a', 64))->>'requestId' AS request_id \gset
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000b5', 'aal1');
SELECT pg_temp.expect_error(format($$SELECT public.billing_record_cancellation_notice(%L, ARRAY['x@example.test'], 's', 'resend', NULL, 'sent', NULL)$$, :'request_id'),
  '42501', 'Only the person who cancelled records the notice');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000b4', 'aal1');
SELECT public.billing_record_cancellation_notice(:'request_id', ARRAY['life-owner@example.test'], 'Cancellation scheduled',
  'resend', 'msg_1', 'sent', NULL);
RESET ROLE;
SELECT pg_temp.ok((SELECT policy_version = 1 AND notice_status = 'sent' FROM billing.cancellation_requests WHERE id = :'request_id')
  AND EXISTS (SELECT 1 FROM billing.legal_acceptances WHERE context = 'cancellation' AND document_id = :'policy_id'
    AND user_id = '00000000-0000-0000-0000-0000000000b4')
  AND EXISTS (SELECT 1 FROM public.email_outbox WHERE entity_id = :'request_id' AND status = 'sent'),
  'Policy version, acceptance and notice are recorded');
SELECT pg_temp.expect_error(format($$UPDATE billing.cancellation_requests SET reason_text = 'edited' WHERE id = %L$$, :'request_id'),
  '55000', 'Cancellation requests cannot be edited');

-- ---------------------------------------------------------------- lifecycle sweep
SELECT pg_temp.make_due('30000000-0000-0000-0000-000000000001');
SELECT pg_temp.ok((billing.run_lifecycle_sweep()->>'cancelled')::int = 1, 'A due cancellation takes effect');
SELECT pg_temp.ok((pg_temp.sub('30000000-0000-0000-0000-000000000001')).status = 'cancelled'
  AND NOT public.subscription_allows_posting('30000000-0000-0000-0000-000000000001'), 'The organisation becomes read-only');
SELECT pg_temp.ok(pg_temp.history('30000000-0000-0000-0000-000000000001') LIKE '%cancellation_scheduled/customer > cancelled/job',
  'History records who cancelled and when it took effect');
SELECT pg_temp.ok((billing.run_lifecycle_sweep()->>'cancelled')::int = 0, 'The sweep is idempotent');

INSERT INTO public.companies (id, name, created_by, country_code)
  VALUES ('30000000-0000-0000-0000-000000000003', 'Lifecycle Two', '00000000-0000-0000-0000-0000000000b6', 'GB');
SELECT pg_temp.ok((pg_temp.sub('30000000-0000-0000-0000-000000000003')).status = 'trialing', 'Demo use does not consume a trial');
UPDATE public.company_subscriptions SET trial_ends_at = now() - interval '1 hour' WHERE company_id = '30000000-0000-0000-0000-000000000003';
SELECT pg_temp.ok((billing.run_lifecycle_sweep()->>'trialsExpired')::int = 1
  AND (pg_temp.sub('30000000-0000-0000-0000-000000000003')).status = 'expired', 'An ended trial is marked expired');

UPDATE public.company_subscriptions SET scheduled_plan_code = 'standard', scheduled_at = now() - interval '1 minute'
 WHERE company_id = '10000000-0000-0000-0000-00000000000a';
SELECT pg_temp.ok((billing.run_lifecycle_sweep()->>'downgradesApplied')::int = 1
  AND (pg_temp.sub('10000000-0000-0000-0000-00000000000a')).plan_code = 'standard'
  AND (pg_temp.sub('10000000-0000-0000-0000-00000000000a')).price_version_id =
      (SELECT id FROM public.plan_versions WHERE plan_code = 'standard' AND status = 'published'),
  'A due downgrade applies the published version');

UPDATE public.company_subscriptions SET status = 'past_due' WHERE company_id = '10000000-0000-0000-0000-00000000000b';
SELECT pg_temp.ok((billing.run_lifecycle_sweep()->>'pastDueAlerts')::int = 1, 'Past-due subscriptions raise an alert');
SELECT pg_temp.ok((billing.run_lifecycle_sweep()->>'pastDueAlerts')::int = 0, 'The alert fires once per period');
SELECT pg_temp.ok((pg_temp.sub('10000000-0000-0000-0000-00000000000b')).status = 'past_due',
  'Past-due subscriptions are not expired on an invented schedule');
UPDATE public.company_subscriptions SET status = 'active' WHERE company_id = '10000000-0000-0000-0000-00000000000b';

-- ---------------------------------------------------------------- platform worker
SELECT pg_temp.act(NULL, NULL);
UPDATE private.platform_job_schedules SET next_run_at = now() - interval '1 minute' WHERE kind = 'billing_lifecycle';
SELECT pg_temp.ok((private.platform_worker_tick()->>'processed')::int >= 1, 'The platform worker runs the lifecycle job');
SELECT pg_temp.ok((SELECT status = 'succeeded' AND result ? 'trialsExpired' FROM public.platform_jobs
  WHERE kind = 'billing_lifecycle' ORDER BY created_at DESC LIMIT 1), 'The lifecycle job succeeded with a result');

-- ---------------------------------------------------------------- pause and resume
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000a1', 'aal2');
SELECT pg_temp.expect_error($$SELECT public.platform_pause_subscription('10000000-0000-0000-0000-00000000000a', 'customer')$$,
  '42501', 'Customers cannot pause');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT pg_temp.expect_error($$SELECT public.platform_pause_subscription('10000000-0000-0000-0000-00000000000b', 'card')$$,
  '22023', 'Provider subscriptions are paused at the provider');
SELECT public.platform_pause_subscription('10000000-0000-0000-0000-00000000000a', 'Support request');
RESET ROLE;
SELECT pg_temp.ok((pg_temp.sub('10000000-0000-0000-0000-00000000000a')).status = 'paused'
  AND NOT public.subscription_allows_posting('10000000-0000-0000-0000-00000000000a'), 'Paused organisations are read-only');
SET ROLE authenticated;
SELECT public.platform_resume_subscription('10000000-0000-0000-0000-00000000000a', 'Support resolved');
RESET ROLE;
SELECT pg_temp.ok((pg_temp.sub('10000000-0000-0000-0000-00000000000a')).status = 'trialing'
  AND public.subscription_allows_posting('10000000-0000-0000-0000-00000000000a'), 'Resume restores the previous status');
SELECT pg_temp.ok(pg_temp.history('10000000-0000-0000-0000-00000000000a') LIKE '%paused/platform > resumed/platform',
  'Pause and resume are in the history');

-- ---------------------------------------------------------------- audit
SELECT pg_temp.ok((SELECT count(*) FROM public.platform_billing_audit WHERE action LIKE 'subscription.%') >= 6,
  'Lifecycle changes are written to the billing audit');
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f1', 'aal2');
SELECT pg_temp.ok((public.platform_verify_billing_audit_chain()->>'valid')::boolean IS NOT NULL, 'Audit chain verifier runs');
RESET ROLE;
