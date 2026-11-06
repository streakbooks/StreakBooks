-- Billing platform, phase 5: payment provider routing, provider price mappings, durable webhook
-- events, checkout and subscription price snapshots, a single transactional provider-event
-- applier, provider-side cancellation/reversal and plan changes.
-- Provider calls happen in server code (test keys unless LINKBOOKS_ALLOW_LIVE_PAYMENT_KEYS=true);
-- the database only changes paid access from a verified provider event or a confirmed provider
-- response recorded by the service role. Additive and idempotent.

-- ---------------------------------------------------------------------------
-- 1. Routing and country enablement
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.payment_provider_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code char(2) REFERENCES billing.countries(code),
  provider text NOT NULL CHECK (provider IN ('stripe', 'razorpay')),
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100 CHECK (priority BETWEEN 1 AND 1000),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_provider_routes_key
  ON billing.payment_provider_routes (coalesce(country_code, '**'), provider);
INSERT INTO billing.payment_provider_routes (country_code, provider, priority)
VALUES ('IN', 'razorpay', 10), (NULL, 'stripe', 100)
ON CONFLICT DO NOTHING;

-- Providers offered to a billing country, best first: the country's own routes when it has any
-- enabled route, otherwise the default routes.
CREATE OR REPLACE FUNCTION billing.country_providers(_country text) RETURNS text[]
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(array_agg(r.provider ORDER BY r.priority, r.provider), '{}')
    FROM billing.payment_provider_routes r
   WHERE r.enabled
     AND CASE WHEN EXISTS (SELECT 1 FROM billing.payment_provider_routes c WHERE c.enabled AND c.country_code = _country)
              THEN r.country_code = _country ELSE r.country_code IS NULL END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Provider price mappings (one provider price per published snapshot and mode)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.provider_price_mappings (
  plan_price_id uuid NOT NULL REFERENCES public.plan_prices(id),
  provider text NOT NULL CHECK (provider IN ('stripe', 'razorpay')),
  mode text NOT NULL CHECK (mode IN ('test', 'live')),
  provider_product_id text,
  provider_price_id text NOT NULL CHECK (char_length(provider_price_id) BETWEEN 3 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_price_id, provider, mode)
);
CREATE UNIQUE INDEX IF NOT EXISTS provider_price_mappings_provider_key
  ON billing.provider_price_mappings (provider, mode, provider_price_id);

ALTER TABLE billing.payment_provider_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.provider_price_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing.payment_provider_routes, billing.provider_price_mappings FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON billing.payment_provider_routes, billing.provider_price_mappings FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 3. Durable webhook events (extends the existing dedupe table)
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_events
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'processed',
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS mode text,
  ADD COLUMN IF NOT EXISTS result jsonb;
