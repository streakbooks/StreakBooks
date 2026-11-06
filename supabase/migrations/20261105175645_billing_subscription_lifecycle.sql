-- Billing platform, phase 4b: subscription lifecycle history, scheduled cancellation and reversal,
-- platform pause/resume, and a lifecycle sweep run by the existing platform worker.
-- Retry schedules, grace periods and reminder schedules are not invented: past-due subscriptions
-- keep the existing access rule and only raise an alert; no reminders are sent.
-- Card and mandate subscriptions are cancelled through the payment provider (Manage billing) until
-- phase 5 adds provider cancellation, so the provider never keeps charging a cancelled account.
-- Additive and idempotent.

-- ---------------------------------------------------------------------------
-- 1. Lifecycle history (one row per change, written by a trigger on every code path)
-- ---------------------------------------------------------------------------
ALTER TABLE public.company_subscriptions ADD COLUMN IF NOT EXISTS paused_from_status text;

CREATE TABLE IF NOT EXISTS billing.subscription_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id uuid NOT NULL,
  billing_account_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('created', 'status_changed', 'plan_changed', 'updated',
    'trial_started', 'trial_expired', 'cancellation_scheduled', 'cancellation_reversed', 'cancelled',
    'paused', 'resumed', 'downgrade_applied', 'past_due_alert')),
  from_status text,
  to_status text,
  from_plan text,
  to_plan text,
  source text NOT NULL CHECK (source IN ('customer', 'platform', 'job', 'provider', 'system', 'migration')),
  actor_user_id uuid,
  effective_at timestamptz,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_events_company_idx
  ON billing.subscription_events (company_id, occurred_at DESC, id DESC);

ALTER TABLE billing.subscription_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing.subscription_events FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON billing.subscription_events FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION billing.immutable_subscription_event() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Subscription history is append-only' USING ERRCODE = '55000';
END $$;
DROP TRIGGER IF EXISTS subscription_events_immutable ON billing.subscription_events;
CREATE TRIGGER subscription_events_immutable BEFORE UPDATE OR DELETE ON billing.subscription_events
  FOR EACH ROW EXECUTE FUNCTION billing.immutable_subscription_event();

-- Callers describe a change by setting billing.event_context (transaction-local JSON with type,
-- source, effectiveAt, details) immediately before the update and clearing it afterwards.
CREATE OR REPLACE FUNCTION billing.set_event_context(_context jsonb) RETURNS void
LANGUAGE sql SET search_path = '' AS $$
  SELECT set_config('billing.event_context', coalesce(_context::text, ''), true);
$$;

CREATE OR REPLACE FUNCTION billing.log_subscription_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  ctx jsonb := nullif(current_setting('billing.event_context', true), '')::jsonb;
  kind text;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.status, NEW.plan_code, NEW.cancel_at_period_end, NEW.scheduled_plan_code)
     IS NOT DISTINCT FROM (OLD.status, OLD.plan_code, OLD.cancel_at_period_end, OLD.scheduled_plan_code) THEN
    RETURN NEW;
  END IF;
  kind := coalesce(ctx ->> 'type', CASE
    WHEN TG_OP = 'INSERT' THEN CASE WHEN NEW.status = 'trialing' THEN 'trial_started' ELSE 'created' END
    WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'status_changed'
    WHEN NEW.plan_code IS DISTINCT FROM OLD.plan_code THEN 'plan_changed'
    ELSE 'updated' END);
  INSERT INTO billing.subscription_events (company_id, billing_account_id, event_type, from_status, to_status,
    from_plan, to_plan, source, actor_user_id, effective_at, details)
  VALUES (NEW.company_id,
    (SELECT l.billing_account_id FROM billing.billing_account_companies l WHERE l.company_id = NEW.company_id),
    kind,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.plan_code END, NEW.plan_code,
    coalesce(ctx ->> 'source', CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'customer' END),
    auth.uid(),
    nullif(ctx ->> 'effectiveAt', '')::timestamptz,
    coalesce(ctx -> 'details', '{}'::jsonb));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS company_subscriptions_history ON public.company_subscriptions;
