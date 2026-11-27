-- Plan-change v2: interval switching, clear scheduled downgrade, billing contact lookup.
-- Extends billing_prepare_plan_change; does not replace the payment pipeline.

DROP FUNCTION IF EXISTS public.billing_prepare_plan_change(uuid, text);

CREATE OR REPLACE FUNCTION public.billing_prepare_plan_change(
  _company_id uuid,
  _plan_code text,
  _interval text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  sub public.company_subscriptions%ROWTYPE;
  target jsonb;
  current_amount bigint;
  next_interval text;
  current_monthly bigint;
  target_monthly bigint;
  change_kind text;
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
  IF sub.status = 'past_due' THEN
    RAISE EXCEPTION 'Update the payment method and clear the failed payment before changing plan' USING ERRCODE = 'P0001';
  END IF;

  next_interval := coalesce(nullif(_interval, ''), sub.billing_interval);
  IF next_interval NOT IN ('month', 'year') THEN
    RAISE EXCEPTION 'Billing period must be month or year' USING ERRCODE = '22023';
  END IF;
  IF sub.plan_code = _plan_code AND sub.billing_interval = next_interval THEN
    RAISE EXCEPTION 'That is already the current plan and billing period' USING ERRCODE = 'P0001';
  END IF;

  target := public.billing_checkout_price(_company_id, _plan_code, next_interval);
  IF target ->> 'currency' <> sub.currency THEN
    RAISE EXCEPTION 'The new plan is priced in %, but this subscription is billed in %. Cancel and subscribe again to change currency.',
      target ->> 'currency', sub.currency USING ERRCODE = 'P0001';
  END IF;

  current_amount := coalesce(sub.unit_amount_minor, 0);
  current_monthly := CASE WHEN sub.billing_interval = 'year' THEN (current_amount / 12) ELSE current_amount END;
  target_monthly := CASE
    WHEN (target ->> 'interval') = 'year' THEN ((target ->> 'amountMinor')::bigint / 12)
    ELSE (target ->> 'amountMinor')::bigint
  END;
  change_kind := CASE
    WHEN target_monthly > current_monthly THEN 'upgrade'
    WHEN target_monthly < current_monthly THEN 'downgrade'
    WHEN next_interval IS DISTINCT FROM sub.billing_interval THEN
      CASE WHEN next_interval = 'year' THEN 'upgrade' ELSE 'downgrade' END
    ELSE 'same'
  END;

  RETURN target || jsonb_build_object(
    'kind', change_kind,
    'provider', sub.provider,
    'providerSubscriptionId', sub.provider_subscription_id,
    'currentPlanCode', sub.plan_code,
    'currentInterval', sub.billing_interval,
    'currentAmountMinor', current_amount,
    'periodEnd', coalesce(sub.current_period_end, sub.trial_ends_at));
END $$;

-- Customer may withdraw a scheduled downgrade / interval change before it applies.
CREATE OR REPLACE FUNCTION public.billing_clear_scheduled_plan_change(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  sub public.company_subscriptions%ROWTYPE;
BEGIN
  IF NOT public.has_company_permission(_company_id, 'billing.manage') THEN
    RAISE EXCEPTION 'You do not have permission to manage billing for this organisation' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO sub FROM public.company_subscriptions WHERE company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No subscription found' USING ERRCODE = 'P0001';
  END IF;
  IF sub.scheduled_plan_code IS NULL THEN
    RETURN jsonb_build_object('cleared', false, 'reason', 'nothing scheduled');
  END IF;
  UPDATE public.company_subscriptions
     SET scheduled_plan_code = NULL, scheduled_at = NULL, updated_at = now()
   WHERE company_id = _company_id;
  INSERT INTO billing.subscription_events (company_id, billing_account_id, event_type, from_plan, to_plan, source, actor_user_id, details)
  VALUES (
    _company_id,
    (SELECT l.billing_account_id FROM billing.billing_account_companies l WHERE l.company_id = _company_id),
    'plan_change_requested',
    sub.scheduled_plan_code,
    sub.plan_code,
    'customer',
    auth.uid(),
    jsonb_build_object('action', 'reverse_scheduled_change')
  );
  PERFORM billing.write_audit(
    'subscription.plan_change_reversed', 'subscription', _company_id::text,
    (SELECT l.billing_account_id FROM billing.billing_account_companies l WHERE l.company_id = _company_id),
    jsonb_build_object('scheduledPlanCode', sub.scheduled_plan_code, 'scheduledAt', sub.scheduled_at),
    jsonb_build_object('planCode', sub.plan_code),
    'Customer reversed scheduled plan change'
  );
  RETURN jsonb_build_object(
    'cleared', true,
    'planCode', sub.plan_code,
    'provider', sub.provider,
    'providerSubscriptionId', sub.provider_subscription_id,
    'planPriceId', sub.plan_price_id,
    'interval', sub.billing_interval,
    'currency', sub.currency,
    'amountMinor', sub.unit_amount_minor
  );
END $$;

-- Billing contact for dunning / payment-failed notices.
CREATE OR REPLACE FUNCTION public.billing_contact_email(_company_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(
    nullif(a.billing_email, ''),
    (SELECT u.email::text FROM auth.users u WHERE u.id = a.owner_user_id),
    (SELECT u.email::text
       FROM public.company_members m
       JOIN auth.users u ON u.id = m.user_id
      WHERE m.company_id = _company_id AND m.role IN ('owner', 'admin')
      ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, m.created_at
      LIMIT 1)
  )
  FROM billing.billing_account_companies l
  JOIN billing.billing_accounts a ON a.id = l.billing_account_id
  WHERE l.company_id = _company_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.billing_company_for_provider_subscription(
  _provider text, _subscription_id text
) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.company_id
    FROM public.company_subscriptions s
   WHERE s.provider = _provider AND s.provider_subscription_id = _subscription_id
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.billing_prepare_plan_change(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_clear_scheduled_plan_change(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_contact_email(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_company_for_provider_subscription(text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.billing_prepare_plan_change(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_clear_scheduled_plan_change(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_contact_email(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_company_for_provider_subscription(text, text) TO service_role;
