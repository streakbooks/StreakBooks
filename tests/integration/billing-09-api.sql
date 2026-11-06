-- Billing phase 9 assertions: scoped platform API keys, idempotency store and service-role read
-- models for REST v1. Runs after billing-08-partners.sql (invoices and payments exist).
-- Statements run as the database owner stand for the server's service-role calls.
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
SELECT pg_temp.act(NULL, NULL);

INSERT INTO public.platform_api_keys (id, label, key_hash, created_by) VALUES
  ('90000000-0000-0000-0000-000000000001', 'Spring Boot export', encode(extensions.digest('raw-test-key-1', 'sha256'), 'hex'),
   '00000000-0000-0000-0000-0000000000f2'),
  ('90000000-0000-0000-0000-000000000002', 'Retired key', encode(extensions.digest('raw-test-key-2', 'sha256'), 'hex'),
   '00000000-0000-0000-0000-0000000000f2');
UPDATE public.platform_api_keys SET retired_at = now() WHERE id = '90000000-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------- scopes
SELECT pg_temp.ok((SELECT scopes = '{}' FROM public.platform_api_keys WHERE id = '90000000-0000-0000-0000-000000000001'),
  'Existing keys start without scopes');
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000a1', 'aal2');
SELECT pg_temp.expect_error($$SELECT public.platform_set_api_key_scopes('90000000-0000-0000-0000-000000000001', ARRAY['billing:read'], 'customer')$$,
  '42501', 'Customers cannot grant API scopes');
SELECT pg_temp.expect_error($$SELECT public.platform_list_api_keys()$$, '42501', 'Customers cannot list API keys');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal1');
SELECT pg_temp.expect_error($$SELECT public.platform_set_api_key_scopes('90000000-0000-0000-0000-000000000001', ARRAY['billing:read'], 'no mfa')$$,
  '42501', 'Granting scopes needs an MFA platform session');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f1', 'aal2');
SELECT pg_temp.expect_error($$SELECT public.platform_set_api_key_scopes('90000000-0000-0000-0000-000000000001', ARRAY['billing:read'], 'finance')$$,
  '42501', 'Only platform owners grant API scopes');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT pg_temp.expect_error($$SELECT public.platform_set_api_key_scopes('90000000-0000-0000-0000-000000000001', ARRAY['ledger:write'], 'bad scope')$$,
  '22023', 'Unknown scopes are refused');
SELECT pg_temp.expect_error($$SELECT public.platform_set_api_key_scopes('90000000-0000-0000-0000-000000000002', ARRAY['billing:read'], 'retired')$$,
  '22023', 'Retired keys cannot be granted scopes');
SELECT public.platform_set_api_key_scopes('90000000-0000-0000-0000-000000000001', ARRAY['billing:read', 'billing:read'], 'Export to ERP');
SELECT pg_temp.ok((SELECT jsonb_array_length(public.platform_list_api_keys()) = 2
  AND NOT (public.platform_list_api_keys()::text LIKE '%key_hash%')), 'Platform staff list keys without hashes');
SELECT pg_temp.expect_error($$SELECT public.billing_api_key_authenticate('00')$$, '42501', 'Clients cannot authenticate keys');
SELECT pg_temp.expect_error($$SELECT public.billing_api_invoices(NULL, NULL, NULL, 10)$$, '42501', 'Clients cannot call the read models');
SELECT pg_temp.expect_error($$SELECT public.billing_api_idempotency_begin('user:x', 'key-00000001', 'route', repeat('a', 64))$$,
  '42501', 'Clients cannot touch the idempotency store');
SELECT pg_temp.ok(public.platform_billing_api_access(), 'Platform staff with MFA pass the API access check');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000a1', 'aal2');
SELECT pg_temp.expect_error($$SELECT public.platform_billing_api_access()$$, '42501', 'Customers fail the API access check');
RESET ROLE;
SELECT pg_temp.act(NULL, NULL);
SELECT pg_temp.ok((SELECT scopes = ARRAY['billing:read'] FROM public.platform_api_keys WHERE id = '90000000-0000-0000-0000-000000000001'),
  'Scopes are stored once');
SELECT pg_temp.ok((SELECT reason = 'Export to ERP' AND after_state -> 'scopes' = '["billing:read"]'::jsonb
  FROM public.platform_audit WHERE action = 'api_key.scopes'), 'Scope grants are written to the platform audit');

-- ---------------------------------------------------------------- key authentication
SELECT pg_temp.ok((public.billing_api_key_authenticate(encode(extensions.digest('raw-test-key-1', 'sha256'), 'hex'))
  ->> 'keyId') = '90000000-0000-0000-0000-000000000001', 'A valid key authenticates with its scopes');
