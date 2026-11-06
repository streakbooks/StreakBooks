-- Billing phase 5 assertions: provider routing, checkout snapshots, provider price mappings,
-- the provider event applier, provider-confirmed cancellation and plan changes, and the durable
-- webhook store. Runs after billing-03-pricing.sql (published launch prices) on the same database.
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
CREATE FUNCTION pg_temp.sub(_company uuid) RETURNS public.company_subscriptions LANGUAGE sql SECURITY DEFINER AS $$
  SELECT * FROM public.company_subscriptions WHERE company_id = _company;
$$;
CREATE FUNCTION pg_temp.price(_plan text, _country text) RETURNS uuid LANGUAGE sql AS $$
  SELECT p.id FROM public.plan_prices p JOIN public.plan_versions v ON v.id = p.version_id
   WHERE v.plan_code = _plan AND v.status = 'published' AND v.price_book AND p.billing_interval = 'month'
     AND p.country_code IS NOT DISTINCT FROM _country;
$$;
CREATE FUNCTION pg_temp.apply(_provider text, _event text, _kind text, _data jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.billing_apply_provider_event(_provider, _event, _kind, _data);
$$;
SELECT pg_temp.act(NULL, NULL);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000c4', 'pay-owner@example.test'),
  ('00000000-0000-0000-0000-0000000000c5', 'pay-staff@example.test'),
  ('00000000-0000-0000-0000-0000000000c6', 'pay-uk@example.test');
INSERT INTO public.companies (id, name, created_by, country_code, base_currency) VALUES
  ('40000000-0000-0000-0000-000000000001', 'Payments India', '00000000-0000-0000-0000-0000000000c4', 'IN', 'INR'),
  ('40000000-0000-0000-0000-000000000002', 'Payments UK', '00000000-0000-0000-0000-0000000000c6', 'GB', 'GBP');
INSERT INTO public.company_members (company_id, user_id, role, status) VALUES
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c4', 'owner', 'active'),
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c5', 'staff', 'active'),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c6', 'owner', 'active');

-- ---------------------------------------------------------------- routing
SELECT pg_temp.ok(billing.country_providers('IN') = ARRAY['razorpay'] AND billing.country_providers('GB') = ARRAY['stripe'],
  'India routes to Razorpay, other countries to Stripe');
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT public.platform_set_provider_route('AU', 'razorpay', true, 5, 'Trial route');
RESET ROLE;
SELECT pg_temp.ok(billing.country_providers('AU') = ARRAY['razorpay'], 'A country route overrides the default');
SET ROLE authenticated;
SELECT public.platform_set_provider_route('AU', 'razorpay', false, 5, 'Remove trial route');
RESET ROLE;
SELECT pg_temp.ok(billing.country_providers('AU') = ARRAY['stripe'], 'A disabled country route falls back to the default');

-- ---------------------------------------------------------------- checkout price and guard
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000c4', 'aal1');
SELECT pg_temp.ok((SELECT r->>'currency' = 'INR' AND (r->>'amountMinor')::int = 99900 AND r->'providers' = '["razorpay"]'::jsonb
  AND NOT (r->>'billingEnabled')::boolean FROM (SELECT public.billing_checkout_price('40000000-0000-0000-0000-000000000001', 'pro', 'month') AS r) x),
  'Checkout price is the published India price with its provider');
SELECT pg_temp.expect_error($$SELECT public.billing_checkout_price('40000000-0000-0000-0000-000000000001', 'pro', 'year')$$, 'P0001',
  'Yearly is not offered without a yearly price');
SELECT pg_temp.expect_error($$SELECT public.billing_checkout_price('40000000-0000-0000-0000-000000000001', 'starter', 'month')$$, 'P0001',
  'Legacy plans are not on sale');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000c5', 'aal1');
SELECT pg_temp.expect_error($$SELECT public.billing_checkout_price('40000000-0000-0000-0000-000000000001', 'pro', 'month')$$, '42501',
  'Staff cannot start checkout');