CREATE TRIGGER company_subscriptions_history AFTER INSERT OR UPDATE ON public.company_subscriptions
  FOR EACH ROW EXECUTE FUNCTION billing.log_subscription_change();

INSERT INTO billing.subscription_events (company_id, billing_account_id, event_type, to_status, to_plan, source,
  effective_at, idempotency_key, occurred_at)
SELECT s.company_id,
  (SELECT l.billing_account_id FROM billing.billing_account_companies l WHERE l.company_id = s.company_id),
  CASE WHEN s.trial_started_at IS NOT NULL THEN 'trial_started' ELSE 'created' END,
  s.status, s.plan_code, 'migration', s.trial_ends_at, 'backfill:' || s.company_id,
  coalesce(s.trial_started_at, s.started_at, s.updated_at)
  FROM public.company_subscriptions s
ON CONFLICT (idempotency_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Cancellation requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.cancellation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  billing_account_id uuid,
  requested_by uuid NOT NULL,
  policy_document_id uuid REFERENCES billing.legal_documents(id),
  policy_version integer,
  confirmed boolean NOT NULL CHECK (confirmed),
  reason_code text CHECK (reason_code IN ('too_expensive', 'missing_features', 'switching_provider', 'not_using',
    'business_closed', 'other')),
  reason_text text CHECK (char_length(reason_text) <= 1000),
  from_status text NOT NULL,
  plan_code text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  effective_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'effective', 'reversed')),
  completed_at timestamptz,
  reversed_at timestamptz,
  reversed_by uuid,
  notice_status text CHECK (notice_status IN ('sent', 'failed', 'not_configured')),
  notice_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS cancellation_requests_one_scheduled
  ON billing.cancellation_requests (company_id) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS cancellation_requests_due_idx
  ON billing.cancellation_requests (effective_at) WHERE status = 'scheduled';

ALTER TABLE billing.cancellation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing.cancellation_requests FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON billing.cancellation_requests FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION billing.guard_cancellation_request() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Cancellation requests are kept for the record' USING ERRCODE = '55000';
  END IF;
  IF (NEW.company_id, NEW.requested_by, NEW.policy_document_id, NEW.policy_version, NEW.confirmed, NEW.reason_code,
      NEW.reason_text, NEW.from_status, NEW.plan_code, NEW.requested_at, NEW.effective_at)
     IS DISTINCT FROM
     (OLD.company_id, OLD.requested_by, OLD.policy_document_id, OLD.policy_version, OLD.confirmed, OLD.reason_code,
      OLD.reason_text, OLD.from_status, OLD.plan_code, OLD.requested_at, OLD.effective_at) THEN
    RAISE EXCEPTION 'A cancellation request cannot be edited' USING ERRCODE = '55000';
  END IF;
  IF OLD.status <> NEW.status AND OLD.status <> 'scheduled' THEN
    RAISE EXCEPTION 'A completed cancellation request cannot change' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cancellation_requests_guard ON billing.cancellation_requests;
CREATE TRIGGER cancellation_requests_guard BEFORE UPDATE OR DELETE ON billing.cancellation_requests
  FOR EACH ROW EXECUTE FUNCTION billing.guard_cancellation_request();

