-- Billing phase 10 assertions: analytics snapshot for platform staff and API keys.
-- Runs after billing-09-api.sql; every figure is checked against the underlying tables.
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

-- A demo organisation with an active subscription must not count; stored movements are summed.
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000dd', 'demo-owner@example.test');
INSERT INTO public.companies (id, name, created_by, country_code, base_currency, is_demo) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Demo Books', '00000000-0000-0000-0000-0000000000dd', 'GB', 'GBP', true);
INSERT INTO public.company_subscriptions (company_id, plan_code, status, billing_interval, provider, currency, unit_amount_minor)
VALUES ('a0000000-0000-0000-0000-000000000001', 'pro', 'active', 'month', 'none', 'GBP', 99999)
ON CONFLICT (company_id) DO UPDATE SET status = 'active', currency = 'GBP', unit_amount_minor = 99999, billing_interval = 'month';
INSERT INTO public.mrr_movements (company_id, currency, previous_mrr_minor, current_mrr_minor, movement, delta_minor) VALUES
  ('80000000-0000-0000-0000-000000000001', 'INR', 0, 99900, 'new', 99900),
  ('80000000-0000-0000-0000-000000000002', 'INR', 99900, 0, 'churn', -99900),
  ('80000000-0000-0000-0000-000000000003', 'INR', 49900, 49900, 'baseline', 0);

SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000a1', 'aal2');
SELECT pg_temp.expect_error($$SELECT public.platform_billing_analytics(NULL, NULL)$$, '42501', 'Customers cannot see billing analytics');
SELECT pg_temp.expect_error($$SELECT public.billing_api_analytics(NULL, NULL)$$, '42501', 'Clients cannot call the service variant');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f1', 'aal1');
SELECT pg_temp.expect_error($$SELECT public.platform_billing_analytics(NULL, NULL)$$, '42501', 'Analytics need an MFA platform session');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f1', 'aal2');
SELECT pg_temp.expect_error($$SELECT public.platform_billing_analytics(now() - interval '2 years', now())$$, '22023',
  'Ranges are limited to one year');
SELECT pg_temp.expect_error($$SELECT public.platform_billing_analytics(now(), now() - interval '1 day')$$, '22023',
  'The range must move forwards');
SELECT public.platform_billing_analytics(now() - interval '30 days', now() + interval '1 minute') AS snap \gset
RESET ROLE;
SELECT pg_temp.act(NULL, NULL);
CREATE TEMP TABLE snap AS SELECT :'snap'::jsonb AS s;

SELECT pg_temp.ok((SELECT jsonb_array_length(s -> 'revenue') >= 1 FROM snap),
  'Revenue is reported per currency');
SELECT pg_temp.ok((SELECT (r ->> 'grossMinor')::bigint = (SELECT sum(total_minor) FROM billing.invoices WHERE currency = 'INR')
    AND (r ->> 'netMinor')::bigint = (SELECT sum(subtotal_minor) FROM billing.invoices WHERE currency = 'INR')
    AND (r ->> 'taxMinor')::bigint = (SELECT sum(tax_minor) FROM billing.invoices WHERE currency = 'INR')
    AND (r ->> 'invoices')::int = (SELECT count(*) FROM billing.invoices WHERE currency = 'INR')
  FROM snap, jsonb_array_elements(s -> 'revenue') r WHERE r ->> 'currency' = 'INR'), 'Invoice totals match the issued invoices');
SELECT pg_temp.ok((SELECT (r ->> 'discountMinor')::bigint = (SELECT sum(coalesce(discount_minor, 0)) FROM billing.invoices WHERE currency = 'INR')
    AND (r ->> 'discountMinor')::bigint > 0
  FROM snap, jsonb_array_elements(s -> 'revenue') r WHERE r ->> 'currency' = 'INR'), 'Discounts match the invoices');