RESET ROLE;
SELECT pg_temp.price('pro', 'IN') AS price_pro_in \gset
SELECT pg_temp.price('standard', 'IN') AS price_std_in \gset
SELECT pg_temp.price('business', 'IN') AS price_biz_in \gset
SELECT pg_temp.price('pro', NULL) AS price_pro_base \gset
SELECT pg_temp.expect_error(format($$INSERT INTO public.billing_checkouts (company_id, plan_code, billing_interval, provider, currency,
  unit_amount_minor, plan_price_id, country_code, mode) VALUES ('40000000-0000-0000-0000-000000000001', 'pro', 'month', 'razorpay', 'INR', 99900, %L, 'IN', 'test')$$,
  :'price_pro_in'), '23514', 'Checkout is refused while the country is closed');
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f1', 'aal2');
SELECT pg_temp.expect_error($$SELECT public.platform_set_country_billing('IN', true, 'finance')$$, '42501', 'Finance staff cannot open a country');
RESET ROLE;
-- Opening a country also needs a seller and an approved tax rule (covered in billing-06-tax-invoicing.sql);
-- here the countries are opened directly as test setup.
UPDATE billing.countries SET billing_enabled = true WHERE code IN ('IN', 'GB');
SELECT pg_temp.expect_error(format($$INSERT INTO public.billing_checkouts (company_id, plan_code, billing_interval, provider, currency,
  unit_amount_minor, plan_price_id, country_code, mode) VALUES ('40000000-0000-0000-0000-000000000001', 'pro', 'month', 'razorpay', 'INR', 100, %L, 'IN', 'test')$$,
  :'price_pro_in'), '23514', 'A tampered amount is refused');
SELECT pg_temp.expect_error(format($$INSERT INTO public.billing_checkouts (company_id, plan_code, billing_interval, provider, currency,
  unit_amount_minor, plan_price_id, country_code, mode) VALUES ('40000000-0000-0000-0000-000000000001', 'pro', 'month', 'razorpay', 'USD', 2000, %L, 'IN', 'test')$$,
  :'price_pro_base'), '23514', 'The USD price cannot be bought for a country with its own prices');
INSERT INTO public.billing_checkouts (company_id, plan_code, billing_interval, provider, currency, unit_amount_minor, plan_price_id, country_code, mode)
VALUES ('40000000-0000-0000-0000-000000000001', 'pro', 'month', 'razorpay', 'INR', 99900, :'price_pro_in', 'IN', 'test')
RETURNING id AS checkout_in \gset
SELECT pg_temp.ok(true, 'The published price for an open country is accepted');

-- ---------------------------------------------------------------- provider price mappings
SELECT public.billing_record_provider_price(:'price_pro_in', 'razorpay', 'test', NULL, 'plan_pro_test');
SELECT public.billing_record_provider_price(:'price_std_in', 'razorpay', 'test', NULL, 'plan_std_test');
SELECT public.billing_record_provider_price(:'price_biz_in', 'razorpay', 'test', NULL, 'plan_biz_test');
SELECT pg_temp.ok((public.billing_record_provider_price(:'price_pro_in', 'razorpay', 'test', NULL, 'plan_duplicate')->>'providerPriceId') = 'plan_pro_test',
  'A snapshot keeps its first provider price');
SELECT pg_temp.ok(public.billing_provider_price(:'price_pro_in', 'razorpay', 'live') IS NULL, 'Test and live prices are separate');

-- ---------------------------------------------------------------- provider events
SELECT pg_temp.ok((pg_temp.apply('razorpay', 'evt_x', 'checkout_completed', jsonb_build_object('checkoutId', :'checkout_in',
  'subscriptionId', 'sub_in', 'status', 'past_due'))->>'reason') = 'payment not confirmed', 'An unpaid checkout grants nothing');
SELECT pg_temp.ok((pg_temp.apply('stripe', 'evt_x', 'checkout_completed', jsonb_build_object('checkoutId', :'checkout_in',
  'subscriptionId', 'sub_in', 'status', 'active'))->>'reason') = 'unknown checkout', 'Another provider cannot complete the checkout');
SELECT pg_temp.ok((pg_temp.apply('razorpay', 'evt_1', 'checkout_completed', jsonb_build_object('checkoutId', :'checkout_in',
  'subscriptionId', 'sub_in', 'customerId', 'cust_in', 'status', 'active', 'periodEnd', now() + interval '30 days',
  'occurredAt', now() - interval '10 minutes'))->>'result') = 'applied', 'A verified checkout activates the subscription');
SELECT pg_temp.ok((pg_temp.sub('40000000-0000-0000-0000-000000000001')).status = 'active'
  AND (pg_temp.sub('40000000-0000-0000-0000-000000000001')).plan_price_id = :'price_pro_in'
  AND (pg_temp.sub('40000000-0000-0000-0000-000000000001')).provider_subscription_id = 'sub_in'
  AND (pg_temp.sub('40000000-0000-0000-0000-000000000001')).country_code = 'IN'
  AND (SELECT status FROM public.billing_checkouts WHERE id = :'checkout_in') = 'complete', 'Subscription carries the price snapshot');