DO $$ BEGIN
  ALTER TABLE public.billing_events ADD CONSTRAINT billing_events_status_check
    CHECK (status IN ('received', 'processing', 'processed', 'skipped', 'failed', 'dead'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.billing_events ADD CONSTRAINT billing_events_mode_check CHECK (mode IS NULL OR mode IN ('test', 'live'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS billing_events_due_idx
  ON public.billing_events (next_attempt_at) WHERE status IN ('received', 'failed');

-- ---------------------------------------------------------------------------
-- 4. Price snapshots on checkouts and subscriptions
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_checkouts
  ADD COLUMN IF NOT EXISTS plan_price_id uuid,
  ADD COLUMN IF NOT EXISTS country_code char(2),
  ADD COLUMN IF NOT EXISTS provider_price_id text,
  ADD COLUMN IF NOT EXISTS mode text;
DO $$ BEGIN
  ALTER TABLE public.billing_checkouts ADD CONSTRAINT billing_checkouts_plan_price_fk
    FOREIGN KEY (plan_price_id) REFERENCES public.plan_prices(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS plan_price_id uuid,
  ADD COLUMN IF NOT EXISTS country_code char(2),
  ADD COLUMN IF NOT EXISTS provider_state_at timestamptz;
DO $$ BEGIN
  ALTER TABLE public.company_subscriptions ADD CONSTRAINT company_subscriptions_plan_price_fk
    FOREIGN KEY (plan_price_id) REFERENCES public.plan_prices(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A price-book plan is sold only at a published snapshot price for an enabled billing country.
CREATE OR REPLACE FUNCTION billing.guard_legacy_checkout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  price public.plan_prices%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans bp WHERE bp.code = NEW.plan_code AND bp.pricing_source = 'price_book') THEN
    RETURN NEW;
  END IF;
  SELECT p.* INTO price FROM public.plan_prices p JOIN public.plan_versions v ON v.id = p.version_id
   WHERE p.id = NEW.plan_price_id AND v.plan_code = NEW.plan_code AND v.price_book
     AND v.status = 'published' AND v.visibility = 'live';
  IF NOT FOUND
     OR price.currency <> NEW.currency OR price.amount_minor <> NEW.unit_amount_minor
     OR price.billing_interval <> NEW.billing_interval
     OR NOT EXISTS (SELECT 1 FROM billing.country_price_rows(price.version_id, NEW.country_code) r WHERE r.id = price.id)
     OR NOT EXISTS (SELECT 1 FROM billing.countries c WHERE c.code = NEW.country_code AND c.billing_enabled) THEN
    RAISE EXCEPTION 'Checkout must use the published price for an enabled billing country' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION billing.guard_paid_plan_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.provider <> 'none'
     AND NEW.plan_code IS DISTINCT FROM OLD.plan_code
     AND EXISTS (SELECT 1 FROM public.billing_plans bp WHERE bp.code = NEW.plan_code AND bp.pricing_source <> 'legacy')
     AND NOT EXISTS (SELECT 1 FROM public.plan_prices p JOIN public.plan_versions v ON v.id = p.version_id
                      WHERE p.id = NEW.plan_price_id AND v.plan_code = NEW.plan_code AND v.price_book) THEN
    RAISE EXCEPTION 'Plan % has no published price for a paid plan change', NEW.plan_code USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Cancellation requests can be confirmed by the provider
-- ---------------------------------------------------------------------------
ALTER TABLE billing.cancellation_requests ALTER COLUMN requested_by DROP NOT NULL;
ALTER TABLE billing.cancellation_requests
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS reversible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS failure text;
ALTER TABLE billing.cancellation_requests DROP CONSTRAINT IF EXISTS cancellation_requests_status_check;
ALTER TABLE billing.cancellation_requests ADD CONSTRAINT cancellation_requests_status_check
  CHECK (status IN ('pending_provider', 'scheduled', 'effective', 'reversed', 'failed'));
DROP INDEX IF EXISTS billing.cancellation_requests_one_scheduled;
CREATE UNIQUE INDEX IF NOT EXISTS cancellation_requests_one_open
  ON billing.cancellation_requests (company_id) WHERE status IN ('pending_provider', 'scheduled');

CREATE OR REPLACE FUNCTION billing.guard_cancellation_request() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Cancellation requests are kept for the record' USING ERRCODE = '55000';
  END IF;
  IF (NEW.company_id, NEW.requested_by, NEW.policy_document_id, NEW.policy_version, NEW.confirmed, NEW.reason_code,
      NEW.reason_text, NEW.from_status, NEW.plan_code, NEW.requested_at, NEW.provider)
     IS DISTINCT FROM
     (OLD.company_id, OLD.requested_by, OLD.policy_document_id, OLD.policy_version, OLD.confirmed, OLD.reason_code,
      OLD.reason_text, OLD.from_status, OLD.plan_code, OLD.requested_at, OLD.provider) THEN
    RAISE EXCEPTION 'A cancellation request cannot be edited' USING ERRCODE = '55000';
  END IF;
  IF NEW.effective_at IS DISTINCT FROM OLD.effective_at AND OLD.status <> 'pending_provider' THEN
    RAISE EXCEPTION 'The effective date is fixed once the provider confirms' USING ERRCODE = '55000';
  END IF;
  IF OLD.status <> NEW.status AND NOT (
       (OLD.status = 'pending_provider' AND NEW.status IN ('scheduled', 'failed', 'effective'))
    OR (OLD.status = 'scheduled' AND NEW.status IN ('effective', 'reversed'))) THEN
    RAISE EXCEPTION 'Invalid cancellation status change % -> %', OLD.status, NEW.status USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;

-- Provider subscriptions are cancelled at the provider first; Razorpay cancellations cannot be
-- undone at the provider, so they are not reversible.
CREATE OR REPLACE FUNCTION billing.cancellation_eligibility(_sub public.company_subscriptions, _now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN _sub.company_id IS NULL THEN jsonb_build_object('allowed', false, 'reason', 'This organisation has no subscription.')
    WHEN _sub.status = 'complimentary' THEN jsonb_build_object('allowed', false, 'reason', 'Demo and complimentary organisations are not billed.')
    WHEN _sub.status IN ('cancelled', 'expired') THEN jsonb_build_object('allowed', false, 'reason', 'The subscription has already ended.')
    WHEN _sub.cancel_at_period_end OR EXISTS (SELECT 1 FROM billing.cancellation_requests r
           WHERE r.company_id = _sub.company_id AND r.status IN ('scheduled', 'pending_provider'))
      THEN jsonb_build_object('allowed', false, 'reason', 'Cancellation is already scheduled.')
    WHEN _sub.status = 'paused' THEN jsonb_build_object('allowed', false, 'reason', 'A paused subscription is managed by LinkBooks support.')
    WHEN _sub.provider IN ('stripe', 'razorpay') AND _sub.provider_subscription_id IS NULL
      THEN jsonb_build_object('allowed', false, 'reason', 'The payment provider has not confirmed this subscription yet.')
    WHEN _sub.status IN ('trialing', 'active', 'past_due') THEN jsonb_build_object(
      'allowed', true,
      'viaProvider', _sub.provider IN ('stripe', 'razorpay'),
      'reversible', _sub.provider <> 'razorpay',
      'effectiveAt', CASE
        WHEN _sub.status = 'trialing' THEN greatest(_now, coalesce(_sub.trial_ends_at, _sub.current_period_end, _now))
        WHEN _sub.status = 'active' OR _sub.provider IN ('stripe', 'razorpay') THEN greatest(_now, coalesce(_sub.current_period_end, _now))
        ELSE _now END)
    ELSE jsonb_build_object('allowed', false, 'reason', 'This subscription cannot be cancelled here.')
  END;
$$;

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
  via_provider boolean;
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
  via_provider := coalesce((eligibility ->> 'viaProvider')::boolean, false);
  account := (SELECT l.billing_account_id FROM billing.billing_account_companies l WHERE l.company_id = _company_id);

  INSERT INTO billing.cancellation_requests (company_id, billing_account_id, requested_by, policy_document_id,
    policy_version, confirmed, reason_code, reason_text, from_status, plan_code, effective_at, status, provider, reversible)
  VALUES (_company_id, account, auth.uid(), pol.id, pol.version, true, _reason_code,
    nullif(btrim(coalesce(_reason_text, '')), ''), sub.status, sub.plan_code, effective,
    CASE WHEN via_provider THEN 'pending_provider' ELSE 'scheduled' END,
    CASE WHEN via_provider THEN sub.provider END, coalesce((eligibility ->> 'reversible')::boolean, true))
  RETURNING * INTO req;
  IF pol.id IS NOT NULL THEN
    INSERT INTO billing.legal_acceptances (document_id, kind, version, user_id, company_id, billing_account_id, context, ip_hash)
    VALUES (pol.id, pol.kind, pol.version, auth.uid(), _company_id, account, 'cancellation', _ip_hash);
  END IF;
  IF via_provider THEN
    -- The server cancels at the provider, then confirms with billing_confirm_provider_cancellation.
    RETURN jsonb_build_object('requestId', req.id, 'effectiveAt', effective, 'status', 'pending_provider');
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

-- Service role only: records the provider's answer to a pending cancellation.
CREATE OR REPLACE FUNCTION public.billing_confirm_provider_cancellation(
  _request_id uuid, _succeeded boolean, _effective_at timestamptz, _failure text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  req billing.cancellation_requests%ROWTYPE;
BEGIN
  SELECT * INTO req FROM billing.cancellation_requests WHERE id = _request_id AND status = 'pending_provider' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending provider cancellation' USING ERRCODE = 'P0001';
  END IF;
  IF NOT _succeeded THEN
    UPDATE billing.cancellation_requests SET status = 'failed', failure = left(coalesce(_failure, 'Provider refused'), 300),
      completed_at = now() WHERE id = req.id;
    RETURN jsonb_build_object('requestId', req.id, 'status', 'failed');
  END IF;
  UPDATE billing.cancellation_requests SET status = 'scheduled', effective_at = coalesce(_effective_at, req.effective_at)
   WHERE id = req.id RETURNING * INTO req;
  PERFORM billing.set_event_context(jsonb_build_object('type', 'cancellation_scheduled', 'source', 'customer',
    'effectiveAt', req.effective_at, 'details', jsonb_build_object('requestId', req.id, 'provider', req.provider)));
  UPDATE public.company_subscriptions SET cancel_at_period_end = true, updated_at = now() WHERE company_id = req.company_id;
  PERFORM billing.set_event_context(NULL);
  PERFORM billing.write_audit('subscription.cancel_scheduled', 'subscription', req.company_id::text, req.billing_account_id,
    jsonb_build_object('status', req.from_status, 'planCode', req.plan_code),
    jsonb_build_object('effectiveAt', req.effective_at, 'requestId', req.id, 'provider', req.provider,
      'policyVersion', req.policy_version), coalesce(req.reason_code, 'Customer cancellation'));
  IF req.effective_at <= now() THEN
    PERFORM billing.apply_cancellation(req.id, 'provider');
  END IF;
  RETURN jsonb_build_object('requestId', req.id, 'status', CASE WHEN req.effective_at <= now() THEN 'effective' ELSE 'scheduled' END,
    'effectiveAt', req.effective_at);
END $$;

CREATE OR REPLACE FUNCTION public.billing_reverse_cancellation(_company_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  req billing.cancellation_requests%ROWTYPE;
  sub public.company_subscriptions%ROWTYPE;
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
  IF NOT req.reversible THEN
    RAISE EXCEPTION 'This payment provider cannot undo a cancellation. Subscribe again after it ends.' USING ERRCODE = 'P0001';
  END IF;
  IF req.provider IS NOT NULL THEN
    SELECT * INTO sub FROM public.company_subscriptions WHERE company_id = _company_id;
    -- The server withdraws it at the provider, then confirms with billing_confirm_provider_reversal.
    RETURN jsonb_build_object('requestId', req.id, 'status', 'needs_provider', 'provider', req.provider,
      'providerSubscriptionId', sub.provider_subscription_id);
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

-- Service role only: the provider withdrew the cancellation.
CREATE OR REPLACE FUNCTION public.billing_confirm_provider_reversal(_request_id uuid, _actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  req billing.cancellation_requests%ROWTYPE;
BEGIN
  SELECT * INTO req FROM billing.cancellation_requests WHERE id = _request_id AND status = 'scheduled' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No scheduled cancellation' USING ERRCODE = 'P0001';
  END IF;
  UPDATE billing.cancellation_requests SET status = 'reversed', reversed_at = now(), reversed_by = _actor WHERE id = req.id;
  PERFORM billing.set_event_context(jsonb_build_object('type', 'cancellation_reversed', 'source', 'customer',
    'details', jsonb_build_object('requestId', req.id, 'provider', req.provider)));
  UPDATE public.company_subscriptions SET cancel_at_period_end = false, updated_at = now() WHERE company_id = req.company_id;
  PERFORM billing.set_event_context(NULL);
  PERFORM billing.write_audit('subscription.cancel_reversed', 'subscription', req.company_id::text, req.billing_account_id,
    jsonb_build_object('effectiveAt', req.effective_at), jsonb_build_object('requestId', req.id, 'provider', req.provider),
    'Customer kept the subscription');
  RETURN jsonb_build_object('requestId', req.id, 'status', 'reversed');
END $$;

-- The customer view reports whether a scheduled cancellation can still be withdrawn.
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
  SELECT * INTO req FROM billing.cancellation_requests WHERE company_id = _company_id AND status IN ('scheduled', 'pending_provider');
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
      'reversible', req.status = 'scheduled' AND req.reversible AND req.effective_at > now(),
      'status', req.status, 'provider', req.provider, 'policyVersion', req.policy_version) END,
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

-- ---------------------------------------------------------------------------
-- 6. Checkout price and plan changes (customer-authorised, provider-executed)
-- ---------------------------------------------------------------------------
-- The price a billing manager may buy for an organisation: published snapshot for the
-- organisation country, with the providers routed for that country.
CREATE OR REPLACE FUNCTION public.billing_checkout_price(_company_id uuid, _plan_code text, _interval text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  country char(2);
  version public.plan_versions%ROWTYPE;
  price public.plan_prices%ROWTYPE;
BEGIN
  IF NOT public.has_company_permission(_company_id, 'billing.manage') THEN
    RAISE EXCEPTION 'You do not have permission to manage billing for this organisation' USING ERRCODE = '42501';
  END IF;
  SELECT upper(c.country_code) INTO country FROM public.companies c WHERE c.id = _company_id;
  SELECT v.* INTO version FROM public.plan_versions v JOIN public.billing_plans bp ON bp.code = v.plan_code
   WHERE v.plan_code = _plan_code AND v.status = 'published' AND v.visibility = 'live' AND v.price_book
     AND bp.is_active AND bp.pricing_source = 'price_book'
   ORDER BY v.version_no DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That plan is not on sale' USING ERRCODE = 'P0001';
  END IF;
  SELECT p.* INTO price FROM billing.country_price_rows(version.id, country) p
   WHERE p.billing_interval = _interval AND p.archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That billing period is not offered for this plan' USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object(
    'planPriceId', price.id, 'planCode', _plan_code, 'planName', version.name, 'versionId', version.id,
    'interval', price.billing_interval, 'currency', price.currency, 'amountMinor', price.amount_minor,
    'country', country,
    'billingEnabled', coalesce((SELECT c.billing_enabled FROM billing.countries c WHERE c.code = country), false),
    'providers', to_jsonb(billing.country_providers(country)));
END $$;

-- Customer-authorised plan change for a provider subscription. Returns what the server must ask
-- the provider to do; nothing changes until the provider confirms.
CREATE OR REPLACE FUNCTION public.billing_prepare_plan_change(_company_id uuid, _plan_code text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  sub public.company_subscriptions%ROWTYPE;
  target jsonb;
  current_amount bigint;
BEGIN
  IF NOT public.has_company_permission(_company_id, 'billing.manage') THEN
    RAISE EXCEPTION 'You do not have permission to manage billing for this organisation' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO sub FROM public.company_subscriptions WHERE company_id = _company_id;
  IF NOT FOUND OR sub.provider NOT IN ('stripe', 'razorpay') OR sub.provider_subscription_id IS NULL
     OR sub.status NOT IN ('active', 'trialing') THEN
    RAISE EXCEPTION 'Plan changes need an active card or mandate subscription. Choose a plan to subscribe.' USING ERRCODE = 'P0001';
  END IF;
  IF sub.cancel_at_period_end THEN
    RAISE EXCEPTION 'Withdraw the scheduled cancellation before changing plan' USING ERRCODE = 'P0001';
  END IF;
  IF sub.plan_code = _plan_code THEN
    RAISE EXCEPTION 'That is already the current plan' USING ERRCODE = 'P0001';
  END IF;
  target := public.billing_checkout_price(_company_id, _plan_code, sub.billing_interval);
  IF target ->> 'currency' <> sub.currency THEN
    RAISE EXCEPTION 'The new plan is priced in %, but this subscription is billed in %. Cancel and subscribe again to change currency.',
      target ->> 'currency', sub.currency USING ERRCODE = 'P0001';
  END IF;
  current_amount := coalesce(sub.unit_amount_minor, 0);
  RETURN target || jsonb_build_object(
    'kind', CASE WHEN (target ->> 'amountMinor')::bigint > current_amount THEN 'upgrade'
                 WHEN (target ->> 'amountMinor')::bigint < current_amount THEN 'downgrade' ELSE 'same' END,
    'provider', sub.provider, 'providerSubscriptionId', sub.provider_subscription_id,
    'currentPlanCode', sub.plan_code, 'currentAmountMinor', current_amount,
    'periodEnd', coalesce(sub.current_period_end, sub.trial_ends_at));
END $$;

-- Service role only: records a plan change the provider accepted. Upgrades take effect when the
-- provider confirms payment (webhook); downgrades and scheduled changes at the given time.
CREATE OR REPLACE FUNCTION public.billing_record_plan_change(
  _company_id uuid, _plan_price_id uuid, _kind text, _effective_at timestamptz, _actor uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  price public.plan_prices%ROWTYPE;
  plan text;
BEGIN
  SELECT p.* INTO price FROM public.plan_prices p JOIN public.plan_versions v ON v.id = p.version_id
   WHERE p.id = _plan_price_id AND v.price_book;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown price snapshot' USING ERRCODE = '22023';
  END IF;
  plan := (SELECT v.plan_code FROM public.plan_versions v WHERE v.id = price.version_id);
  IF _kind = 'scheduled' THEN
    PERFORM billing.set_event_context(jsonb_build_object('type', 'updated', 'source', 'customer',
      'effectiveAt', _effective_at, 'details', jsonb_build_object('planPriceId', _plan_price_id, 'actor', _actor)));
    UPDATE public.company_subscriptions SET scheduled_plan_code = plan, scheduled_at = _effective_at, updated_at = now()
     WHERE company_id = _company_id;
    PERFORM billing.set_event_context(NULL);
  ELSIF _kind = 'pending_payment' THEN
    INSERT INTO billing.subscription_events (company_id, billing_account_id, event_type, to_plan, source, actor_user_id, details)
    VALUES (_company_id, (SELECT l.billing_account_id FROM billing.billing_account_companies l WHERE l.company_id = _company_id),
      'plan_change_requested', plan, 'customer', _actor, jsonb_build_object('planPriceId', _plan_price_id));
  ELSE
    RAISE EXCEPTION 'Unknown plan change kind' USING ERRCODE = '22023';
  END IF;
  PERFORM billing.write_audit('subscription.plan_change_requested', 'subscription', _company_id::text,
    (SELECT l.billing_account_id FROM billing.billing_account_companies l WHERE l.company_id = _company_id),
    NULL, jsonb_build_object('planCode', plan, 'planPriceId', _plan_price_id, 'kind', _kind, 'effectiveAt', _effective_at),
    'Customer plan change');
  RETURN jsonb_build_object('planCode', plan, 'kind', _kind);
END $$;

ALTER TABLE billing.subscription_events DROP CONSTRAINT IF EXISTS subscription_events_event_type_check;
ALTER TABLE billing.subscription_events ADD CONSTRAINT subscription_events_event_type_check
  CHECK (event_type IN ('created', 'status_changed', 'plan_changed', 'updated', 'trial_started', 'trial_expired',
    'cancellation_scheduled', 'cancellation_reversed', 'cancelled', 'paused', 'resumed', 'downgrade_applied',
    'past_due_alert', 'activated', 'renewed', 'payment_failed', 'plan_change_requested'));

-- ---------------------------------------------------------------------------
-- 7. Provider price mappings and webhook store (service role only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_provider_price(_plan_price_id uuid, _provider text, _mode text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('providerPriceId', m.provider_price_id, 'providerProductId', m.provider_product_id)
    FROM billing.provider_price_mappings m
   WHERE m.plan_price_id = _plan_price_id AND m.provider = _provider AND m.mode = _mode;
$$;

CREATE OR REPLACE FUNCTION public.billing_record_provider_price(
  _plan_price_id uuid, _provider text, _mode text, _provider_product_id text, _provider_price_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO billing.provider_price_mappings (plan_price_id, provider, mode, provider_product_id, provider_price_id)
  VALUES (_plan_price_id, _provider, _mode, _provider_product_id, _provider_price_id)
  ON CONFLICT (plan_price_id, provider, mode) DO NOTHING;
  RETURN public.billing_provider_price(_plan_price_id, _provider, _mode);
END $$;

CREATE OR REPLACE FUNCTION public.billing_webhook_receive(
  _provider text, _event_id text, _event_type text, _payload jsonb, _provider_created_at timestamptz, _mode text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  row_id uuid;
  current_status text;
BEGIN
  INSERT INTO public.billing_events (provider, event_id, event_type, payload, status, provider_created_at, mode)
  VALUES (_provider, _event_id, _event_type, _payload, 'received', _provider_created_at, _mode)
  ON CONFLICT (provider, event_id) WHERE event_id IS NOT NULL DO NOTHING
  RETURNING id INTO row_id;
  IF row_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', row_id, 'status', 'received', 'fresh', true);
  END IF;
  SELECT e.id, e.status INTO row_id, current_status FROM public.billing_events e
   WHERE e.provider = _provider AND e.event_id = _event_id;
  RETURN jsonb_build_object('id', row_id, 'status', current_status, 'fresh', false);
END $$;

-- Claims an event for processing (one worker at a time); returns its payload or null.
CREATE OR REPLACE FUNCTION public.billing_webhook_claim(_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  ev public.billing_events%ROWTYPE;
BEGIN
  SELECT * INTO ev FROM public.billing_events WHERE id = _id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR ev.status NOT IN ('received', 'failed')
     OR (ev.status = 'failed' AND ev.next_attempt_at > now()) THEN
    RETURN NULL;
  END IF;
  UPDATE public.billing_events SET status = 'processing', attempts = attempts + 1 WHERE id = _id;
  RETURN jsonb_build_object('id', ev.id, 'provider', ev.provider, 'eventId', ev.event_id, 'eventType', ev.event_type,
    'payload', ev.payload, 'providerCreatedAt', ev.provider_created_at, 'mode', ev.mode, 'attempt', ev.attempts + 1);
END $$;

CREATE OR REPLACE FUNCTION public.billing_webhook_finish(_id uuid, _status text, _error text, _result jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF _status NOT IN ('processed', 'skipped', 'failed') THEN
    RAISE EXCEPTION 'Unknown webhook outcome' USING ERRCODE = '22023';
  END IF;
  UPDATE public.billing_events SET
    status = CASE WHEN _status = 'failed' AND attempts >= 10 THEN 'dead' ELSE _status END,
    last_error = CASE WHEN _status = 'failed' THEN left(_error, 300) END,
    next_attempt_at = CASE WHEN _status = 'failed'
      THEN now() + make_interval(secs => least(3600, 60 * power(2, least(attempts - 1, 6))::integer)) END,
    processed_at = CASE WHEN _status IN ('processed', 'skipped') THEN now() END,
    result = _result
  WHERE id = _id AND status = 'processing';
END $$;

CREATE OR REPLACE FUNCTION public.billing_webhook_due(_limit integer DEFAULT 20) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(e.id ORDER BY e.received_order), '[]'::jsonb) FROM (
    SELECT id, coalesce(provider_created_at, created_at) AS received_order FROM public.billing_events
     WHERE status IN ('received', 'failed') AND coalesce(next_attempt_at, created_at) <= now()
        OR (status = 'processing' AND created_at < now() - interval '15 minutes')
     ORDER BY coalesce(provider_created_at, created_at) LIMIT greatest(1, least(_limit, 100))) e;
$$;

-- ---------------------------------------------------------------------------
-- 8. Provider event applier (service role only, one transaction per event)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_apply_provider_event(_provider text, _event_id text, _kind text, _data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  occurred timestamptz := coalesce(nullif(_data ->> 'occurredAt', '')::timestamptz, now());
  chk public.billing_checkouts%ROWTYPE;
  sub public.company_subscriptions%ROWTYPE;
  price public.plan_prices%ROWTYPE;
  mapped_plan text;
  mapped_price uuid;
  next_status text := nullif(_data ->> 'status', '');
  period_end timestamptz := nullif(_data ->> 'periodEnd', '')::timestamptz;
  account uuid;
BEGIN
  IF _provider NOT IN ('stripe', 'razorpay') THEN
    RAISE EXCEPTION 'Unknown provider' USING ERRCODE = '22023';
  END IF;

  IF _kind = 'checkout_completed' THEN
    SELECT * INTO chk FROM public.billing_checkouts WHERE id = nullif(_data ->> 'checkoutId', '')::uuid FOR UPDATE;
    IF NOT FOUND OR chk.provider <> _provider THEN
      RETURN jsonb_build_object('result', 'skipped', 'reason', 'unknown checkout');
    END IF;
    IF chk.status <> 'open' THEN
      RETURN jsonb_build_object('result', 'skipped', 'reason', 'checkout already completed', 'companyId', chk.company_id);
    END IF;
    IF next_status NOT IN ('active', 'trialing') THEN
      RETURN jsonb_build_object('result', 'skipped', 'reason', 'payment not confirmed');
    END IF;
    IF chk.plan_price_id IS NOT NULL THEN
      SELECT * INTO price FROM public.plan_prices WHERE id = chk.plan_price_id;
    END IF;
    PERFORM billing.set_event_context(jsonb_build_object('type', 'activated', 'source', 'provider',
      'effectiveAt', occurred, 'details', jsonb_build_object('checkoutId', chk.id, 'eventId', _event_id)));
    INSERT INTO public.company_subscriptions AS s (company_id, plan_code, status, billing_interval, provider,
      provider_customer_id, provider_subscription_id, current_period_end, cancel_at_period_end, currency,
      unit_amount_minor, offer_code, price_version_id, plan_price_id, country_code, provider_state_at, started_at)
    VALUES (chk.company_id, chk.plan_code, next_status, chk.billing_interval, _provider,
      nullif(_data ->> 'customerId', ''), nullif(_data ->> 'subscriptionId', ''), period_end,
      coalesce((_data ->> 'cancelAtPeriodEnd')::boolean, false), chk.currency, chk.unit_amount_minor, chk.offer_code,
      price.version_id, chk.plan_price_id, chk.country_code, occurred, now())
    ON CONFLICT (company_id) DO UPDATE SET
      plan_code = EXCLUDED.plan_code, status = EXCLUDED.status, billing_interval = EXCLUDED.billing_interval,
      provider = EXCLUDED.provider, provider_customer_id = EXCLUDED.provider_customer_id,
      provider_subscription_id = EXCLUDED.provider_subscription_id, current_period_end = EXCLUDED.current_period_end,
      cancel_at_period_end = EXCLUDED.cancel_at_period_end, currency = EXCLUDED.currency,
      unit_amount_minor = EXCLUDED.unit_amount_minor, offer_code = EXCLUDED.offer_code,
      price_version_id = coalesce(EXCLUDED.price_version_id, s.price_version_id), plan_price_id = EXCLUDED.plan_price_id,
      country_code = EXCLUDED.country_code, provider_state_at = EXCLUDED.provider_state_at,
      scheduled_plan_code = NULL, scheduled_at = NULL, paused_at = NULL, paused_from_status = NULL,
      started_at = coalesce(s.started_at, EXCLUDED.started_at), updated_at = now();
    PERFORM billing.set_event_context(NULL);
    -- A no-card trial cancellation is superseded by the paid subscription.
    UPDATE billing.cancellation_requests SET status = 'reversed', reversed_at = now()
     WHERE company_id = chk.company_id AND status = 'scheduled' AND provider IS NULL;
    UPDATE public.billing_checkouts SET status = 'complete' WHERE id = chk.id;
    account := (SELECT l.billing_account_id FROM billing.billing_account_companies l WHERE l.company_id = chk.company_id);
    PERFORM billing.write_audit('subscription.activated', 'subscription', chk.company_id::text, account, NULL,
      jsonb_build_object('planCode', chk.plan_code, 'planPriceId', chk.plan_price_id, 'provider', _provider,
        'status', next_status, 'eventId', _event_id), 'Provider confirmed checkout');
    RETURN jsonb_build_object('result', 'applied', 'companyId', chk.company_id, 'offerCode', chk.offer_code);
  END IF;

  SELECT * INTO sub FROM public.company_subscriptions
   WHERE provider = _provider AND provider_subscription_id = nullif(_data ->> 'subscriptionId', '') FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'skipped', 'reason', 'unknown subscription');
  END IF;
  IF sub.provider_state_at IS NOT NULL AND occurred < sub.provider_state_at THEN
    RETURN jsonb_build_object('result', 'skipped', 'reason', 'stale event', 'companyId', sub.company_id);
  END IF;
  account := (SELECT l.billing_account_id FROM billing.billing_account_companies l WHERE l.company_id = sub.company_id);

  IF _kind = 'subscription_state' THEN
    IF next_status IS NOT NULL AND next_status NOT IN ('active', 'trialing', 'past_due', 'paused') THEN
      RAISE EXCEPTION 'Unknown subscription status %', next_status USING ERRCODE = '22023';
    END IF;
    IF nullif(_data ->> 'providerPriceId', '') IS NOT NULL THEN
      SELECT m.plan_price_id, v.plan_code INTO mapped_price, mapped_plan
        FROM billing.provider_price_mappings m
        JOIN public.plan_prices p ON p.id = m.plan_price_id
        JOIN public.plan_versions v ON v.id = p.version_id
       WHERE m.provider = _provider AND m.provider_price_id = _data ->> 'providerPriceId'
       LIMIT 1;
    END IF;
    -- A downgrade is charged at renewal; keep the current plan until the scheduled time.
    IF mapped_plan IS NOT NULL AND mapped_plan = sub.scheduled_plan_code AND sub.scheduled_at > occurred THEN
      mapped_plan := NULL;
      mapped_price := NULL;
    END IF;
    IF mapped_price IS NOT NULL AND mapped_price IS DISTINCT FROM sub.plan_price_id THEN
      SELECT * INTO price FROM public.plan_prices WHERE id = mapped_price;
    END IF;
    PERFORM billing.set_event_context(jsonb_build_object(
      'type', CASE WHEN price.id IS NOT NULL THEN 'plan_changed'
                   WHEN next_status = 'active' AND sub.status = 'active' AND period_end > sub.current_period_end THEN 'renewed'
                   ELSE 'status_changed' END,
      'source', 'provider', 'effectiveAt', occurred, 'details', jsonb_build_object('eventId', _event_id)));
    UPDATE public.company_subscriptions SET
      status = coalesce(next_status, status),
      current_period_end = coalesce(period_end, current_period_end),
      cancel_at_period_end = coalesce((_data ->> 'cancelAtPeriodEnd')::boolean, cancel_at_period_end),
      plan_code = coalesce(mapped_plan, plan_code),
      plan_price_id = CASE WHEN price.id IS NOT NULL THEN price.id ELSE plan_price_id END,
      price_version_id = CASE WHEN price.id IS NOT NULL THEN price.version_id ELSE price_version_id END,
      unit_amount_minor = CASE WHEN price.id IS NOT NULL THEN price.amount_minor ELSE unit_amount_minor END,
      scheduled_plan_code = CASE WHEN mapped_plan IS NOT NULL AND mapped_plan = scheduled_plan_code THEN NULL ELSE scheduled_plan_code END,
      scheduled_at = CASE WHEN mapped_plan IS NOT NULL AND mapped_plan = scheduled_plan_code THEN NULL ELSE scheduled_at END,
      provider_state_at = occurred, updated_at = now()
    WHERE company_id = sub.company_id;
    PERFORM billing.set_event_context(NULL);
    -- A cancellation withdrawn at the provider (for example in the Stripe portal).
    IF (_data ->> 'cancelAtPeriodEnd')::boolean IS FALSE THEN
      UPDATE billing.cancellation_requests SET status = 'reversed', reversed_at = now()
       WHERE company_id = sub.company_id AND status = 'scheduled' AND provider = _provider;
    END IF;
    -- A cancellation made directly at the provider is recorded so the sweep and history see it.
    IF (_data ->> 'cancelAtPeriodEnd')::boolean IS TRUE AND NOT EXISTS (
         SELECT 1 FROM billing.cancellation_requests r WHERE r.company_id = sub.company_id AND r.status IN ('scheduled', 'pending_provider')) THEN
      INSERT INTO billing.cancellation_requests (company_id, billing_account_id, requested_by, confirmed, from_status,
        plan_code, effective_at, status, provider, reversible)
      VALUES (sub.company_id, account, NULL, true, sub.status, sub.plan_code,
        coalesce(period_end, sub.current_period_end, now()), 'scheduled', _provider, _provider <> 'razorpay');
    END IF;
    RETURN jsonb_build_object('result', 'applied', 'companyId', sub.company_id, 'planChanged', price.id IS NOT NULL);

  ELSIF _kind = 'payment_failed' THEN
    IF sub.status IN ('cancelled', 'expired') THEN
      RETURN jsonb_build_object('result', 'skipped', 'reason', 'subscription ended', 'companyId', sub.company_id);
    END IF;
    PERFORM billing.set_event_context(jsonb_build_object('type', 'payment_failed', 'source', 'provider',
      'effectiveAt', occurred, 'details', jsonb_build_object('eventId', _event_id)));
    UPDATE public.company_subscriptions SET status = 'past_due', provider_state_at = occurred, updated_at = now()
     WHERE company_id = sub.company_id;
    PERFORM billing.set_event_context(NULL);
    RETURN jsonb_build_object('result', 'applied', 'companyId', sub.company_id);

  ELSIF _kind = 'subscription_ended' THEN
    PERFORM billing.set_event_context(jsonb_build_object('type', 'cancelled', 'source', 'provider',
      'effectiveAt', occurred, 'details', jsonb_build_object('eventId', _event_id)));
    UPDATE public.company_subscriptions SET status = 'cancelled', cancel_at_period_end = false,
      provider_state_at = occurred, updated_at = now()
     WHERE company_id = sub.company_id AND status <> 'cancelled';
    PERFORM billing.set_event_context(NULL);
    UPDATE billing.cancellation_requests SET status = 'effective', completed_at = now()
     WHERE company_id = sub.company_id AND status IN ('scheduled', 'pending_provider');
    PERFORM billing.write_audit('subscription.cancelled', 'subscription', sub.company_id::text, account,
      jsonb_build_object('status', sub.status), jsonb_build_object('status', 'cancelled', 'eventId', _event_id),
      'Provider ended the subscription');
    RETURN jsonb_build_object('result', 'applied', 'companyId', sub.company_id);
  END IF;
  RAISE EXCEPTION 'Unknown provider event kind %', _kind USING ERRCODE = '22023';
END $$;

-- History also records renewals (a later billing period end).
CREATE OR REPLACE FUNCTION billing.log_subscription_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  ctx jsonb := nullif(current_setting('billing.event_context', true), '')::jsonb;
  kind text;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.status, NEW.plan_code, NEW.cancel_at_period_end, NEW.scheduled_plan_code, NEW.current_period_end)
     IS NOT DISTINCT FROM (OLD.status, OLD.plan_code, OLD.cancel_at_period_end, OLD.scheduled_plan_code, OLD.current_period_end) THEN
    RETURN NEW;
  END IF;
  kind := coalesce(ctx ->> 'type', CASE
    WHEN TG_OP = 'INSERT' THEN CASE WHEN NEW.status = 'trialing' THEN 'trial_started' ELSE 'created' END
    WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'status_changed'
    WHEN NEW.plan_code IS DISTINCT FROM OLD.plan_code THEN 'plan_changed'
    WHEN NEW.current_period_end > OLD.current_period_end THEN 'renewed'
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

-- The public price list also says whether the country is open for online payment.
CREATE OR REPLACE FUNCTION public.billing_price_list(_country text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH c AS (
    SELECT (SELECT co.code FROM billing.countries co WHERE co.code = upper(btrim(coalesce(_country, '')))) AS code
  )
  SELECT jsonb_build_object(
    'country', (SELECT code FROM c),
    'baseCurrency', 'USD',
    'billingEnabled', coalesce((SELECT co.billing_enabled FROM billing.countries co WHERE co.code = (SELECT code FROM c)), false),
    'providers', to_jsonb(billing.country_providers((SELECT code FROM c))),
    'plans', coalesce(jsonb_agg(jsonb_build_object(
      'code', bp.code,
      'name', v.name,
      'versionId', v.id,
      'publishedAt', v.published_at,
      'prices', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'priceId', p.id, 'interval', p.billing_interval, 'currency', p.currency,
          'amountMinor', p.amount_minor, 'strategy', p.strategy, 'country', p.country_code)
          ORDER BY p.billing_interval)
          FROM billing.country_price_rows(v.id, (SELECT code FROM c)) p
         WHERE p.archived_at IS NULL), '[]'::jsonb)
    ) ORDER BY bp.plan_rank), '[]'::jsonb)
  )
  FROM public.billing_plans bp
  JOIN LATERAL (
    SELECT pv.* FROM public.plan_versions pv
     WHERE pv.plan_code = bp.code AND pv.status = 'published' AND pv.visibility = 'live' AND pv.price_book
     ORDER BY pv.version_no DESC LIMIT 1
  ) v ON true
  WHERE bp.is_active AND bp.is_public AND bp.pricing_source = 'price_book';
$$;

-- ---------------------------------------------------------------------------
-- 9. Platform administration
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_payment_settings() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_platform('billing.view');
  RETURN jsonb_build_object(
    'routes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'country', r.country_code, 'provider', r.provider,
        'enabled', r.enabled, 'priority', r.priority) ORDER BY r.country_code NULLS LAST, r.priority)
      FROM billing.payment_provider_routes r), '[]'::jsonb),
    'billingCountries', coalesce((SELECT jsonb_agg(c.code ORDER BY c.code) FROM billing.countries c WHERE c.billing_enabled), '[]'::jsonb),
    'webhooks', coalesce((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'provider', e.provider, 'eventType', e.event_type,
        'status', e.status, 'attempts', e.attempts, 'lastError', e.last_error, 'mode', e.mode,
        'receivedAt', e.created_at, 'processedAt', e.processed_at) ORDER BY e.created_at DESC)
      FROM (SELECT * FROM public.billing_events ORDER BY created_at DESC LIMIT 50) e), '[]'::jsonb),
    'webhookCounts', coalesce((SELECT jsonb_object_agg(status, n) FROM (
        SELECT status, count(*) AS n FROM public.billing_events GROUP BY status) x), '{}'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.platform_set_provider_route(
  _country text, _provider text, _enabled boolean, _priority integer, _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  country char(2) := nullif(upper(btrim(coalesce(_country, ''))), '');
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF _provider NOT IN ('stripe', 'razorpay') OR _priority IS NULL OR _priority NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Choose Stripe or Razorpay and a priority from 1 to 1000' USING ERRCODE = '22023';
  END IF;
  IF country IS NOT NULL AND NOT EXISTS (SELECT 1 FROM billing.countries c WHERE c.code = country) THEN
    RAISE EXCEPTION 'Unknown country' USING ERRCODE = '22023';
  END IF;
  UPDATE billing.payment_provider_routes SET enabled = coalesce(_enabled, true), priority = _priority,
    updated_by = auth.uid(), updated_at = now()
   WHERE country_code IS NOT DISTINCT FROM country AND provider = _provider;
  IF NOT FOUND THEN
    INSERT INTO billing.payment_provider_routes (country_code, provider, enabled, priority, updated_by)
    VALUES (country, _provider, coalesce(_enabled, true), _priority, auth.uid());
  END IF;
  PERFORM private.platform_log('payments.route_set', 'payment_route', coalesce(country, 'DEFAULT') || ':' || _provider, NULL,
    jsonb_build_object('enabled', coalesce(_enabled, true), 'priority', _priority), _reason);
  RETURN jsonb_build_object('country', country, 'provider', _provider, 'providers', to_jsonb(billing.country_providers(country)));
END $$;

-- Opening a country for paid checkout is a global change: tax and provider eligibility must be
-- confirmed outside LinkBooks first (decisions D7, D8, D12).
CREATE OR REPLACE FUNCTION public.platform_set_country_billing(_country text, _enabled boolean, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  country char(2) := upper(btrim(coalesce(_country, '')));
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF public.platform_role() IS DISTINCT FROM 'platform_owner' THEN
    RAISE EXCEPTION 'Only a platform owner can open or close a billing country' USING ERRCODE = '42501';
  END IF;
  UPDATE billing.countries SET billing_enabled = coalesce(_enabled, false) WHERE code = country;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown country' USING ERRCODE = '22023';
  END IF;
  PERFORM private.platform_log('payments.country_billing_set', 'billing_country', country, NULL,
    jsonb_build_object('enabled', coalesce(_enabled, false)), _reason);
  RETURN jsonb_build_object('country', country, 'enabled', coalesce(_enabled, false));
END $$;

CREATE OR REPLACE FUNCTION public.platform_requeue_webhook_event(_id uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_platform('billing.manage');
  UPDATE public.billing_events SET status = 'received', attempts = 0, next_attempt_at = NULL, last_error = NULL
   WHERE id = _id AND status IN ('failed', 'dead');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only a failed event can be retried' USING ERRCODE = '22023';
  END IF;
  PERFORM private.platform_log('payments.webhook_requeued', 'billing_event', _id::text, NULL, NULL, _reason);
  RETURN jsonb_build_object('id', _id, 'status', 'received');
END $$;

-- ---------------------------------------------------------------------------
-- 10. Grants
-- ---------------------------------------------------------------------------
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['billing.country_providers(text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', f);
    EXCEPTION WHEN undefined_object THEN NULL; END;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.billing_confirm_provider_cancellation(uuid, boolean, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_confirm_provider_reversal(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_record_plan_change(uuid, uuid, text, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_provider_price(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_record_provider_price(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_webhook_receive(text, text, text, jsonb, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_webhook_claim(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_webhook_finish(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_webhook_due(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_apply_provider_event(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_confirm_provider_cancellation(uuid, boolean, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_confirm_provider_reversal(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_record_plan_change(uuid, uuid, text, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_provider_price(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_record_provider_price(uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_webhook_receive(text, text, text, jsonb, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_webhook_claim(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_webhook_finish(uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_webhook_due(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_apply_provider_event(text, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.billing_checkout_price(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_prepare_plan_change(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_payment_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_set_provider_route(text, text, boolean, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_set_country_billing(text, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_requeue_webhook_event(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_checkout_price(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_prepare_plan_change(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_payment_settings() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_set_provider_route(text, text, boolean, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_set_country_billing(text, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_requeue_webhook_event(uuid, text) TO authenticated, service_role;