-- Mirrors cancellationEligibility in src/lib/billing/domain/lifecycle.ts.
CREATE OR REPLACE FUNCTION billing.cancellation_eligibility(_sub public.company_subscriptions, _now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN _sub.company_id IS NULL THEN jsonb_build_object('allowed', false, 'reason', 'This organisation has no subscription.')
    WHEN _sub.status = 'complimentary' THEN jsonb_build_object('allowed', false, 'reason', 'Demo and complimentary organisations are not billed.')
    WHEN _sub.status IN ('cancelled', 'expired') THEN jsonb_build_object('allowed', false, 'reason', 'The subscription has already ended.')
    WHEN _sub.cancel_at_period_end OR EXISTS (SELECT 1 FROM billing.cancellation_requests r
           WHERE r.company_id = _sub.company_id AND r.status = 'scheduled')
      THEN jsonb_build_object('allowed', false, 'reason', 'Cancellation is already scheduled.')
    WHEN _sub.status = 'paused' THEN jsonb_build_object('allowed', false, 'reason', 'A paused subscription is managed by LinkBooks support.')
    WHEN _sub.provider IN ('stripe', 'razorpay') THEN jsonb_build_object('allowed', false,
      'reason', 'Cancel a card or mandate subscription from Manage billing so the payment provider stops charging.')
    WHEN _sub.status = 'trialing' THEN jsonb_build_object('allowed', true, 'effectiveAt', greatest(_now, coalesce(_sub.trial_ends_at, _now)))
    WHEN _sub.status = 'active' THEN jsonb_build_object('allowed', true, 'effectiveAt', greatest(_now, coalesce(_sub.current_period_end, _now)))
    WHEN _sub.status = 'past_due' THEN jsonb_build_object('allowed', true, 'effectiveAt', _now)
    ELSE jsonb_build_object('allowed', false, 'reason', 'This subscription cannot be cancelled here.')
  END;
$$;

CREATE OR REPLACE FUNCTION billing.apply_cancellation(_request_id uuid, _source text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  req billing.cancellation_requests%ROWTYPE;
BEGIN
  SELECT * INTO req FROM billing.cancellation_requests WHERE id = _request_id AND status = 'scheduled' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM billing.set_event_context(jsonb_build_object('type', 'cancelled', 'source', _source,
    'effectiveAt', req.effective_at, 'details', jsonb_build_object('requestId', req.id)));
  UPDATE public.company_subscriptions
     SET status = 'cancelled', cancel_at_period_end = false, updated_at = now()
   WHERE company_id = req.company_id AND status NOT IN ('cancelled', 'expired', 'complimentary');
  PERFORM billing.set_event_context(NULL);
  UPDATE billing.cancellation_requests SET status = 'effective', completed_at = now() WHERE id = req.id;
  PERFORM billing.write_audit('subscription.cancelled', 'subscription', req.company_id::text, req.billing_account_id,
    jsonb_build_object('status', req.from_status), jsonb_build_object('status', 'cancelled', 'requestId', req.id),
    'Scheduled cancellation took effect');
END $$;

-- ---------------------------------------------------------------------------
-- 3. Customer functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_subscription_state(_company_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  sub public.company_subscriptions%ROWTYPE;
  req billing.cancellation_requests%ROWTYPE;
  pol billing.legal_documents%ROWTYPE;
BEGIN
  IF NOT public.has_company_permission(_company_id, 'billing.view') THEN
    RAISE EXCEPTION 'You do not have permission to view billing for this organisation' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO sub FROM public.company_subscriptions WHERE company_id = _company_id;
  SELECT * INTO req FROM billing.cancellation_requests WHERE company_id = _company_id AND status = 'scheduled';
  pol := billing.published_legal_document('CANCELLATION_POLICY', 'en');
  RETURN jsonb_build_object(
    'status', sub.status,
    'planCode', sub.plan_code,
    'provider', sub.provider,
    'trialEndsAt', sub.trial_ends_at,
    'currentPeriodEnd', sub.current_period_end,
    'cancelAtPeriodEnd', coalesce(sub.cancel_at_period_end, false),
    'access', CASE WHEN public.subscription_allows_posting(_company_id) THEN 'full' ELSE 'read_only' END,
    'canManage', public.has_company_permission(_company_id, 'billing.manage'),
    'eligibility', billing.cancellation_eligibility(sub, now()),
    'cancellation', CASE WHEN req.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', req.id, 'requestedAt', req.requested_at, 'effectiveAt', req.effective_at,
      'reversible', req.effective_at > now(), 'policyVersion', req.policy_version) END,
    'policy', CASE WHEN pol.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', pol.id, 'version', pol.version, 'title', pol.title, 'body', pol.body) END,
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'type', e.event_type, 'fromStatus', e.from_status, 'toStatus', e.to_status, 'fromPlan', e.from_plan,
        'toPlan', e.to_plan, 'source', e.source, 'effectiveAt', e.effective_at, 'occurredAt', e.occurred_at)
        ORDER BY e.occurred_at DESC, e.id DESC)
      FROM (SELECT * FROM billing.subscription_events x WHERE x.company_id = _company_id
             ORDER BY x.occurred_at DESC, x.id DESC LIMIT 50) e), '[]'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.billing_cancel_subscription(
  _company_id uuid, _confirm boolean, _policy_document_id uuid, _reason_code text, _reason_text text, _ip_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  sub public.company_subscriptions%ROWTYPE;
  eligibility jsonb;
  pol billing.legal_documents%ROWTYPE;
  req billing.cancellation_requests%ROWTYPE;
  account uuid;
  effective timestamptz;
BEGIN
  IF NOT public.has_company_permission(_company_id, 'billing.manage') THEN
    RAISE EXCEPTION 'You do not have permission to manage billing for this organisation' USING ERRCODE = '42501';
  END IF;
  IF _confirm IS NOT TRUE THEN
    RAISE EXCEPTION 'Confirm that you want to cancel' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO sub FROM public.company_subscriptions WHERE company_id = _company_id FOR UPDATE;
  eligibility := billing.cancellation_eligibility(sub, now());
  IF NOT (eligibility ->> 'allowed')::boolean THEN
    RAISE EXCEPTION '%', eligibility ->> 'reason' USING ERRCODE = 'P0001';
  END IF;
  pol := billing.published_legal_document('CANCELLATION_POLICY', 'en');
  IF pol.id IS DISTINCT FROM _policy_document_id THEN
    RAISE EXCEPTION 'The cancellation policy has changed. Review it and confirm again.' USING ERRCODE = '40001';
  END IF;
  effective := (eligibility ->> 'effectiveAt')::timestamptz;
  account := (SELECT l.billing_account_id FROM billing.billing_account_companies l WHERE l.company_id = _company_id);

  INSERT INTO billing.cancellation_requests (company_id, billing_account_id, requested_by, policy_document_id,
    policy_version, confirmed, reason_code, reason_text, from_status, plan_code, effective_at)
  VALUES (_company_id, account, auth.uid(), pol.id, pol.version, true, _reason_code,
    nullif(btrim(coalesce(_reason_text, '')), ''), sub.status, sub.plan_code, effective)
  RETURNING * INTO req;
  IF pol.id IS NOT NULL THEN
    INSERT INTO billing.legal_acceptances (document_id, kind, version, user_id, company_id, billing_account_id, context, ip_hash)
    VALUES (pol.id, pol.kind, pol.version, auth.uid(), _company_id, account, 'cancellation', _ip_hash);
  END IF;

  PERFORM billing.set_event_context(jsonb_build_object('type', 'cancellation_scheduled', 'source', 'customer',
    'effectiveAt', effective, 'details', jsonb_build_object('requestId', req.id, 'reasonCode', _reason_code)));
  UPDATE public.company_subscriptions SET cancel_at_period_end = true, updated_at = now() WHERE company_id = _company_id;
  PERFORM billing.set_event_context(NULL);
  PERFORM billing.write_audit('subscription.cancel_scheduled', 'subscription', _company_id::text, account,
    jsonb_build_object('status', sub.status, 'planCode', sub.plan_code),
    jsonb_build_object('effectiveAt', effective, 'requestId', req.id, 'policyVersion', pol.version),
    coalesce(_reason_code, 'Customer cancellation'));

  IF effective <= now() THEN
    PERFORM billing.apply_cancellation(req.id, 'customer');
  END IF;
  RETURN jsonb_build_object('requestId', req.id, 'effectiveAt', effective,
    'status', CASE WHEN effective <= now() THEN 'effective' ELSE 'scheduled' END);
EXCEPTION
  WHEN check_violation THEN
    RAISE EXCEPTION 'Choose a listed reason and keep the note under 1000 characters' USING ERRCODE = '22023';
END $$;

CREATE OR REPLACE FUNCTION public.billing_reverse_cancellation(_company_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  req billing.cancellation_requests%ROWTYPE;
BEGIN
  IF NOT public.has_company_permission(_company_id, 'billing.manage') THEN
    RAISE EXCEPTION 'You do not have permission to manage billing for this organisation' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO req FROM billing.cancellation_requests
   WHERE company_id = _company_id AND status = 'scheduled' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No cancellation is scheduled' USING ERRCODE = 'P0001';
  END IF;
  IF req.effective_at <= now() THEN
    RAISE EXCEPTION 'The cancellation has already taken effect' USING ERRCODE = 'P0001';
  END IF;
  UPDATE billing.cancellation_requests SET status = 'reversed', reversed_at = now(), reversed_by = auth.uid()
   WHERE id = req.id;
  PERFORM billing.set_event_context(jsonb_build_object('type', 'cancellation_reversed', 'source', 'customer',
    'details', jsonb_build_object('requestId', req.id)));
  UPDATE public.company_subscriptions SET cancel_at_period_end = false, updated_at = now() WHERE company_id = _company_id;
  PERFORM billing.set_event_context(NULL);
  PERFORM billing.write_audit('subscription.cancel_reversed', 'subscription', _company_id::text, req.billing_account_id,
    jsonb_build_object('effectiveAt', req.effective_at), jsonb_build_object('requestId', req.id), 'Customer kept the subscription');
  RETURN jsonb_build_object('requestId', req.id, 'status', 'reversed');
END $$;

-- Records the confirmation e-mail outcome in the existing send log.
CREATE OR REPLACE FUNCTION public.billing_record_cancellation_notice(
  _request_id uuid, _to text[], _subject text, _provider text, _message_id text, _status text, _error text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  req billing.cancellation_requests%ROWTYPE;
BEGIN
  SELECT * INTO req FROM billing.cancellation_requests WHERE id = _request_id;
  IF NOT FOUND OR req.requested_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the person who cancelled can record its notice' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('sent', 'failed', 'not_configured') THEN
    RAISE EXCEPTION 'Unknown notice status' USING ERRCODE = '22023';
  END IF;
  IF _status IN ('sent', 'failed') THEN
    INSERT INTO public.email_outbox (company_id, entity_type, entity_id, template, to_addresses, subject, provider,
      provider_message_id, status, error, sent_by)
    VALUES (req.company_id, 'subscription_cancellation', req.id, 'billing.cancellation_scheduled', _to,
      left(coalesce(_subject, ''), 300), coalesce(_provider, 'resend'), _message_id, _status, left(_error, 300), auth.uid());
  END IF;
  UPDATE billing.cancellation_requests SET notice_status = _status, notice_at = now() WHERE id = req.id;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Platform pause / resume (D17: platform staff only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_pause_subscription(_company_id uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  sub public.company_subscriptions%ROWTYPE;
BEGIN
  PERFORM private.require_platform('billing.manage');
  SELECT * INTO sub FROM public.company_subscriptions WHERE company_id = _company_id FOR UPDATE;
  IF NOT FOUND OR sub.status NOT IN ('trialing', 'active') THEN
    RAISE EXCEPTION 'Only a trial or active subscription can be paused' USING ERRCODE = '22023';
  END IF;
  IF sub.provider <> 'none' THEN
    RAISE EXCEPTION 'Pause card and mandate subscriptions at the payment provider' USING ERRCODE = '22023';
  END IF;
  PERFORM billing.set_event_context(jsonb_build_object('type', 'paused', 'source', 'platform',
    'details', jsonb_build_object('reason', _reason)));
  UPDATE public.company_subscriptions
     SET status = 'paused', paused_at = now(), paused_from_status = sub.status, updated_at = now()
   WHERE company_id = _company_id;
  PERFORM billing.set_event_context(NULL);
  PERFORM private.platform_log('subscription.paused', 'company_subscription', _company_id::text,
    jsonb_build_object('status', sub.status), jsonb_build_object('status', 'paused'), _reason);
  PERFORM billing.write_audit('subscription.paused', 'subscription', _company_id::text,
    (SELECT l.billing_account_id FROM billing.billing_account_companies l WHERE l.company_id = _company_id),
    jsonb_build_object('status', sub.status), jsonb_build_object('status', 'paused'), _reason);
  RETURN jsonb_build_object('status', 'paused');
END $$;

CREATE OR REPLACE FUNCTION public.platform_resume_subscription(_company_id uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  sub public.company_subscriptions%ROWTYPE;
  next_status text;
BEGIN
  PERFORM private.require_platform('billing.manage');
  SELECT * INTO sub FROM public.company_subscriptions WHERE company_id = _company_id FOR UPDATE;
  IF NOT FOUND OR sub.status <> 'paused' THEN
    RAISE EXCEPTION 'The subscription is not paused' USING ERRCODE = '22023';
  END IF;
  next_status := CASE
    WHEN coalesce(sub.paused_from_status, 'active') = 'trialing' AND sub.trial_ends_at <= now() THEN 'expired'
    ELSE coalesce(sub.paused_from_status, 'active') END;
  PERFORM billing.set_event_context(jsonb_build_object('type', 'resumed', 'source', 'platform',
    'details', jsonb_build_object('reason', _reason)));
  UPDATE public.company_subscriptions
     SET status = next_status, paused_at = NULL, paused_from_status = NULL, updated_at = now()
   WHERE company_id = _company_id;
  PERFORM billing.set_event_context(NULL);
  PERFORM private.platform_log('subscription.resumed', 'company_subscription', _company_id::text,
    jsonb_build_object('status', 'paused'), jsonb_build_object('status', next_status), _reason);
  PERFORM billing.write_audit('subscription.resumed', 'subscription', _company_id::text,
    (SELECT l.billing_account_id FROM billing.billing_account_companies l WHERE l.company_id = _company_id),
    jsonb_build_object('status', 'paused'), jsonb_build_object('status', next_status), _reason);
  RETURN jsonb_build_object('status', next_status);
END $$;

-- ---------------------------------------------------------------------------
-- 5. Lifecycle sweep (bounded, idempotent, safe to run concurrently)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION billing.run_lifecycle_sweep(_limit integer DEFAULT 200) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  rec record;
  cancelled integer := 0;
  expired integer := 0;
  downgraded integer := 0;
  alerts integer := 0;
  added integer;
BEGIN
  FOR rec IN SELECT r.id FROM billing.cancellation_requests r
              WHERE r.status = 'scheduled' AND r.effective_at <= now()
              ORDER BY r.effective_at LIMIT _limit FOR UPDATE SKIP LOCKED LOOP
    PERFORM billing.apply_cancellation(rec.id, 'job');
    cancelled := cancelled + 1;
  END LOOP;

  FOR rec IN SELECT s.company_id, s.trial_ends_at FROM public.company_subscriptions s
              WHERE s.status = 'trialing' AND s.provider = 'none' AND s.trial_ends_at <= now()
                AND NOT s.cancel_at_period_end
              ORDER BY s.trial_ends_at LIMIT _limit FOR UPDATE SKIP LOCKED LOOP
    PERFORM billing.set_event_context(jsonb_build_object('type', 'trial_expired', 'source', 'job',
      'effectiveAt', rec.trial_ends_at));
    UPDATE public.company_subscriptions SET status = 'expired', updated_at = now() WHERE company_id = rec.company_id;
    expired := expired + 1;
  END LOOP;

  FOR rec IN SELECT s.company_id, s.scheduled_plan_code, s.scheduled_at FROM public.company_subscriptions s
              WHERE s.scheduled_plan_code IS NOT NULL AND s.scheduled_at <= now() AND s.provider = 'none'
                AND s.status IN ('trialing', 'active')
              ORDER BY s.scheduled_at LIMIT _limit FOR UPDATE SKIP LOCKED LOOP
    PERFORM billing.set_event_context(jsonb_build_object('type', 'downgrade_applied', 'source', 'job',
      'effectiveAt', rec.scheduled_at));
    UPDATE public.company_subscriptions
       SET plan_code = rec.scheduled_plan_code,
           price_version_id = (SELECT v.id FROM public.plan_versions v WHERE v.plan_code = rec.scheduled_plan_code
                                 AND v.status = 'published' ORDER BY v.version_no DESC LIMIT 1),
           scheduled_plan_code = NULL, scheduled_at = NULL, updated_at = now()
     WHERE company_id = rec.company_id;
    downgraded := downgraded + 1;
  END LOOP;
  PERFORM billing.set_event_context(NULL);

  INSERT INTO billing.subscription_events (company_id, billing_account_id, event_type, from_status, to_status,
    to_plan, source, effective_at, idempotency_key)
  SELECT s.company_id,
    (SELECT l.billing_account_id FROM billing.billing_account_companies l WHERE l.company_id = s.company_id),
    'past_due_alert', s.status, s.status, s.plan_code, 'job', s.current_period_end,
    'past_due:' || s.company_id || ':' || coalesce(s.current_period_end::text, 'open')
    FROM public.company_subscriptions s
   WHERE s.status = 'past_due'
  ON CONFLICT (idempotency_key) DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  alerts := added;

  RETURN jsonb_build_object('cancelled', cancelled, 'trialsExpired', expired, 'downgradesApplied', downgraded,
    'pastDueAlerts', alerts);
END $$;

-- The existing platform worker (pg_cron -> private.platform_worker_tick) runs the sweep every
-- 15 minutes with its retry and dead-letter handling.
ALTER TABLE public.platform_jobs DROP CONSTRAINT IF EXISTS platform_jobs_kind_check;
ALTER TABLE public.platform_jobs ADD CONSTRAINT platform_jobs_kind_check
  CHECK (kind = ANY (ARRAY['expire_support'::text, 'check_operations'::text, 'billing_lifecycle'::text]));
ALTER TABLE private.platform_job_schedules DROP CONSTRAINT IF EXISTS platform_job_schedules_kind_check;
ALTER TABLE private.platform_job_schedules ADD CONSTRAINT platform_job_schedules_kind_check
  CHECK (kind = ANY (ARRAY['expire_support'::text, 'check_operations'::text, 'billing_lifecycle'::text]));
INSERT INTO private.platform_job_schedules (kind, interval_seconds, next_run_at)
VALUES ('billing_lifecycle', 900, date_trunc('minute', now()) + interval '1 minute')
ON CONFLICT (kind) DO NOTHING;

CREATE OR REPLACE FUNCTION private.platform_worker_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE j public.platform_jobs; schedule record; count_jobs integer:=0; run_id bigint; output jsonb; code text;
BEGIN
 IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Scheduled worker requires system execution' USING ERRCODE='42501'; END IF;
 IF NOT pg_try_advisory_xact_lock(483925016) THEN RETURN jsonb_build_object('skipped','Worker already running'); END IF;
 IF NOT EXISTS(SELECT 1 FROM private.platform_worker_state WHERE singleton AND enabled) THEN RETURN jsonb_build_object('skipped','Worker disabled'); END IF;
 UPDATE private.platform_worker_state SET started_at=clock_timestamp(),error_code=NULL WHERE singleton;
 FOR schedule IN SELECT * FROM private.platform_job_schedules WHERE next_run_at<=now() ORDER BY kind FOR UPDATE LOOP
  IF NOT EXISTS(SELECT 1 FROM public.platform_jobs WHERE kind=schedule.kind AND origin='schedule' AND status='failed') THEN
  INSERT INTO public.platform_jobs(name,kind,status,created_by,origin) VALUES(schedule.kind,schedule.kind,'queued',NULL,'schedule') ON CONFLICT(name) WHERE status='queued' DO NOTHING;
  END IF;
  UPDATE private.platform_job_schedules SET next_run_at=date_trunc('minute',now())+make_interval(secs=>schedule.interval_seconds) WHERE kind=schedule.kind;
 END LOOP;
 FOR j IN SELECT * FROM public.platform_jobs WHERE status='queued' AND kind IS NOT NULL AND next_run_at<=now() AND attempts<max_attempts ORDER BY next_run_at,created_at,id LIMIT 5 FOR UPDATE SKIP LOCKED LOOP
  UPDATE public.platform_jobs SET status='running',attempts=attempts+1,started_at=clock_timestamp(),finished_at=NULL,last_error=NULL,row_version=row_version+1 WHERE id=j.id RETURNING * INTO j;
  INSERT INTO public.platform_job_runs(job_id,attempt,status) VALUES(j.id,j.attempts,'running') RETURNING id INTO run_id;
  BEGIN
   CASE j.kind WHEN 'expire_support' THEN output:=private.platform_expire_support_jobs(); WHEN 'check_operations' THEN output:=private.platform_check_operations(); WHEN 'billing_lifecycle' THEN output:=billing.run_lifecycle_sweep(); ELSE RAISE EXCEPTION 'Unsupported job handler'; END CASE;
   UPDATE public.platform_jobs SET status='succeeded',finished_at=clock_timestamp(),result=output,row_version=row_version+1 WHERE id=j.id;
   UPDATE public.platform_job_runs SET status='succeeded',finished_at=clock_timestamp(),result=output WHERE id=run_id;
   PERFORM private.platform_log('job.succeed','platform_job',j.id::text,NULL,output,'Bounded operational handler completed');
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE;
   UPDATE public.platform_jobs SET status=CASE WHEN attempts>=max_attempts THEN 'failed' ELSE 'queued' END,next_run_at=now()+make_interval(secs=>least(3600,60*power(2,least(attempts-1,6))::integer)),finished_at=clock_timestamp(),last_error='Handler failed ('||code||')',row_version=row_version+1 WHERE id=j.id;
   UPDATE public.platform_job_runs SET status='failed',finished_at=clock_timestamp(),error_code=code WHERE id=run_id;
   PERFORM private.platform_log('job.fail','platform_job',j.id::text,NULL,jsonb_build_object('code',code,'attempt',j.attempts,'retrying',j.attempts<j.max_attempts),'Operational handler failed; details remain redacted');
  END;
  count_jobs:=count_jobs+1;
 END LOOP;
 UPDATE private.platform_worker_state SET finished_at=clock_timestamp(),last_jobs=count_jobs WHERE singleton;
 RETURN jsonb_build_object('processed',count_jobs);
END $function$;

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'billing.immutable_subscription_event()', 'billing.set_event_context(jsonb)', 'billing.log_subscription_change()',
    'billing.guard_cancellation_request()', 'billing.cancellation_eligibility(public.company_subscriptions, timestamptz)',
    'billing.apply_cancellation(uuid, text)', 'billing.run_lifecycle_sweep(integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', f);
    EXCEPTION WHEN undefined_object THEN NULL; END;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.billing_subscription_state(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_cancel_subscription(uuid, boolean, uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_reverse_cancellation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_record_cancellation_notice(uuid, text[], text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_pause_subscription(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_resume_subscription(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_subscription_state(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_cancel_subscription(uuid, boolean, uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_reverse_cancellation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_record_cancellation_notice(uuid, text[], text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_pause_subscription(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_resume_subscription(uuid, text) TO authenticated, service_role;
