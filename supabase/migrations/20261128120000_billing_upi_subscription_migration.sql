-- Razorpay UPI / e-mandate plan migration workflow.
-- In-place PATCH is rejected by Razorpay for UPI/e-mandate; we create a new subscription,
-- switch company_subscriptions on webhook confirmation, then cancel the old mandate.
-- Additive and idempotent. No entitlement changes outside existing billing_apply_provider_event.

CREATE TABLE IF NOT EXISTS billing.subscription_migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  actor_user_id uuid,
  provider text NOT NULL CHECK (provider = 'razorpay'),
  mandate_kind text NOT NULL CHECK (mandate_kind IN ('upi', 'emandate')),
  status text NOT NULL CHECK (status IN (
    'initiated',
    'new_subscription_created',
    'awaiting_customer_authorization',
    'awaiting_payment',
    'new_subscription_confirmed',
    'old_subscription_cancellation_pending',
    'old_subscription_cancellation_failed',
    'entitlement_update_pending',
    'completed',
    'failed',
    'requires_manual_review'
  )),
  old_provider_subscription_id text NOT NULL,
  new_provider_subscription_id text,
  checkout_id uuid REFERENCES public.billing_checkouts(id),
  from_plan_code text NOT NULL,
  to_plan_code text NOT NULL,
  from_interval text NOT NULL CHECK (from_interval IN ('month', 'year')),
  to_interval text NOT NULL CHECK (to_interval IN ('month', 'year')),
  currency text NOT NULL,
  from_amount_minor integer NOT NULL CHECK (from_amount_minor >= 0),
  to_amount_minor integer NOT NULL CHECK (to_amount_minor >= 0),
  prorated_estimate_minor integer NOT NULL DEFAULT 0 CHECK (prorated_estimate_minor >= 0),
  upfront_addon_minor integer NOT NULL DEFAULT 0 CHECK (upfront_addon_minor >= 0),
  upfront_enabled boolean NOT NULL DEFAULT true,
  plan_price_id uuid,
  idempotency_key text NOT NULL UNIQUE,
  failure_reason text,
  cancel_attempts integer NOT NULL DEFAULT 0 CHECK (cancel_attempts >= 0),
  next_retry_at timestamptz,
  old_cancelled_at timestamptz,
  confirmed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_migrations_one_open_per_company
  ON billing.subscription_migrations (company_id)
  WHERE status NOT IN ('completed', 'failed');

CREATE INDEX IF NOT EXISTS subscription_migrations_new_sub_idx
  ON billing.subscription_migrations (new_provider_subscription_id)
  WHERE new_provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscription_migrations_retry_idx
  ON billing.subscription_migrations (next_retry_at)
  WHERE status IN (
    'old_subscription_cancellation_pending',
    'old_subscription_cancellation_failed',
    'awaiting_customer_authorization',
    'awaiting_payment',
    'new_subscription_confirmed'
  );

ALTER TABLE billing.subscription_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing.subscription_migrations FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON billing.subscription_migrations FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION billing.subscription_migration_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS subscription_migrations_touch ON billing.subscription_migrations;
CREATE TRIGGER subscription_migrations_touch
  BEFORE UPDATE ON billing.subscription_migrations
  FOR EACH ROW EXECUTE FUNCTION billing.subscription_migration_touch();

-- ---------------------------------------------------------------------------
-- RPCs (service role / permission-checked callers)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.billing_migration_get(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  row billing.subscription_migrations%ROWTYPE;
BEGIN
  SELECT * INTO row FROM billing.subscription_migrations WHERE id = _id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'id', row.id,
    'companyId', row.company_id,
    'status', row.status,
    'provider', row.provider,
    'mandateKind', row.mandate_kind,
    'oldProviderSubscriptionId', row.old_provider_subscription_id,
    'newProviderSubscriptionId', row.new_provider_subscription_id,
    'checkoutId', row.checkout_id,
    'fromPlanCode', row.from_plan_code,
    'toPlanCode', row.to_plan_code,
    'fromInterval', row.from_interval,
    'toInterval', row.to_interval,
    'currency', row.currency,
    'fromAmountMinor', row.from_amount_minor,
    'toAmountMinor', row.to_amount_minor,
    'proratedEstimateMinor', row.prorated_estimate_minor,
    'upfrontAddonMinor', row.upfront_addon_minor,
    'upfrontEnabled', row.upfront_enabled,
    'failureReason', row.failure_reason,
    'cancelAttempts', row.cancel_attempts,
    'nextRetryAt', row.next_retry_at,
    'confirmedAt', row.confirmed_at,
    'completedAt', row.completed_at,
    'createdAt', row.created_at,
    'updatedAt', row.updated_at
  );
END $$;