SELECT pg_temp.ok((pg_temp.apply('razorpay', 'evt_1', 'checkout_completed', jsonb_build_object('checkoutId', :'checkout_in',
  'subscriptionId', 'sub_in', 'status', 'active'))->>'reason') = 'checkout already completed', 'Replaying activation changes nothing');
SELECT pg_temp.ok((pg_temp.apply('razorpay', 'evt_2', 'subscription_state', jsonb_build_object('subscriptionId', 'sub_in',
  'status', 'active', 'periodEnd', now() + interval '60 days', 'occurredAt', now() - interval '5 minutes'))->>'result') = 'applied',
  'A renewal is applied');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM billing.subscription_events WHERE company_id = '40000000-0000-0000-0000-000000000001'
  AND event_type = 'renewed'), 'The renewal is recorded in the history');
SELECT pg_temp.ok((pg_temp.apply('razorpay', 'evt_0', 'payment_failed', jsonb_build_object('subscriptionId', 'sub_in',
  'occurredAt', now() - interval '8 minutes'))->>'reason') = 'stale event', 'Out-of-order events are skipped');
SELECT pg_temp.ok((pg_temp.apply('razorpay', 'evt_9', 'payment_failed', jsonb_build_object('subscriptionId', 'sub_unknown'))->>'reason')
  = 'unknown subscription', 'Unknown subscriptions are skipped');
SELECT pg_temp.expect_error($$SELECT pg_temp.apply('razorpay', 'evt_bad', 'subscription_state', '{"subscriptionId":"sub_in","status":"bogus"}')$$,
  '22023', 'Unknown statuses are rejected');

-- ---------------------------------------------------------------- plan changes
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000c4', 'aal1');
SELECT public.billing_prepare_plan_change('40000000-0000-0000-0000-000000000001', 'standard') AS down \gset
SELECT pg_temp.expect_error($$SELECT public.billing_prepare_plan_change('40000000-0000-0000-0000-000000000001', 'pro')$$, 'P0001',
  'Changing to the current plan is refused');
SELECT pg_temp.expect_error(format($$SELECT public.billing_record_plan_change('40000000-0000-0000-0000-000000000001', %L, 'scheduled', now(), NULL)$$,
  :'price_std_in'), '42501', 'Customers cannot record provider plan changes');
RESET ROLE;
SELECT pg_temp.ok((:'down'::jsonb)->>'kind' = 'downgrade' AND (:'down'::jsonb)->>'provider' = 'razorpay', 'Moving to Standard is a downgrade');
SELECT public.billing_record_plan_change('40000000-0000-0000-0000-000000000001', :'price_std_in', 'scheduled',
  ((:'down'::jsonb)->>'periodEnd')::timestamptz, '00000000-0000-0000-0000-0000000000c4');
SELECT pg_temp.apply('razorpay', 'evt_3', 'subscription_state', jsonb_build_object('subscriptionId', 'sub_in', 'status', 'active',
  'occurredAt', now(), 'providerPriceId', 'plan_std_test'));
SELECT pg_temp.ok((pg_temp.sub('40000000-0000-0000-0000-000000000001')).plan_code = 'pro', 'A downgrade waits for the renewal');
SELECT pg_temp.apply('razorpay', 'evt_4', 'subscription_state', jsonb_build_object('subscriptionId', 'sub_in', 'status', 'active',
  'occurredAt', now() + interval '61 days', 'periodEnd', now() + interval '91 days', 'providerPriceId', 'plan_std_test'));
SELECT pg_temp.ok((pg_temp.sub('40000000-0000-0000-0000-000000000001')).plan_code = 'standard'
  AND (pg_temp.sub('40000000-0000-0000-0000-000000000001')).unit_amount_minor = 49900
  AND (pg_temp.sub('40000000-0000-0000-0000-000000000001')).scheduled_plan_code IS NULL, 'The downgrade applies at renewal');
SET ROLE authenticated;
SELECT public.billing_prepare_plan_change('40000000-0000-0000-0000-000000000001', 'business') AS up \gset
RESET ROLE;
SELECT public.billing_record_plan_change('40000000-0000-0000-0000-000000000001', :'price_biz_in', 'pending_payment', NULL,
  '00000000-0000-0000-0000-0000000000c4');
SELECT pg_temp.ok((:'up'::jsonb)->>'kind' = 'upgrade' AND (pg_temp.sub('40000000-0000-0000-0000-000000000001')).plan_code = 'standard',
  'An upgrade does not switch before payment');
SELECT pg_temp.apply('razorpay', 'evt_5', 'subscription_state', jsonb_build_object('subscriptionId', 'sub_in', 'status', 'active',
  'occurredAt', now() + interval '62 days', 'providerPriceId', 'plan_biz_test'));
