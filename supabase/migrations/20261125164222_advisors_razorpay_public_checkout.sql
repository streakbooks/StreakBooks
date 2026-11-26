-- Public Advisors purchases use Razorpay directly and remain separate from
-- company_subscriptions / the StreakBooks software subscription.
CREATE TABLE IF NOT EXISTS public.advisors_public_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_code text NOT NULL CHECK (service_code IN ('bookkeeping', 'coaching')),
  plan_code text NOT NULL,
  buyer_name text NOT NULL CHECK (length(trim(buyer_name)) BETWEEN 1 AND 120),
  buyer_email text NOT NULL CHECK (length(buyer_email) <= 254),
  buyer_phone text NOT NULL CHECK (length(buyer_phone) BETWEEN 7 AND 32),
  cadence text NOT NULL CHECK (cadence IN ('month', 'session')),
  amount_minor integer NOT NULL CHECK (amount_minor >= 100),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'pending_checkout'
    CHECK (status IN (
      'pending_checkout', 'checkout_open', 'authorized', 'active', 'paid',
      'payment_failed', 'halted', 'cancelled', 'completed'
    )),
  razorpay_plan_id text,
  razorpay_subscription_id text UNIQUE,
  razorpay_order_id text UNIQUE,
  razorpay_payment_id text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS advisors_public_purchases_created_idx
  ON public.advisors_public_purchases (created_at DESC);
