-- Platform subscription access grants (complimentary) + admin detail/trial helpers.
-- Does not create fake Stripe/Razorpay payments. Provider state stays on company_subscriptions.

CREATE TABLE IF NOT EXISTS billing.subscription_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_code text NOT NULL REFERENCES public.billing_plans(code),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'scheduled', 'expired', 'revoked')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  lifetime boolean NOT NULL DEFAULT false,
  reason text NOT NULL CHECK (char_length(trim(reason)) >= 3),
  notes text NOT NULL DEFAULT '',
  previous_status text,
  previous_plan_code text,
  previous_provider text,
  previous_provider_subscription_id text,
  created_by uuid REFERENCES auth.users(id),
  revoked_by uuid REFERENCES auth.users(id),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (lifetime = false OR ends_at IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_access_grants_one_active
  ON billing.subscription_access_grants (company_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS subscription_access_grants_expiry_idx
  ON billing.subscription_access_grants (ends_at)
  WHERE status = 'active' AND ends_at IS NOT NULL;

ALTER TABLE billing.subscription_access_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing.subscription_access_grants FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.platform_subscription_admin_detail(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub public.company_subscriptions%ROWTYPE;
  _company public.companies%ROWTYPE;
BEGIN
  PERFORM private.require_platform('subscriptions.view');
  SELECT * INTO _company FROM public.companies WHERE id = _company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown company';
  END IF;
  SELECT * INTO _sub FROM public.company_subscriptions WHERE company_id = _company_id;
  RETURN jsonb_build_object(
    'company', jsonb_build_object(
      'id', _company.id,
      'name', _company.name,
      'countryCode', _company.country_code,
      'isDemo', _company.is_demo
    ),
    'subscription', CASE WHEN _sub.company_id IS NULL THEN NULL ELSE jsonb_build_object(
      'companyId', _sub.company_id,
      'planCode', _sub.plan_code,
      'status', _sub.status,
      'provider', _sub.provider,
      'providerSubscriptionId', _sub.provider_subscription_id,
      'billingInterval', _sub.billing_interval,
      'currency', _sub.currency,
      'unitAmountMinor', _sub.unit_amount_minor,
      'trialStartedAt', _sub.trial_started_at,
      'trialEndsAt', _sub.trial_ends_at,
      'currentPeriodEnd', _sub.current_period_end,
      'cancelAtPeriodEnd', _sub.cancel_at_period_end,
      'startedAt', _sub.started_at,
      'updatedAt', _sub.updated_at
    ) END,
    'activeGrant', (
      SELECT jsonb_build_object(
        'id', g.id,
        'planCode', g.plan_code,
        'status', g.status,
        'startsAt', g.starts_at,
        'endsAt', g.ends_at,
        'lifetime', g.lifetime,
        'reason', g.reason,
        'notes', g.notes
      )
      FROM billing.subscription_access_grants g
      WHERE g.company_id = _company_id AND g.status = 'active'
      ORDER BY g.created_at DESC
      LIMIT 1
    ),
    'entitlementOverrides', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', o.id,
        'featureKey', o.feature_key,
        'source', o.source,
        'effect', o.effect,
        'limitValue', o.limit_value,
        'startsAt', o.starts_at,
        'expiresAt', o.expires_at,
        'reason', o.reason,
        'notes', o.notes,
        'createdAt', o.created_at
      ) ORDER BY o.created_at DESC)
      FROM (
        SELECT *
          FROM public.entitlement_overrides
         WHERE scope = 'business' AND scope_id = _company_id AND approval_status = 'approved'
         ORDER BY created_at DESC
         LIMIT 100
      ) o
    ), '[]'::jsonb),
    'winningEntitlements', coalesce(public.winning_entitlements(_company_id, NULL), '{}'::jsonb),
    'audit', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'action', a.action,
        'actorId', a.actor_user_id,
        'reason', a.reason,
        'after', a.after_state,
        'createdAt', a.created_at
      ) ORDER BY a.created_at DESC)
      FROM (
        SELECT id, action, actor_user_id, reason, after_state, created_at
          FROM public.platform_audit
         WHERE entity_id = _company_id::text
            OR (after_state ->> 'companyId') = _company_id::text
         ORDER BY created_at DESC
         LIMIT 50
      ) a
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_grant_subscription_access(
  _company_id uuid,
  _plan_code text,
  _ends_at timestamptz,
  _lifetime boolean,
  _reason text,
  _notes text,
  _acknowledge_paid_overlap boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub public.company_subscriptions%ROWTYPE;
  _grant_id uuid;
  _paid boolean;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF char_length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)';
  END IF;
  IF _lifetime IS TRUE AND _ends_at IS NOT NULL THEN
    RAISE EXCEPTION 'Lifetime grants cannot set an end date';
  END IF;
  IF _lifetime IS NOT TRUE AND _ends_at IS NULL THEN
    RAISE EXCEPTION 'Set an end date or mark the grant as lifetime';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans p WHERE p.code = _plan_code AND p.is_active) THEN
    RAISE EXCEPTION 'Unknown or inactive plan';
  END IF;
  SELECT * INTO _sub FROM public.company_subscriptions WHERE company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company has no subscription row';
  END IF;
  _paid := _sub.provider IN ('stripe', 'razorpay')
       AND _sub.status IN ('active', 'trialing', 'past_due', 'paused');
  IF _paid AND NOT coalesce(_acknowledge_paid_overlap, false) THEN
    RAISE EXCEPTION
      'This company has an active paid provider subscription (%). Cancel it at the provider first, or pass acknowledge_paid_overlap after documenting that complimentary access will not cancel the provider mandate.',
      _sub.provider;
  END IF;

  UPDATE billing.subscription_access_grants
     SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), updated_at = now()
   WHERE company_id = _company_id AND status = 'active';

  INSERT INTO billing.subscription_access_grants (
    company_id, plan_code, status, starts_at, ends_at, lifetime, reason, notes,
    previous_status, previous_plan_code, previous_provider, previous_provider_subscription_id, created_by
  ) VALUES (
    _company_id, _plan_code, 'active', now(), CASE WHEN _lifetime THEN NULL ELSE _ends_at END,
    coalesce(_lifetime, false), trim(_reason), coalesce(_notes, ''),
    _sub.status, _sub.plan_code, _sub.provider, _sub.provider_subscription_id, auth.uid()
  ) RETURNING id INTO _grant_id;

  UPDATE public.company_subscriptions SET
    plan_code = _plan_code,
    status = 'complimentary',
    trial_ends_at = CASE WHEN _lifetime THEN NULL ELSE _ends_at END,
    updated_at = now()
  WHERE company_id = _company_id;

  PERFORM private.platform_log(
    'subscription.grant_access',
    'company',
    _company_id::text,
    NULL,
    jsonb_build_object(
      'companyId', _company_id,
      'grantId', _grant_id,
      'planCode', _plan_code,
      'endsAt', _ends_at,
      'lifetime', _lifetime,
      'paidOverlap', _paid
    ),
    trim(_reason)
  );

  RETURN jsonb_build_object('ok', true, 'grantId', _grant_id, 'paidOverlap', _paid);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_revoke_subscription_access(
  _company_id uuid,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _grant billing.subscription_access_grants%ROWTYPE;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF char_length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)';
  END IF;
  SELECT * INTO _grant FROM billing.subscription_access_grants
   WHERE company_id = _company_id AND status = 'active'
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active complimentary grant for this company';
  END IF;
  UPDATE billing.subscription_access_grants
     SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), updated_at = now(),
         notes = trim(coalesce(notes, '') || ' | revoke: ' || trim(_reason))
   WHERE id = _grant.id;
  UPDATE public.company_subscriptions SET
    status = CASE
      WHEN provider IN ('stripe', 'razorpay') AND provider_subscription_id IS NOT NULL THEN 'active'
      ELSE 'expired'
    END,
    plan_code = coalesce(_grant.previous_plan_code, plan_code),
    updated_at = now()
  WHERE company_id = _company_id;
  PERFORM private.platform_log(
    'subscription.revoke_access',
    'company',
    _company_id::text,
    NULL,
    jsonb_build_object('companyId', _company_id, 'grantId', _grant.id),
    trim(_reason)
  );
  RETURN jsonb_build_object('ok', true, 'grantId', _grant.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_extend_company_trial(
  _company_id uuid,
  _extra_days integer,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub public.company_subscriptions%ROWTYPE;
  _ends timestamptz;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF coalesce(_extra_days, 0) < 1 OR _extra_days > 366 THEN
    RAISE EXCEPTION 'Extra days must be between 1 and 366';
  END IF;
  IF char_length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)';
  END IF;
  SELECT * INTO _sub FROM public.company_subscriptions WHERE company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company has no subscription row';
  END IF;
  IF _sub.provider IN ('stripe', 'razorpay') THEN
    RAISE EXCEPTION
      'This company has a provider subscription. Extending a no-card trial does not change Stripe/Razorpay trial_end — use provider tooling or a verified provider operation.';
  END IF;
  _ends := coalesce(GREATEST(_sub.trial_ends_at, now()), now()) + make_interval(days => _extra_days);
  UPDATE public.company_subscriptions SET
    status = 'trialing',
    trial_started_at = coalesce(trial_started_at, now()),
    trial_ends_at = _ends,
    updated_at = now()
  WHERE company_id = _company_id;
  INSERT INTO billing.trial_grants (company_id, user_id, plan_code, started_at, ends_at, source)
  VALUES (_company_id, auth.uid(), _sub.plan_code, coalesce(_sub.trial_started_at, now()), _ends, 'manual')
  ON CONFLICT (company_id) DO UPDATE
    SET ends_at = EXCLUDED.ends_at,
        source = 'manual',
        started_at = LEAST(billing.trial_grants.started_at, EXCLUDED.started_at);
  PERFORM private.platform_log(
    'subscription.extend_trial',
    'company',
    _company_id::text,
    NULL,
    jsonb_build_object('companyId', _company_id, 'extraDays', _extra_days, 'trialEndsAt', _ends),
    trim(_reason)
  );
  RETURN jsonb_build_object('ok', true, 'trialEndsAt', _ends);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_end_company_trial(
  _company_id uuid,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF char_length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)';
  END IF;
  UPDATE public.company_subscriptions SET
    status = 'expired',
    trial_ends_at = least(coalesce(trial_ends_at, now()), now()),
    updated_at = now()
  WHERE company_id = _company_id
    AND status = 'trialing'
    AND provider = 'none';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No no-card trial to end for this company';
  END IF;
  PERFORM private.platform_log(
    'subscription.end_trial',
    'company',
    _company_id::text,
    NULL,
    jsonb_build_object('companyId', _company_id),
    trim(_reason)
  );
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Extend lifecycle sweep: expire complimentary grants + expired entitlement overrides (no-op if already expired).
CREATE OR REPLACE FUNCTION billing.expire_subscription_access_grants(_limit integer DEFAULT 200)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  rec record;
  n integer := 0;
BEGIN
  FOR rec IN
    SELECT g.id, g.company_id, g.previous_plan_code, g.previous_provider, g.previous_provider_subscription_id
      FROM billing.subscription_access_grants g
     WHERE g.status = 'active'
       AND g.lifetime = false
       AND g.ends_at IS NOT NULL
       AND g.ends_at <= now()
     ORDER BY g.ends_at
     LIMIT greatest(1, least(coalesce(_limit, 200), 500))
     FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE billing.subscription_access_grants
       SET status = 'expired', updated_at = now()
     WHERE id = rec.id;
    UPDATE public.company_subscriptions SET
      status = CASE
        WHEN provider IN ('stripe', 'razorpay') AND provider_subscription_id IS NOT NULL THEN 'active'
        ELSE 'expired'
      END,
      plan_code = coalesce(rec.previous_plan_code, plan_code),
      updated_at = now()
    WHERE company_id = rec.company_id
      AND status = 'complimentary';
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION billing.run_lifecycle_sweep(_limit integer DEFAULT 200) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  rec record;
  cancelled integer := 0;
  expired integer := 0;
  downgraded integer := 0;
  alerts integer := 0;
  grants_expired integer := 0;
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

  grants_expired := billing.expire_subscription_access_grants(_limit);

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

  RETURN jsonb_build_object(
    'cancelled', cancelled,
    'trialsExpired', expired,
    'grantsExpired', grants_expired,
    'downgradesApplied', downgraded,
    'pastDueAlerts', alerts
  );
END $$;

-- Per-company numeric limit override (extends entitlement_overrides.limit_value).
CREATE OR REPLACE FUNCTION public.platform_set_entitlement_limit(
  _feature text,
  _company_id uuid,
  _limit_value bigint,
  _expires timestamptz,
  _reason text,
  _notes text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF char_length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)';
  END IF;
  IF _limit_value IS NULL OR _limit_value < 0 THEN
    RAISE EXCEPTION 'Limit must be a non-negative integer';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.billing_features WHERE key = _feature) THEN
    RAISE EXCEPTION 'Unknown feature';
  END IF;
  INSERT INTO public.entitlement_overrides (
    feature_key, scope, scope_id, plan_code, source, effect, limit_value,
    starts_at, expires_at, reason, notes, approval_status, created_by
  ) VALUES (
    _feature, 'business', _company_id, NULL, 'grant', 'allow', _limit_value,
    now(), _expires, trim(_reason), coalesce(_notes, ''), 'approved', auth.uid()
  ) RETURNING id INTO _id;
  PERFORM private.platform_log(
    'entitlement.set_limit',
    'entitlement',
    _id::text,
    NULL,
    jsonb_build_object(
      'companyId', _company_id,
      'feature', _feature,
      'limitValue', _limit_value,
      'expiresAt', _expires
    ),
    trim(_reason)
  );
  RETURN jsonb_build_object('ok', true, 'id', _id);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_subscription_admin_detail(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_grant_subscription_access(uuid, text, timestamptz, boolean, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_revoke_subscription_access(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_extend_company_trial(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_end_company_trial(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_set_entitlement_limit(text, uuid, bigint, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_subscription_admin_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_grant_subscription_access(uuid, text, timestamptz, boolean, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_revoke_subscription_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_extend_company_trial(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_end_company_trial(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_entitlement_limit(text, uuid, bigint, timestamptz, text, text) TO authenticated;