SELECT pg_temp.ok((pg_temp.sub('40000000-0000-0000-0000-000000000001')).plan_code = 'business', 'The upgrade applies when the provider confirms payment');
SELECT pg_temp.apply('razorpay', 'evt_6', 'payment_failed', jsonb_build_object('subscriptionId', 'sub_in', 'occurredAt', now() + interval '63 days'));
SELECT pg_temp.ok((pg_temp.sub('40000000-0000-0000-0000-000000000001')).status = 'past_due', 'A failed payment marks the subscription past due');
SELECT pg_temp.apply('razorpay', 'evt_7', 'subscription_state', jsonb_build_object('subscriptionId', 'sub_in', 'status', 'active',
  'occurredAt', now() + interval '64 days'));
SELECT pg_temp.ok((pg_temp.sub('40000000-0000-0000-0000-000000000001')).status = 'active', 'A recovered payment restores access');

-- ---------------------------------------------------------------- provider cancellation (Razorpay: not reversible)
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000c4', 'aal1');
SELECT public.billing_cancel_subscription('40000000-0000-0000-0000-000000000001', true, NULL, 'other', NULL, NULL)->>'requestId' AS req_fail \gset
SELECT pg_temp.ok(NOT (pg_temp.sub('40000000-0000-0000-0000-000000000001')).cancel_at_period_end,
  'Nothing changes until the provider confirms');
SELECT pg_temp.expect_error(format($$SELECT public.billing_confirm_provider_cancellation(%L, true, NULL, NULL)$$, :'req_fail'), '42501',
  'Customers cannot confirm a provider cancellation');
RESET ROLE;
SELECT public.billing_confirm_provider_cancellation(:'req_fail', false, NULL, 'Provider timeout');
SELECT pg_temp.ok((SELECT status = 'failed' FROM billing.cancellation_requests WHERE id = :'req_fail')
  AND NOT (pg_temp.sub('40000000-0000-0000-0000-000000000001')).cancel_at_period_end, 'A provider failure leaves the subscription running');
SET ROLE authenticated;
SELECT public.billing_cancel_subscription('40000000-0000-0000-0000-000000000001', true, NULL, NULL, NULL, NULL)->>'requestId' AS req_in \gset
RESET ROLE;
SELECT public.billing_confirm_provider_cancellation(:'req_in', true, now() + interval '91 days', NULL);
SELECT pg_temp.ok((pg_temp.sub('40000000-0000-0000-0000-000000000001')).cancel_at_period_end, 'A confirmed cancellation is scheduled');
SET ROLE authenticated;
SELECT pg_temp.ok((public.billing_subscription_state('40000000-0000-0000-0000-000000000001')->'cancellation'->>'reversible')::boolean = false,
  'Razorpay cancellations are shown as final');
SELECT pg_temp.expect_error($$SELECT public.billing_reverse_cancellation('40000000-0000-0000-0000-000000000001')$$, 'P0001',
  'Razorpay cancellations cannot be undone');
RESET ROLE;
SELECT pg_temp.apply('razorpay', 'evt_8', 'subscription_ended', jsonb_build_object('subscriptionId', 'sub_in', 'occurredAt', now() + interval '91 days'));
SELECT pg_temp.ok((pg_temp.sub('40000000-0000-0000-0000-000000000001')).status = 'cancelled'
  AND (SELECT status FROM billing.cancellation_requests WHERE id = :'req_in') = 'effective', 'The provider ending it completes the cancellation');

-- ---------------------------------------------------------------- Stripe subscription: reversible and portal changes
INSERT INTO public.billing_checkouts (company_id, plan_code, billing_interval, provider, currency, unit_amount_minor, plan_price_id, country_code, mode)
VALUES ('40000000-0000-0000-0000-000000000002', 'pro', 'month', 'stripe', 'USD', 2000, :'price_pro_base', 'GB', 'test')
RETURNING id AS checkout_gb \gset
SELECT pg_temp.apply('stripe', 'evt_s1', 'checkout_completed', jsonb_build_object('checkoutId', :'checkout_gb', 'subscriptionId', 'sub_gb',
  'customerId', 'cus_gb', 'status', 'active', 'periodEnd', now() + interval '30 days'));
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000c6', 'aal1');
SELECT public.billing_cancel_subscription('40000000-0000-0000-0000-000000000002', true, NULL, NULL, NULL, NULL)->>'requestId' AS req_gb \gset
RESET ROLE;
SELECT public.billing_confirm_provider_cancellation(:'req_gb', true, now() + interval '30 days', NULL);
SET ROLE authenticated;
SELECT pg_temp.ok((public.billing_reverse_cancellation('40000000-0000-0000-0000-000000000002')->>'status') = 'needs_provider',
  'Withdrawing a Stripe cancellation goes through Stripe first');
