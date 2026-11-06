-- AD-07: Advisors billing bridge onto existing billing_plans / company_subscriptions.
-- Does NOT invent a second payment engine. Proposal/agreement acceptance never starts billing.

ALTER TABLE public.advisors_clients
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS advisors_clients_company_uidx
  ON public.advisors_clients (company_id)
  WHERE company_id IS NOT NULL;

-- Map Advisors marketing plan codes to chargeable billing_plans codes.
CREATE TABLE IF NOT EXISTS public.advisors_billing_sku_map (
  advisors_plan_code text PRIMARY KEY,
  service_code text NOT NULL CHECK (service_code IN ('bookkeeping', 'coaching')),
  billing_plan_code text NOT NULL REFERENCES public.billing_plans(code),
  default_interval text NOT NULL DEFAULT 'month'
    CHECK (default_interval IN ('month', 'year')),
  is_recurring boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.advisors_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL UNIQUE REFERENCES public.advisors_engagements(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.advisors_clients(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  advisors_plan_code text,
  billing_plan_code text NOT NULL REFERENCES public.billing_plans(code),
  billing_interval text NOT NULL CHECK (billing_interval IN ('month', 'year')),
  currency text NOT NULL DEFAULT 'USD',
  amount_minor integer NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  status text NOT NULL DEFAULT 'pending_checkout'
    CHECK (status IN (
      'pending_checkout', 'checkout_open', 'trialing', 'active',
      'past_due', 'paused', 'cancelled', 'expired', 'manual_active'
    )),
  checkout_id uuid REFERENCES public.billing_checkouts(id) ON DELETE SET NULL,
  started_at timestamptz,
  cancelled_at timestamptz,
  admin_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS advisors_subscriptions_company_idx
  ON public.advisors_subscriptions (company_id, status);
CREATE INDEX IF NOT EXISTS advisors_subscriptions_status_idx
  ON public.advisors_subscriptions (status, updated_at DESC);

ALTER TABLE public.advisors_billing_sku_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisors_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.advisors_billing_sku_map, public.advisors_subscriptions FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON public.advisors_billing_sku_map, public.advisors_subscriptions FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Seed non-public Advisors SKUs into the existing catalogue (legacy priced for checkout quotes).
INSERT INTO public.billing_plans (
  code, name, audience, summary,
  monthly_gbp, monthly_usd, monthly_inr,
  users_included, invoices_per_month, bills_per_month, multi_currency,
  highlights, sort_order, is_public, is_active,
  plan_rank, trial_enabled, trial_days, pricing_source
) VALUES
  ('advisors_essential_books', 'Advisors Essential Books', 'Advisors bookkeeping',
   'Core monthly bookkeeping delivered by LinkBooks Advisors.',
   15900, 19900, 1699000, 1, NULL, NULL, false,
   '["Advisor-delivered bookkeeping", "Monthly reports", "Secure document handoff"]'::jsonb,
   110, false, true, 110, false, 1, 'legacy'),
  ('advisors_growth_books', 'Advisors Growth Books', 'Advisors bookkeeping',
   'Expanded monthly bookkeeping for growing businesses.',
   27900, 34900, 2999000, 1, NULL, NULL, false,
   '["Everything in Essential Books", "Higher transaction allowance", "Advisor review"]'::jsonb,
   120, false, true, 120, false, 1, 'legacy'),
  ('advisors_complete_books', 'Advisors Complete Books', 'Advisors bookkeeping',
   'Full-service monthly bookkeeping with closer advisor oversight.',
   39900, 49900, 4299000, 1, NULL, NULL, false,
   '["Everything in Growth Books", "Priority advisor support"]'::jsonb,
   130, false, true, 130, false, 1, 'legacy'),
  ('advisors_quick_guidance', 'Advisors Quick Guidance', 'Advisors coaching',
   'Single coaching guidance pack (charged as a one-month Advisors SKU until one-shot checkout lands).',
   7900, 9900, 84900, 1, NULL, NULL, false,
   '["Focused coaching session pack", "Does not auto-renew SaaS product entitlements"]'::jsonb,
   140, false, true, 140, false, 1, 'legacy'),
  ('advisors_monthly_coaching', 'Advisors Monthly Coaching', 'Advisors coaching',
   'Recurring monthly coaching delivered by LinkBooks Advisors.',
   19900, 24900, 2149000, 1, NULL, NULL, false,
   '["Monthly coaching cadence", "Session tracking in Advisors workspace"]'::jsonb,
   150, false, true, 150, false, 1, 'legacy'),
  ('advisors_business_coaching', 'Advisors Business Coaching', 'Advisors coaching',
   'Higher-touch recurring coaching for established businesses.',
   39900, 49900, 4299000, 1, NULL, NULL, false,
   '["Everything in Monthly Coaching", "Priority coaching slots"]'::jsonb,
   160, false, true, 160, false, 1, 'legacy')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  audience = EXCLUDED.audience,
  summary = EXCLUDED.summary,
  monthly_gbp = EXCLUDED.monthly_gbp,
  monthly_usd = EXCLUDED.monthly_usd,
  monthly_inr = EXCLUDED.monthly_inr,
  highlights = EXCLUDED.highlights,
  is_public = false,
  is_active = true,
  trial_enabled = false,
  trial_days = 1,
  pricing_source = 'legacy',
  updated_at = now();

-- Published versions so entitlements resolve; Advisors SKUs do not grant SaaS posting features.
DO $$
DECLARE
  p record;
  vid uuid;
  next_no integer;
  marker constant text := 'Advisors AD-07 catalogue';
BEGIN
  FOR p IN
    SELECT code, name, audience, summary, sort_order
    FROM public.billing_plans
    WHERE code LIKE 'advisors_%'
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.plan_versions
      WHERE plan_code = p.code AND reason = marker AND status = 'published'
    ) THEN
      CONTINUE;
    END IF;
    SELECT coalesce(max(version_no), 0) + 1 INTO next_no
    FROM public.plan_versions WHERE plan_code = p.code;
    UPDATE public.plan_versions
       SET status = 'archived', visibility = 'hidden'
     WHERE plan_code = p.code AND status = 'published';
    INSERT INTO public.plan_versions(
      plan_code, version_no, status, name, audience, summary, sort_order,
      visibility, effective_from, published_at, reason
    ) VALUES (
      p.code, next_no, 'published', p.name, p.audience, p.summary, p.sort_order,
      'hidden', now(), now(), marker
    )
    RETURNING id INTO vid;
    INSERT INTO public.plan_version_limits (version_id, feature_key, enabled, limit_value)
    SELECT vid, f.key, false, NULL
    FROM public.billing_features f
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

INSERT INTO public.advisors_billing_sku_map (
  advisors_plan_code, service_code, billing_plan_code, default_interval, is_recurring, notes
) VALUES
  ('essential_books', 'bookkeeping', 'advisors_essential_books', 'month', true, ''),
  ('growth_books', 'bookkeeping', 'advisors_growth_books', 'month', true, ''),
  ('complete_books', 'bookkeeping', 'advisors_complete_books', 'month', true, ''),
  ('quick_guidance', 'coaching', 'advisors_quick_guidance', 'month', false, 'Session pack uses monthly checkout SKU'),
  ('monthly_coaching', 'coaching', 'advisors_monthly_coaching', 'month', true, ''),
  ('business_coaching', 'coaching', 'advisors_business_coaching', 'month', true, '')
ON CONFLICT (advisors_plan_code) DO UPDATE SET
  billing_plan_code = EXCLUDED.billing_plan_code,
  default_interval = EXCLUDED.default_interval,
  is_recurring = EXCLUDED.is_recurring,
  notes = EXCLUDED.notes;

CREATE OR REPLACE FUNCTION private.advisors_client_json(c public.advisors_clients)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'email', c.email,
    'name', c.name,
    'businessName', c.business_name,
    'phone', c.phone,
    'status', c.status,
    'primaryServiceCode', c.primary_service_code,
    'assignedAdvisorId', c.assigned_advisor_id,
    'sourceLeadId', c.source_lead_id,
    'sourceAppointmentId', c.source_appointment_id,
    'companyId', c.company_id,
    'notes', c.notes,
    'createdAt', c.created_at,
    'updatedAt', c.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.advisors_subscription_json(s public.advisors_subscriptions)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', s.id,
    'engagementId', s.engagement_id,
    'clientId', s.client_id,
    'companyId', s.company_id,
    'advisorsPlanCode', s.advisors_plan_code,
    'billingPlanCode', s.billing_plan_code,
    'billingInterval', s.billing_interval,
    'currency', s.currency,
    'amountMinor', s.amount_minor,
    'status', s.status,
    'checkoutId', s.checkout_id,
    'startedAt', s.started_at,
    'cancelledAt', s.cancelled_at,
    'adminNotes', s.admin_notes,
    'createdAt', s.created_at,
    'updatedAt', s.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_list_billing(
  _status text DEFAULT NULL,
  _limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim integer := least(greatest(coalesce(_limit, 100), 1), 200);
BEGIN
  PERFORM private.require_platform('billing.view');
  IF _status IS NOT NULL AND _status NOT IN (
    'pending_checkout', 'checkout_open', 'trialing', 'active',
    'past_due', 'paused', 'cancelled', 'expired', 'manual_active'
  ) THEN
    RAISE EXCEPTION 'Unsupported Advisors billing status filter' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'skuMap', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'advisorsPlanCode', m.advisors_plan_code,
        'serviceCode', m.service_code,
        'billingPlanCode', m.billing_plan_code,
        'defaultInterval', m.default_interval,
        'isRecurring', m.is_recurring,
        'notes', m.notes,
        'planName', bp.name,
        'monthlyUsd', bp.monthly_usd
      ) ORDER BY m.service_code, m.advisors_plan_code)
      FROM public.advisors_billing_sku_map m
      JOIN public.billing_plans bp ON bp.code = m.billing_plan_code
    ), '[]'::jsonb),
    'subscriptions', COALESCE((
      SELECT jsonb_agg(
        private.advisors_subscription_json(s)
          || jsonb_build_object(
            'engagementTitle', e.title,
            'clientEmail', c.email,
            'clientName', c.name,
            'companyName', co.name,
            'companySubscriptionStatus', cs.status,
            'companyPlanCode', cs.plan_code
          )
        ORDER BY s.updated_at DESC
      )
      FROM (
        SELECT *
        FROM public.advisors_subscriptions s
        WHERE (_status IS NULL OR s.status = _status)
        ORDER BY s.updated_at DESC
        LIMIT lim
      ) s
      JOIN public.advisors_engagements e ON e.id = s.engagement_id
      JOIN public.advisors_clients c ON c.id = s.client_id
      JOIN public.companies co ON co.id = s.company_id
      LEFT JOIN public.company_subscriptions cs ON cs.company_id = s.company_id
    ), '[]'::jsonb),
    'eligibleEngagements', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id,
        'title', e.title,
        'status', e.status,
        'serviceCode', e.service_code,
        'planCode', e.plan_code,
        'amountMinor', e.amount_minor,
        'currency', e.currency,
        'billingInterval', e.billing_interval,
        'clientId', c.id,
        'clientEmail', c.email,
        'clientName', c.name,
        'companyId', c.company_id,
        'hasSubscription', EXISTS (
          SELECT 1 FROM public.advisors_subscriptions x WHERE x.engagement_id = e.id
        )
      ) ORDER BY e.updated_at DESC)
      FROM (
        SELECT e.*
        FROM public.advisors_engagements e
        WHERE e.status IN ('accepted', 'onboarding', 'active')
        ORDER BY e.updated_at DESC
        LIMIT 100
      ) e
      JOIN public.advisors_clients c ON c.id = e.client_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_link_client_company(
  _client_id uuid, _company_id uuid, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client public.advisors_clients;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id) THEN
    RAISE EXCEPTION 'Company not found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.advisors_clients
     SET company_id = _company_id, updated_at = now()
   WHERE id = _client_id
   RETURNING * INTO client;
  IF client.id IS NULL THEN
    RAISE EXCEPTION 'Advisors client not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM private.platform_log(
    'advisors.client.link_company',
    'advisors_clients',
    client.id::text,
    NULL,
    jsonb_build_object('companyId', _company_id),
    _reason
  );
  RETURN private.advisors_client_json(client) || jsonb_build_object('companyId', client.company_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_prepare_subscription(
  _engagement_id uuid, _interval text, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  eng public.advisors_engagements;
  client public.advisors_clients;
  map public.advisors_billing_sku_map;
  plan public.billing_plans;
  sub public.advisors_subscriptions;
  interval_norm text;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO eng FROM public.advisors_engagements WHERE id = _engagement_id FOR UPDATE;
  IF eng.id IS NULL THEN
    RAISE EXCEPTION 'Engagement not found' USING ERRCODE = 'P0002';
  END IF;
  IF eng.status NOT IN ('accepted', 'onboarding', 'active') THEN
    RAISE EXCEPTION 'Engagement must be accepted or onboarding before billing can start'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO client FROM public.advisors_clients WHERE id = eng.client_id;
  IF client.company_id IS NULL THEN
    RAISE EXCEPTION 'Link the Advisors client to a dedicated billing company first'
      USING ERRCODE = '22023';
  END IF;
  IF nullif(eng.plan_code, '') IS NULL THEN
    RAISE EXCEPTION 'Engagement needs an Advisors plan code before billing' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO map FROM public.advisors_billing_sku_map WHERE advisors_plan_code = eng.plan_code;
  IF map.advisors_plan_code IS NULL THEN
    RAISE EXCEPTION 'No billing SKU mapped for Advisors plan %', eng.plan_code USING ERRCODE = 'P0002';
  END IF;
  interval_norm := coalesce(nullif(_interval, ''), map.default_interval, 'month');
  IF interval_norm NOT IN ('month', 'year') THEN
    RAISE EXCEPTION 'Billing interval must be month or year' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO plan FROM public.billing_plans WHERE code = map.billing_plan_code AND is_active;
  IF plan.code IS NULL THEN
    RAISE EXCEPTION 'Mapped billing plan is not active' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.advisors_subscriptions(
    engagement_id, client_id, company_id, advisors_plan_code, billing_plan_code,
    billing_interval, currency, amount_minor, status
  ) VALUES (
    eng.id, client.id, client.company_id, eng.plan_code, plan.code,
    interval_norm, eng.currency,
    CASE
      WHEN eng.amount_minor > 0 THEN eng.amount_minor
      WHEN interval_norm = 'year' THEN plan.monthly_usd * 10
      ELSE plan.monthly_usd
    END,
    'pending_checkout'
  )
  ON CONFLICT (engagement_id) DO UPDATE
    SET billing_plan_code = EXCLUDED.billing_plan_code,
        billing_interval = EXCLUDED.billing_interval,
        currency = EXCLUDED.currency,
        amount_minor = EXCLUDED.amount_minor,
        advisors_plan_code = EXCLUDED.advisors_plan_code,
        company_id = EXCLUDED.company_id,
        client_id = EXCLUDED.client_id,
        status = CASE
          WHEN public.advisors_subscriptions.status IN ('active', 'trialing', 'manual_active')
            THEN public.advisors_subscriptions.status
          ELSE 'pending_checkout'
        END,
        updated_at = now()
  RETURNING * INTO sub;

  PERFORM private.platform_log(
    'advisors.subscription.prepare',
    'advisors_subscriptions',
    sub.id::text,
    NULL,
    private.advisors_subscription_json(sub),
    _reason
  );
  RETURN private.advisors_subscription_json(sub);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_attach_checkout(
  _subscription_id uuid, _checkout_id uuid, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub public.advisors_subscriptions;
  checkout_ref uuid;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO sub FROM public.advisors_subscriptions WHERE id = _subscription_id FOR UPDATE;
  IF sub.id IS NULL THEN
    RAISE EXCEPTION 'Advisors subscription not found' USING ERRCODE = 'P0002';
  END IF;
  IF sub.status NOT IN ('pending_checkout', 'checkout_open', 'expired', 'cancelled') THEN
    RAISE EXCEPTION 'Subscription is not open for checkout' USING ERRCODE = '22023';
  END IF;
  checkout_ref := coalesce(
    _checkout_id,
    (
      SELECT c.id FROM public.billing_checkouts c
      WHERE c.company_id = sub.company_id
      ORDER BY c.created_at DESC
      LIMIT 1
    )
  );
  UPDATE public.advisors_subscriptions
     SET checkout_id = coalesce(checkout_ref, checkout_id),
         status = 'checkout_open',
         updated_at = now()
   WHERE id = sub.id
   RETURNING * INTO sub;
  PERFORM private.platform_log(
    'advisors.subscription.checkout',
    'advisors_subscriptions',
    sub.id::text,
    NULL,
    jsonb_build_object('checkoutId', sub.checkout_id),
    _reason
  );
  RETURN private.advisors_subscription_json(sub);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_sync_subscription(
  _subscription_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub public.advisors_subscriptions;
  cs public.company_subscriptions;
  next_status text;
BEGIN
  PERFORM private.require_platform('billing.view');
  SELECT * INTO sub FROM public.advisors_subscriptions WHERE id = _subscription_id FOR UPDATE;
  IF sub.id IS NULL THEN
    RAISE EXCEPTION 'Advisors subscription not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO cs FROM public.company_subscriptions WHERE company_id = sub.company_id;
  IF cs.company_id IS NULL THEN
    RETURN private.advisors_subscription_json(sub) || jsonb_build_object('companySubscription', NULL);
  END IF;

  next_status := CASE
    WHEN sub.status = 'manual_active' THEN 'manual_active'
    WHEN cs.status IN ('active', 'trialing', 'past_due', 'paused', 'cancelled', 'expired') THEN cs.status
    WHEN sub.checkout_id IS NOT NULL THEN 'checkout_open'
    ELSE sub.status
  END;

  UPDATE public.advisors_subscriptions
     SET status = next_status,
         started_at = CASE
           WHEN next_status IN ('active', 'trialing', 'manual_active') THEN coalesce(started_at, now())
           ELSE started_at
         END,
         cancelled_at = CASE
           WHEN next_status IN ('cancelled', 'expired') THEN coalesce(cancelled_at, now())
           ELSE cancelled_at
         END,
         billing_plan_code = coalesce(cs.plan_code, billing_plan_code),
         updated_at = now()
   WHERE id = sub.id
   RETURNING * INTO sub;

  IF next_status IN ('active', 'trialing', 'manual_active') THEN
    UPDATE public.advisors_engagements
       SET status = CASE WHEN status IN ('accepted', 'onboarding') THEN 'active' ELSE status END,
           updated_at = now()
     WHERE id = sub.engagement_id;
  END IF;

  RETURN private.advisors_subscription_json(sub) || jsonb_build_object(
    'companySubscription', jsonb_build_object(
      'planCode', cs.plan_code,
      'status', cs.status,
      'interval', cs.billing_interval,
      'provider', cs.provider
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_mark_manual_billing(
  _subscription_id uuid, _active boolean, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub public.advisors_subscriptions;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  -- Manual status is an ops marker only. It does not invent provider payment success.
  UPDATE public.advisors_subscriptions
     SET status = CASE WHEN _active THEN 'manual_active' ELSE 'cancelled' END,
         started_at = CASE WHEN _active THEN coalesce(started_at, now()) ELSE started_at END,
         cancelled_at = CASE WHEN _active THEN NULL ELSE coalesce(cancelled_at, now()) END,
         admin_notes = coalesce(nullif(_reason, ''), admin_notes),
         updated_at = now()
   WHERE id = _subscription_id
   RETURNING * INTO sub;
  IF sub.id IS NULL THEN
    RAISE EXCEPTION 'Advisors subscription not found' USING ERRCODE = 'P0002';
  END IF;
  IF _active THEN
    UPDATE public.advisors_engagements
       SET status = CASE WHEN status IN ('accepted', 'onboarding') THEN 'active' ELSE status END,
           updated_at = now()
     WHERE id = sub.engagement_id;
  END IF;
  PERFORM private.platform_log(
    'advisors.subscription.manual',
    'advisors_subscriptions',
    sub.id::text,
    NULL,
    jsonb_build_object('active', _active),
    _reason
  );
  RETURN private.advisors_subscription_json(sub);
END;
$$;

-- Overview metrics: open Advisors billings.
CREATE OR REPLACE FUNCTION public.platform_advisors_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.require_platform('billing.view');
  RETURN jsonb_build_object(
    'newInquiries', (SELECT count(*)::int FROM public.advisors_leads WHERE status = 'new'),
    'openConversations', (SELECT count(*)::int FROM public.advisors_conversations WHERE status = 'open'),
    'handedOffConversations', (SELECT count(*)::int FROM public.advisors_conversations WHERE status = 'handed_off'),
    'pendingConsultations', (
      SELECT count(*)::int FROM public.advisors_appointments
      WHERE status = 'confirmed' AND starts_at >= now()
    ),
    'upcomingAppointments', (
      SELECT count(*)::int FROM public.advisors_appointments
      WHERE status = 'confirmed'
        AND starts_at >= now()
        AND starts_at < now() + interval '7 days'
    ),
    'activeClients', (SELECT count(*)::int FROM public.advisors_clients WHERE status = 'active'),
    'prospectClients', (SELECT count(*)::int FROM public.advisors_clients WHERE status = 'prospect'),
    'activeAdvisors', (SELECT count(*)::int FROM public.advisors_staff WHERE is_active),
    'openProposals', (SELECT count(*)::int FROM public.advisors_proposals WHERE status = 'sent'),
    'onboardingEngagements', (SELECT count(*)::int FROM public.advisors_engagements WHERE status = 'onboarding'),
    'pendingBilling', (
      SELECT count(*)::int FROM public.advisors_subscriptions
      WHERE status IN ('pending_checkout', 'checkout_open')
    ),
    'activeBilling', (
      SELECT count(*)::int FROM public.advisors_subscriptions
      WHERE status IN ('active', 'trialing', 'manual_active')
    ),
    'recentInquiries', COALESCE((
      SELECT jsonb_agg(private.advisors_lead_json(l) ORDER BY l.created_at DESC)
      FROM (
        SELECT * FROM public.advisors_leads ORDER BY created_at DESC LIMIT 8
      ) l
    ), '[]'::jsonb),
    'upcoming', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'status', a.status,
        'startsAt', a.starts_at,
        'endsAt', a.ends_at,
        'customerName', a.customer_name,
        'customerEmail', a.customer_email,
        'businessName', a.business_name,
        'serviceCode', a.service_code
      ) ORDER BY a.starts_at)
      FROM (
        SELECT * FROM public.advisors_appointments
        WHERE status = 'confirmed' AND starts_at >= now()
        ORDER BY starts_at
        LIMIT 8
      ) a
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_advisors_list_billing(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_link_client_company(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_prepare_subscription(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_attach_checkout(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_sync_subscription(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_mark_manual_billing(uuid, boolean, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.platform_advisors_list_billing(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_link_client_company(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_prepare_subscription(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_attach_checkout(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_sync_subscription(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_mark_manual_billing(uuid, boolean, text) TO authenticated, service_role;
