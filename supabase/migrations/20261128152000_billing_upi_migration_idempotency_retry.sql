-- Allow retries after a failed/abandoned UPI migration within the same idempotency window.
-- 1) Transition may release the UNIQUE idempotency_key when abandoning.
-- 2) Insert ignores terminal rows and frees their key before inserting a new attempt.

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
      ELSE completed_at END,
    idempotency_key = CASE
      WHEN (_patch ->> 'releaseIdempotencyKey') = 'true'
        THEN row.idempotency_key || ':released:' || row.id::text
      ELSE idempotency_key END
  WHERE id = _id;
  RETURN public.billing_migration_get(_id);
END $$;

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
  existing_status text;
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

  SELECT id, status INTO existing, existing_status
    FROM billing.subscription_migrations
   WHERE idempotency_key = _idempotency_key
   FOR UPDATE;

  IF existing IS NOT NULL AND existing_status NOT IN ('completed', 'failed') THEN
    RETURN public.billing_migration_get(existing);
  END IF;

  IF existing IS NOT NULL AND existing_status IN ('completed', 'failed') THEN
    UPDATE billing.subscription_migrations
       SET idempotency_key = idempotency_key || ':done:' || id::text
     WHERE id = existing
       AND idempotency_key = _idempotency_key;
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

REVOKE ALL ON FUNCTION public.billing_migration_transition(uuid, text[], text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_migration_insert(
  uuid, uuid, text, text, text, text, text, text, text, integer, integer, integer, integer, boolean, uuid, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_migration_transition(uuid, text[], text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_migration_insert(
  uuid, uuid, text, text, text, text, text, text, text, integer, integer, integer, integer, boolean, uuid, text
) TO service_role;