RESET ROLE;
SELECT public.billing_confirm_provider_reversal(:'req_gb', '00000000-0000-0000-0000-0000000000c6');
SELECT pg_temp.ok(NOT (pg_temp.sub('40000000-0000-0000-0000-000000000002')).cancel_at_period_end
  AND (SELECT status FROM billing.cancellation_requests WHERE id = :'req_gb') = 'reversed', 'Stripe confirmed the withdrawal');
SELECT pg_temp.apply('stripe', 'evt_s2', 'subscription_state', jsonb_build_object('subscriptionId', 'sub_gb', 'status', 'active',
  'cancelAtPeriodEnd', true, 'periodEnd', now() + interval '30 days'));
SELECT pg_temp.ok((SELECT count(*) FROM billing.cancellation_requests WHERE company_id = '40000000-0000-0000-0000-000000000002'
  AND status = 'scheduled' AND requested_by IS NULL) = 1, 'A cancellation made in the Stripe portal is recorded');
SELECT pg_temp.apply('stripe', 'evt_s3', 'subscription_state', jsonb_build_object('subscriptionId', 'sub_gb', 'status', 'active',
  'cancelAtPeriodEnd', false, 'occurredAt', now() + interval '1 minute'));
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM billing.cancellation_requests WHERE company_id = '40000000-0000-0000-0000-000000000002'
  AND status = 'scheduled'), 'Withdrawing it in the portal clears the schedule');

-- ---------------------------------------------------------------- durable webhook store
SET ROLE service_role;
SELECT public.billing_webhook_receive('stripe', 'evt_store', 'invoice.paid', '{"id":"evt_store"}', now(), 'test') AS stored \gset
RESET ROLE;
SELECT pg_temp.ok((:'stored'::jsonb->>'fresh')::boolean, 'The service role stores a new event');
SELECT pg_temp.ok(NOT (public.billing_webhook_receive('stripe', 'evt_store', 'invoice.paid', '{}', now(), 'test')->>'fresh')::boolean,
  'Redelivery is deduplicated');
SELECT pg_temp.ok((public.billing_webhook_claim((:'stored'::jsonb->>'id')::uuid)->>'attempt')::int = 1
  AND public.billing_webhook_claim((:'stored'::jsonb->>'id')::uuid) IS NULL, 'An event is claimed once');
SELECT public.billing_webhook_finish((:'stored'::jsonb->>'id')::uuid, 'failed', 'timeout', NULL);
SELECT pg_temp.ok((SELECT status = 'failed' AND next_attempt_at > now() AND payload IS NOT NULL FROM public.billing_events
  WHERE id = (:'stored'::jsonb->>'id')::uuid) AND NOT (public.billing_webhook_due(20) ? (:'stored'::jsonb->>'id')),
  'A failed event keeps its payload and waits for its retry time');
UPDATE public.billing_events SET attempts = 10, status = 'processing' WHERE id = (:'stored'::jsonb->>'id')::uuid;
SELECT public.billing_webhook_finish((:'stored'::jsonb->>'id')::uuid, 'failed', 'timeout', NULL);
SELECT pg_temp.ok((SELECT status FROM public.billing_events WHERE id = (:'stored'::jsonb->>'id')::uuid) = 'dead',
  'Repeated failures dead-letter the event');
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT public.platform_requeue_webhook_event((:'stored'::jsonb->>'id')::uuid, 'Provider outage resolved');
SELECT pg_temp.ok((public.platform_payment_settings()->'webhookCounts'->>'received')::int >= 1, 'Platform staff can requeue and see the queue');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000c4', 'aal1');
SELECT pg_temp.expect_error($$SELECT public.billing_webhook_receive('stripe', 'evt_c', 'x', '{}', now(), 'test')$$, '42501',
  'Clients cannot store webhook events');
SELECT pg_temp.expect_error($$SELECT public.billing_apply_provider_event('stripe', 'evt_c', 'payment_failed', '{}')$$, '42501',
  'Clients cannot apply provider events');
SELECT pg_temp.expect_error($$SELECT public.platform_payment_settings()$$, '42501', 'Customers cannot see payment settings');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*) FROM public.platform_billing_audit WHERE action = 'subscription.activated') >= 2,
  'Activations are in the billing audit');