SELECT pg_temp.ok((SELECT last_used_at IS NOT NULL FROM public.platform_api_keys WHERE id = '90000000-0000-0000-0000-000000000001'),
  'Use is recorded');
SELECT pg_temp.ok(public.billing_api_key_authenticate(encode(extensions.digest('raw-test-key-2', 'sha256'), 'hex')) IS NULL,
  'Retired keys do not authenticate');
SELECT pg_temp.ok(public.billing_api_key_authenticate('not-a-hash') IS NULL, 'Malformed hashes do not authenticate');
SELECT pg_temp.expect_error($$UPDATE public.platform_api_keys SET scopes = ARRAY['ledger:write']$$, '23514',
  'The table refuses unknown scopes');

-- ---------------------------------------------------------------- idempotency
SELECT pg_temp.ok((public.billing_api_idempotency_begin('user:a', 'key-00000001', 'billingTaxId', repeat('a', 64)) ->> 'state') = 'new',
  'A new key starts a request');
SELECT pg_temp.ok((public.billing_api_idempotency_begin('user:a', 'key-00000001', 'billingTaxId', repeat('a', 64)) ->> 'state') = 'in_progress',
  'A concurrent repeat waits');
SELECT public.billing_api_idempotency_finish('user:a', 'key-00000001', 200, '{"data":{"ok":true}}');
SELECT pg_temp.ok((SELECT r ->> 'state' = 'replay' AND (r ->> 'status')::int = 200 AND r -> 'response' -> 'data' ->> 'ok' = 'true'
  FROM (SELECT public.billing_api_idempotency_begin('user:a', 'key-00000001', 'billingTaxId', repeat('a', 64)) AS r) x),
  'A finished request replays its response');
SELECT pg_temp.ok((public.billing_api_idempotency_begin('user:a', 'key-00000001', 'billingTaxId', repeat('b', 64)) ->> 'state') = 'conflict',
  'A different body under the same key conflicts');
SELECT pg_temp.ok((public.billing_api_idempotency_begin('user:b', 'key-00000001', 'billingTaxId', repeat('b', 64)) ->> 'state') = 'new',
  'Keys are scoped to the caller');
SELECT public.billing_api_idempotency_finish('user:b', 'key-00000001', 503, '{}');
SELECT pg_temp.ok((public.billing_api_idempotency_begin('user:b', 'key-00000001', 'billingTaxId', repeat('b', 64)) ->> 'state') = 'new',
  'A server error releases the key for a retry');
UPDATE billing.api_idempotency SET created_at = now() - interval '25 hours' WHERE actor = 'user:a';
SELECT pg_temp.ok((public.billing_api_idempotency_begin('user:a', 'key-00000001', 'billingTaxId', repeat('b', 64)) ->> 'state') = 'new',
  'Keys expire after 24 hours');
SELECT pg_temp.expect_error($$SELECT public.billing_api_idempotency_begin('user:a', 'short', 'route', repeat('a', 64))$$,
  '23514', 'Keys must be 8 to 128 safe characters');

-- ---------------------------------------------------------------- read models
SELECT pg_temp.ok((SELECT jsonb_array_length(r -> 'items') = 2 AND r ->> 'nextCursor' IS NOT NULL
  FROM (SELECT public.billing_api_invoices(NULL, NULL, NULL, 2) AS r) x), 'Invoices are paged');
SELECT public.billing_api_invoices(NULL, NULL, NULL, 2) ->> 'nextCursor' AS cursor1 \gset
SELECT pg_temp.ok((SELECT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.billing_api_invoices(NULL, NULL, NULL, 2) -> 'items') a
    JOIN jsonb_array_elements(public.billing_api_invoices(NULL, NULL, :'cursor1', 2) -> 'items') b ON a ->> 'id' = b ->> 'id')),
  'The next page does not repeat invoices');
SELECT pg_temp.ok((SELECT sum(jsonb_array_length(public.billing_api_invoices(NULL, NULL, NULL, 200) -> 'items')))
  = (SELECT count(*) FROM billing.invoices), 'Every invoice is reachable');
SELECT pg_temp.ok(jsonb_array_length(public.billing_api_invoices(now() + interval '1 day', NULL, NULL, 50) -> 'items') = 0,
  'Date filters apply');
SELECT pg_temp.ok((SELECT (r -> 'items' -> 0 ->> 'amountMinor')::bigint > 0
  FROM (SELECT public.billing_api_payments(NULL, NULL, NULL, 5) AS r) x), 'Payments are listed with amounts');
SELECT pg_temp.ok(jsonb_array_length(public.billing_api_subscriptions(NULL, 1000) -> 'items') =
  LEAST((SELECT count(*) FROM public.company_subscriptions), 200), 'Subscriptions are listed with a capped page size');