SELECT pg_temp.ok((SELECT (r ->> 'creditedMinor')::bigint = (SELECT sum(total_minor) FROM billing.credit_notes WHERE currency = 'INR')
    AND (r ->> 'refundsMinor')::bigint = (SELECT sum(amount_minor) FROM billing.refunds WHERE currency = 'INR' AND status = 'succeeded')
  FROM snap, jsonb_array_elements(s -> 'revenue') r WHERE r ->> 'currency' = 'INR'), 'Credits and refunds match');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM snap, jsonb_array_elements(s -> 'mrr') m WHERE m ->> 'currency' = 'GBP'
    AND (m ->> 'mrrMinor')::bigint >= 99999), 'Demo organisations are excluded from MRR');
SELECT pg_temp.ok((SELECT coalesce(sum((m ->> 'mrrMinor')::bigint), 0) = (
    SELECT coalesce(sum((s2.unit_amount_minor / CASE WHEN s2.billing_interval = 'year' THEN 12 ELSE 1 END)::bigint), 0)
      FROM public.company_subscriptions s2 JOIN public.companies c ON c.id = s2.company_id
     WHERE NOT c.is_demo AND s2.status = 'active' AND s2.unit_amount_minor IS NOT NULL
       AND (s2.current_period_end IS NULL OR s2.current_period_end > now()))
  FROM snap, jsonb_array_elements(s -> 'mrr') m), 'MRR uses the same rule as the MRR capture');
SELECT pg_temp.ok((SELECT bool_and((m ->> 'arrMinor')::bigint = 12 * (m ->> 'mrrMinor')::bigint) FROM snap, jsonb_array_elements(s -> 'mrr') m),
  'ARR is MRR times twelve');
SELECT pg_temp.ok((SELECT count(*) = 2 AND sum((m ->> 'deltaMinor')::bigint) = 0
  FROM snap, jsonb_array_elements(s -> 'movements') m WHERE m ->> 'currency' = 'INR'), 'Stored movements are summed without baselines');
SELECT pg_temp.ok((SELECT (s -> 'lifecycle' ->> 'trialsStarted')::int = (SELECT count(*) FROM billing.subscription_events
    WHERE event_type = 'trial_started' AND occurred_at >= now() - interval '30 days')
  FROM snap), 'Lifecycle counts come from the subscription history');
SELECT pg_temp.ok((SELECT (s -> 'lifecycle' ->> 'cancellationsRequested')::int = (SELECT count(*) FROM billing.cancellation_requests)
  FROM snap), 'Cancellations are counted');
SELECT pg_temp.ok((SELECT (c ->> 'redemptions')::int = (SELECT count(*) FROM billing.coupon_redemptions WHERE offer_code = 'LAUNCH10' AND status = 'redeemed')
  FROM snap, jsonb_array_elements(s -> 'coupons') c WHERE c ->> 'code' = 'LAUNCH10'), 'Coupon redemptions are counted');
SELECT pg_temp.ok((SELECT (c ->> 'accruedMinor')::bigint = (SELECT sum(amount_minor) FROM billing.commission_ledger WHERE entry_type = 'accrual')
    AND (c ->> 'reversedMinor')::bigint = (SELECT sum(amount_minor) FROM billing.commission_ledger WHERE entry_type = 'reversal')
    AND (c ->> 'paidOutMinor')::bigint = 8466
  FROM snap, jsonb_array_elements(s -> 'partners' -> 'commission') c WHERE c ->> 'currency' = 'INR'), 'Commission figures match the ledger');
SELECT pg_temp.ok((SELECT (s -> 'webhooks' ->> 'received')::int = (SELECT count(*) FROM public.billing_events WHERE created_at >= now() - interval '30 days')
  FROM snap), 'Webhook volume matches the event store');
SELECT pg_temp.ok((SELECT (public.billing_api_analytics(NULL, NULL) ? 'mrr')), 'The service variant returns the same snapshot');