CREATE OR REPLACE FUNCTION public.billing_migration_open_for_company(_company_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.billing_migration_get(m.id)
    FROM billing.subscription_migrations m
   WHERE m.company_id = _company_id
     AND m.status NOT IN ('completed', 'failed')
   ORDER BY m.created_at DESC
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.billing_migration_insert(
  _company_id uuid,
  _actor uuid,
  _mandate_kind text,
  _old_sub_id text,
  _from_plan text,
  _to_plan text,
  _from_interval text,
  _to_interval text,
  _currency text,
  _from_amount integer,
  _to_amount integer,
  _prorated integer,
  _upfront integer,
  _upfront_enabled boolean,
  _plan_price_id uuid,
  _idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  existing uuid;
  new_id uuid;
BEGIN
  IF _mandate_kind NOT IN ('upi', 'emandate') THEN
    RAISE EXCEPTION 'Migration is only for UPI or e-mandate' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM billing.subscription_migrations
     WHERE company_id = _company_id AND status NOT IN ('completed', 'failed')
  ) THEN
    RAISE EXCEPTION 'A plan migration is already in progress for this organisation' USING ERRCODE = '23505';
  END IF;
  SELECT id INTO existing FROM billing.subscription_migrations WHERE idempotency_key = _idempotency_key;
  IF existing IS NOT NULL THEN
    RETURN public.billing_migration_get(existing);
  END IF;
  INSERT INTO billing.subscription_migrations (
    company_id, actor_user_id, provider, mandate_kind, status,
    old_provider_subscription_id, from_plan_code, to_plan_code, from_interval, to_interval,
    currency, from_amount_minor, to_amount_minor, prorated_estimate_minor, upfront_addon_minor,
    upfront_enabled, plan_price_id, idempotency_key
  ) VALUES (
    _company_id, _actor, 'razorpay', _mandate_kind, 'initiated',
    _old_sub_id, _from_plan, _to_plan, _from_interval, _to_interval,
    _currency, _from_amount, _to_amount, coalesce(_prorated, 0), coalesce(_upfront, 0),
    coalesce(_upfront_enabled, true), _plan_price_id, _idempotency_key
  ) RETURNING id INTO new_id;
  RETURN public.billing_migration_get(new_id);
END $$;

CREATE OR REPLACE FUNCTION public.billing_migration_transition(
  _id uuid,
  _from_statuses text[],
  _to_status text,
  _patch jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  row billing.subscription_migrations%ROWTYPE;
BEGIN
  SELECT * INTO row FROM billing.subscription_migrations WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown migration' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (row.status = ANY (_from_statuses)) THEN
    RAISE EXCEPTION 'Illegal migration transition from % to %', row.status, _to_status
      USING ERRCODE = '22023';
  END IF;
  UPDATE billing.subscription_migrations SET
    status = _to_status,
    new_provider_subscription_id = coalesce(
      nullif(_patch ->> 'newProviderSubscriptionId', ''), new_provider_subscription_id),
    checkout_id = coalesce(nullif(_patch ->> 'checkoutId', '')::uuid, checkout_id),
    failure_reason = CASE
      WHEN _patch ? 'failureReason' THEN left(nullif(_patch ->> 'failureReason', ''), 500)
      ELSE failure_reason END,
    cancel_attempts = CASE
      WHEN (_patch ->> 'bumpCancelAttempts') = 'true' THEN cancel_attempts + 1
      ELSE cancel_attempts END,
    next_retry_at = CASE
      WHEN _patch ? 'nextRetryAt' THEN nullif(_patch ->> 'nextRetryAt', '')::timestamptz
      ELSE next_retry_at END,
    old_cancelled_at = CASE
      WHEN (_patch ->> 'markOldCancelled') = 'true' THEN coalesce(old_cancelled_at, now())
      ELSE old_cancelled_at END,
    confirmed_at = CASE
      WHEN (_patch ->> 'markConfirmed') = 'true' THEN coalesce(confirmed_at, now())
      ELSE confirmed_at END,
    completed_at = CASE
      WHEN _to_status = 'completed' THEN coalesce(completed_at, now())
      ELSE completed_at END
  WHERE id = _id;
  RETURN public.billing_migration_get(_id);
END $$;

CREATE OR REPLACE FUNCTION public.billing_migration_by_checkout(_checkout_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.billing_migration_get(m.id)
    FROM billing.subscription_migrations m
   WHERE m.checkout_id = _checkout_id
   ORDER BY m.created_at DESC
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.billing_migration_by_new_subscription(_subscription_id text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.billing_migration_get(m.id)
    FROM billing.subscription_migrations m
   WHERE m.new_provider_subscription_id = _subscription_id
   ORDER BY m.created_at DESC
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.billing_migration_due(_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(m.id ORDER BY coalesce(m.next_retry_at, m.updated_at)), '[]'::jsonb)
  FROM (
    SELECT id, next_retry_at, updated_at
      FROM billing.subscription_migrations
     WHERE status IN (
             'old_subscription_cancellation_pending',
             'old_subscription_cancellation_failed',
             'new_subscription_confirmed',
             'awaiting_customer_authorization',
             'awaiting_payment'
           )
       AND coalesce(next_retry_at, updated_at) <= now()
     ORDER BY coalesce(next_retry_at, updated_at)
     LIMIT greatest(1, least(coalesce(_limit, 20), 100))
  ) m;
$$;

REVOKE ALL ON FUNCTION public.billing_migration_get(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_migration_open_for_company(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_migration_insert(
  uuid, uuid, text, text, text, text, text, text, text, integer, integer, integer, integer, boolean, uuid, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_migration_transition(uuid, text[], text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_migration_by_checkout(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_migration_by_new_subscription(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_migration_due(integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.billing_migration_get(uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_migration_open_for_company(uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_migration_insert(
  uuid, uuid, text, text, text, text, text, text, text, integer, integer, integer, integer, boolean, uuid, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_migration_transition(uuid, text[], text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_migration_by_checkout(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_migration_by_new_subscription(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_migration_due(integer) TO service_role;
