-- Phase 9: REST /api/v1 support. Scoped platform API keys (extending public.platform_api_keys),
-- an idempotency store for mutations, and service-role read models for external systems.
-- Users call the same RPCs as the app with their own JWT; nothing here widens their access.
-- Re-runnable.

-- ---------------------------------------------------------------- scoped API keys
ALTER TABLE public.platform_api_keys
  ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT '{}'
    CHECK (scopes <@ ARRAY['billing:read', 'billing:analytics']::text[]),
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS platform_api_keys_hash_key ON public.platform_api_keys (key_hash);

CREATE OR REPLACE FUNCTION public.platform_list_api_keys() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_platform('api.manage');
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', k.id, 'label', k.label, 'scopes', to_jsonb(k.scopes),
      'createdAt', k.created_at, 'retiredAt', k.retired_at, 'lastUsedAt', k.last_used_at) ORDER BY k.created_at DESC)
    FROM public.platform_api_keys k), '[]'::jsonb);
END $$;

-- Granting machine access to billing data is limited to platform owners and audited.
CREATE OR REPLACE FUNCTION public.platform_set_api_key_scopes(_key_id uuid, _scopes text[], _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  k public.platform_api_keys%ROWTYPE;
  wanted text[] := ARRAY(SELECT DISTINCT s FROM unnest(coalesce(_scopes, '{}'::text[])) s ORDER BY s);
BEGIN
  PERFORM private.require_platform('api.manage');
  IF public.platform_role() IS DISTINCT FROM 'platform_owner' THEN
    RAISE EXCEPTION 'Only a platform owner can grant API scopes' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason' USING ERRCODE = '22023';
  END IF;
  IF NOT (wanted <@ ARRAY['billing:read', 'billing:analytics']::text[]) THEN
    RAISE EXCEPTION 'Unknown API scope' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO k FROM public.platform_api_keys WHERE id = _key_id AND retired_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That platform API key is not active' USING ERRCODE = '22023';
  END IF;
  UPDATE public.platform_api_keys SET scopes = wanted WHERE id = _key_id;
  PERFORM private.platform_log('api_key.scopes', 'platform_api_key', _key_id::text,
    jsonb_build_object('scopes', to_jsonb(k.scopes)), jsonb_build_object('scopes', to_jsonb(wanted)), btrim(_reason));
  RETURN jsonb_build_object('id', _key_id, 'scopes', to_jsonb(wanted));
END $$;

-- Service role only: the server hashes the presented key and asks which scopes it carries.
CREATE OR REPLACE FUNCTION public.billing_api_key_authenticate(_key_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  k public.platform_api_keys%ROWTYPE;
BEGIN
  IF _key_hash IS NULL OR _key_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;
  SELECT * INTO k FROM public.platform_api_keys WHERE key_hash = _key_hash AND retired_at IS NULL;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF k.last_used_at IS NULL OR k.last_used_at < now() - interval '1 minute' THEN
    UPDATE public.platform_api_keys SET last_used_at = now() WHERE id = k.id;
  END IF;
  RETURN jsonb_build_object('keyId', k.id, 'label', k.label, 'scopes', to_jsonb(k.scopes));
END $$;

-- Platform staff using their own JWT pass the same platform check as the Superadmin screens.
CREATE OR REPLACE FUNCTION public.platform_billing_api_access() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_platform('billing.view');
  RETURN true;
END $$;

-- ---------------------------------------------------------------- idempotency
CREATE TABLE IF NOT EXISTS billing.api_idempotency (
  actor text NOT NULL CHECK (length(actor) BETWEEN 3 AND 80),
  idem_key text NOT NULL CHECK (idem_key ~ '^[A-Za-z0-9_.:-]{8,128}$'),
  route text NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'in_progress' CHECK (state IN ('in_progress', 'done')),
  status_code integer,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor, idem_key)
);
CREATE INDEX IF NOT EXISTS api_idempotency_created_idx ON billing.api_idempotency (created_at);
ALTER TABLE billing.api_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing.api_idempotency FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON billing.api_idempotency FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Keys live for 24 hours. A different body or route under the same key is a conflict.
CREATE OR REPLACE FUNCTION public.billing_api_idempotency_begin(_actor text, _key text, _route text, _hash text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  row_ billing.api_idempotency%ROWTYPE;
BEGIN
  DELETE FROM billing.api_idempotency WHERE created_at < now() - interval '24 hours';
  INSERT INTO billing.api_idempotency (actor, idem_key, route, request_hash)
  VALUES (_actor, _key, _route, _hash)
  ON CONFLICT (actor, idem_key) DO NOTHING
  RETURNING * INTO row_;
  IF FOUND THEN
    RETURN jsonb_build_object('state', 'new');
  END IF;
  SELECT * INTO row_ FROM billing.api_idempotency WHERE actor = _actor AND idem_key = _key;
  IF row_.route <> _route OR row_.request_hash <> _hash THEN
    RETURN jsonb_build_object('state', 'conflict');
  END IF;
  IF row_.state = 'in_progress' THEN
    RETURN jsonb_build_object('state', 'in_progress');
  END IF;
  RETURN jsonb_build_object('state', 'replay', 'status', row_.status_code, 'response', row_.response);
END $$;

-- Server errors release the key so the caller can retry; final answers are kept for replay.
CREATE OR REPLACE FUNCTION public.billing_api_idempotency_finish(_actor text, _key text, _status integer, _response jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF _status >= 500 THEN
    DELETE FROM billing.api_idempotency WHERE actor = _actor AND idem_key = _key AND state = 'in_progress';
  ELSE
    UPDATE billing.api_idempotency SET state = 'done', status_code = _status, response = _response
     WHERE actor = _actor AND idem_key = _key AND state = 'in_progress';
  END IF;
END $$;

-- ---------------------------------------------------------------- read models (service role)
CREATE OR REPLACE FUNCTION billing.api_page_limit(_limit integer) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT least(greatest(coalesce(_limit, 50), 1), 200);
$$;

CREATE OR REPLACE FUNCTION public.billing_api_invoices(_from timestamptz, _to timestamptz, _after text, _limit integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  after_at timestamptz := nullif(split_part(coalesce(_after, ''), '|', 1), '')::timestamptz;
  after_id uuid := nullif(split_part(coalesce(_after, ''), '|', 2), '')::uuid;
  page jsonb;
  n integer := billing.api_page_limit(_limit);
BEGIN
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.issued_at, x.id), '[]'::jsonb) INTO page FROM (
    SELECT i.issued_at, i.id, jsonb_build_object('id', i.id, 'number', i.invoice_number, 'companyId', i.company_id,
      'billingAccountId', i.billing_account_id, 'currency', i.currency, 'subtotalMinor', i.subtotal_minor,
      'discountMinor', i.discount_minor, 'taxMinor', i.tax_minor, 'totalMinor', i.total_minor,
      'creditedMinor', i.credited_minor, 'status', i.status, 'planCode', i.plan_code, 'offerCode', i.offer_code,
      'customer', i.customer, 'seller', i.seller, 'tax', i.tax, 'periodStart', i.period_start,
      'periodEnd', i.period_end, 'issuedAt', i.issued_at) AS item
    FROM billing.invoices i
    WHERE (_from IS NULL OR i.issued_at >= _from) AND (_to IS NULL OR i.issued_at < _to)
      AND (after_at IS NULL OR (i.issued_at, i.id) > (after_at, after_id))
    ORDER BY i.issued_at, i.id
    LIMIT n) x;
  RETURN jsonb_build_object('items', page, 'nextCursor', CASE WHEN jsonb_array_length(page) = n
    THEN (page -> -1 ->> 'issuedAt') || '|' || (page -> -1 ->> 'id') END);
END $$;

CREATE OR REPLACE FUNCTION public.billing_api_payments(_from timestamptz, _to timestamptz, _after text, _limit integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  after_at timestamptz := nullif(split_part(coalesce(_after, ''), '|', 1), '')::timestamptz;
  after_id uuid := nullif(split_part(coalesce(_after, ''), '|', 2), '')::uuid;
  page jsonb;
  n integer := billing.api_page_limit(_limit);
BEGIN
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.paid_at, x.id), '[]'::jsonb) INTO page FROM (
    SELECT p.paid_at, p.id, jsonb_build_object('id', p.id, 'companyId', p.company_id, 'provider', p.provider,
      'mode', p.mode, 'providerPaymentId', p.provider_payment_id, 'currency', p.currency,
      'amountMinor', p.amount_minor, 'discountMinor', p.discount_minor, 'refundedMinor', p.refunded_minor,
      'status', p.status, 'method', p.method, 'planCode', p.plan_code, 'paidAt', p.paid_at) AS item
    FROM billing.payments p
    WHERE (_from IS NULL OR p.paid_at >= _from) AND (_to IS NULL OR p.paid_at < _to)
      AND (after_at IS NULL OR (p.paid_at, p.id) > (after_at, after_id))
    ORDER BY p.paid_at, p.id
    LIMIT n) x;
  RETURN jsonb_build_object('items', page, 'nextCursor', CASE WHEN jsonb_array_length(page) = n
    THEN (page -> -1 ->> 'paidAt') || '|' || (page -> -1 ->> 'id') END);
END $$;

CREATE OR REPLACE FUNCTION public.billing_api_subscriptions(_after uuid, _limit integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  page jsonb;
  n integer := billing.api_page_limit(_limit);
BEGIN
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.company_id), '[]'::jsonb) INTO page FROM (
    SELECT s.company_id, jsonb_build_object('companyId', s.company_id, 'planCode', s.plan_code, 'status', s.status,
      'interval', s.billing_interval, 'provider', s.provider, 'currency', s.currency,
      'unitAmountMinor', s.unit_amount_minor, 'countryCode', s.country_code, 'trialEndsAt', s.trial_ends_at,
      'currentPeriodEnd', s.current_period_end, 'cancelAtPeriodEnd', s.cancel_at_period_end,
      'startedAt', s.started_at, 'updatedAt', s.updated_at) AS item
    FROM public.company_subscriptions s
    WHERE _after IS NULL OR s.company_id > _after
    ORDER BY s.company_id
    LIMIT n) x;
  RETURN jsonb_build_object('items', page, 'nextCursor', CASE WHEN jsonb_array_length(page) = n
    THEN page -> -1 ->> 'companyId' END);
END $$;

-- ---------------------------------------------------------------- grants
REVOKE ALL ON FUNCTION billing.api_page_limit(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_list_api_keys() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_set_api_key_scopes(uuid, text[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_billing_api_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_list_api_keys() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_set_api_key_scopes(uuid, text[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_billing_api_access() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.billing_api_key_authenticate(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_api_idempotency_begin(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_api_idempotency_finish(text, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_api_invoices(timestamptz, timestamptz, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_api_payments(timestamptz, timestamptz, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_api_subscriptions(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_api_key_authenticate(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_api_idempotency_begin(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_api_idempotency_finish(text, text, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_api_invoices(timestamptz, timestamptz, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_api_payments(timestamptz, timestamptz, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_api_subscriptions(uuid, integer) TO service_role;