CREATE INDEX IF NOT EXISTS advisors_public_purchases_status_idx
  ON public.advisors_public_purchases (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS advisors_public_purchases_plan_terms_idx
  ON public.advisors_public_purchases (plan_code, amount_minor, currency, cadence)
  WHERE razorpay_plan_id IS NOT NULL;

ALTER TABLE public.advisors_public_purchases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.advisors_public_purchases FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.advisors_public_purchases TO service_role;

CREATE OR REPLACE FUNCTION public.advisors_public_checkout_create(
  _service_code text,
  _plan_code text,
  _buyer_name text,
  _buyer_email text,
  _buyer_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  svc public.advisors_services;
  plan public.advisors_service_plans;
  purchase public.advisors_public_purchases;
  provider_plan_id text;
BEGIN
  IF _service_code NOT IN ('bookkeeping', 'coaching')
     OR length(trim(coalesce(_buyer_name, ''))) NOT BETWEEN 1 AND 120
     OR length(trim(coalesce(_buyer_email, ''))) NOT BETWEEN 3 AND 254
     OR length(trim(coalesce(_buyer_phone, ''))) NOT BETWEEN 7 AND 32 THEN
    RAISE EXCEPTION 'Enter valid contact details and an Advisors service.';
  END IF;

  SELECT * INTO svc
  FROM public.advisors_services
  WHERE code = _service_code AND is_published = true AND is_enabled = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'This Advisors service is not available for purchase.'; END IF;

  SELECT * INTO plan
  FROM public.advisors_service_plans
  WHERE code = _plan_code
    AND service_code = _service_code
    AND is_published = true
    AND is_enabled = true
    AND is_archived = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'This Advisors plan is not available for purchase.'; END IF;
  IF plan.amount_minor < 100 OR plan.currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'This Advisors plan is not configured for online payment.';
  END IF;

  SELECT razorpay_plan_id INTO provider_plan_id
  FROM public.advisors_public_purchases
  WHERE plan_code = plan.code
    AND amount_minor = plan.amount_minor
    AND currency = plan.currency
    AND cadence = 'month'
    AND razorpay_plan_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO public.advisors_public_purchases (
    service_code, plan_code, buyer_name, buyer_email, buyer_phone,
    cadence, amount_minor, currency
  ) VALUES (
    svc.code, plan.code, trim(_buyer_name), lower(trim(_buyer_email)), trim(_buyer_phone),
    plan.cadence, plan.amount_minor, plan.currency
  ) RETURNING * INTO purchase;

  RETURN jsonb_build_object(
    'purchaseId', purchase.id,
    'serviceCode', svc.code,
    'serviceName', svc.name,
    'planCode', plan.code,
    'planName', plan.name,
    'amountMinor', plan.amount_minor,
    'currency', plan.currency,
    'cadence', plan.cadence,
    'razorpayPlanId', provider_plan_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_public_checkout_attach(
  _purchase_id uuid,
  _razorpay_plan_id text DEFAULT NULL,
  _razorpay_subscription_id text DEFAULT NULL,
  _razorpay_order_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE purchase public.advisors_public_purchases;
BEGIN
  IF (_razorpay_subscription_id IS NULL) = (_razorpay_order_id IS NULL) THEN
    RAISE EXCEPTION 'Provide exactly one Razorpay subscription or order ID.';
  END IF;
  IF _razorpay_subscription_id IS NOT NULL AND _razorpay_subscription_id !~ '^sub_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'Razorpay subscription ID is invalid.';
  END IF;
  IF _razorpay_order_id IS NOT NULL AND _razorpay_order_id !~ '^order_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'Razorpay order ID is invalid.';
  END IF;
  UPDATE public.advisors_public_purchases
  SET razorpay_plan_id = coalesce(_razorpay_plan_id, razorpay_plan_id),
      razorpay_subscription_id = _razorpay_subscription_id,
      razorpay_order_id = _razorpay_order_id,
      status = 'checkout_open',
      updated_at = now()
  WHERE id = _purchase_id AND status = 'pending_checkout'
  RETURNING * INTO purchase;
  IF NOT FOUND THEN RAISE EXCEPTION 'The Advisors checkout is no longer available.'; END IF;
  RETURN jsonb_build_object('purchaseId', purchase.id, 'status', purchase.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_public_checkout_verify(
  _purchase_id uuid,
  _payment_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE purchase public.advisors_public_purchases;
BEGIN
  IF _payment_id !~ '^pay_[A-Za-z0-9]+$' THEN RAISE EXCEPTION 'Razorpay payment ID is invalid.'; END IF;
  UPDATE public.advisors_public_purchases
  SET razorpay_payment_id = _payment_id,
      status = CASE
        WHEN cadence = 'month' AND status = 'active' THEN 'active'
        WHEN cadence = 'month' THEN 'authorized'
        ELSE 'paid'
      END,
      verified_at = now(),
      updated_at = now()
  WHERE id = _purchase_id
    AND status IN ('checkout_open', 'authorized', 'active', 'paid')
    AND razorpay_payment_id IS NULL
  RETURNING * INTO purchase;
  IF NOT FOUND THEN
    SELECT * INTO purchase FROM public.advisors_public_purchases
    WHERE id = _purchase_id AND razorpay_payment_id = _payment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'The Advisors payment could not be verified.'; END IF;
  END IF;
  RETURN jsonb_build_object(
    'purchaseId', purchase.id,
    'status', purchase.status,
    'serviceCode', purchase.service_code,
    'planCode', purchase.plan_code,
    'amountMinor', purchase.amount_minor,
    'currency', purchase.currency
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_public_checkout_get(_purchase_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT to_jsonb(p)
  FROM public.advisors_public_purchases AS p
  WHERE p.id = _purchase_id
$$;

CREATE OR REPLACE FUNCTION public.advisors_public_checkout_webhook(
  _purchase_id uuid,
  _subscription_id text,
  _event_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE next_status text;
DECLARE changed integer;
BEGIN
  next_status := CASE _event_type
    WHEN 'subscription.activated' THEN 'active'
    WHEN 'subscription.charged' THEN 'active'
    WHEN 'subscription.authenticated' THEN 'authorized'
    WHEN 'subscription.halted' THEN 'halted'
    WHEN 'subscription.cancelled' THEN 'cancelled'
    WHEN 'subscription.completed' THEN 'completed'
    ELSE NULL
  END;
  IF next_status IS NULL THEN RETURN jsonb_build_object('applied', false); END IF;
  UPDATE public.advisors_public_purchases
  SET status = next_status, updated_at = now()
  WHERE id = _purchase_id
    AND cadence = 'month'
    AND razorpay_subscription_id = _subscription_id
    AND status <> 'paid';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN jsonb_build_object('applied', changed > 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_list_public_purchases()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE role_name text;
BEGIN
  SELECT public.platform_role() INTO role_name;
  IF role_name IS NULL OR role_name NOT IN ('platform_owner', 'platform_finance', 'platform_support') THEN
    RAISE EXCEPTION 'Platform access is required.' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(purchase) ORDER BY purchase.created_at DESC)
    FROM (
      SELECT id, service_code, plan_code, buyer_name, buyer_email, buyer_phone,
             cadence, amount_minor, currency, status, razorpay_subscription_id,
             razorpay_order_id, razorpay_payment_id, verified_at, created_at, updated_at
      FROM public.advisors_public_purchases
      ORDER BY created_at DESC
      LIMIT 100
    ) purchase
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.advisors_public_checkout_create(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advisors_public_checkout_attach(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advisors_public_checkout_verify(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advisors_public_checkout_get(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advisors_public_checkout_webhook(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_advisors_list_public_purchases() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advisors_public_checkout_create(text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.advisors_public_checkout_attach(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.advisors_public_checkout_verify(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.advisors_public_checkout_get(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.advisors_public_checkout_webhook(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_list_public_purchases() TO authenticated, service_role;
