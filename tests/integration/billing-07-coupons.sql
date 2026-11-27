-- Billing phase 7 assertions: coupon rules, reservations, redemption, provider mappings and
-- invoice discounts. Runs after billing-06-tax-invoicing.sql (India seller, rule and open country).
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
CREATE FUNCTION pg_temp.checkout(_company uuid, _user uuid) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.billing_checkouts (company_id, plan_code, billing_interval, provider, currency, unit_amount_minor,
    plan_price_id, country_code, mode, created_by)
  SELECT _company, 'pro', 'month', 'razorpay', 'INR', 99900, p.id, 'IN', 'test', _user
    FROM public.plan_prices p JOIN public.plan_versions v ON v.id = p.version_id
   WHERE v.plan_code = 'pro' AND v.status = 'published' AND v.price_book AND p.country_code = 'IN' AND p.billing_interval = 'month'
  RETURNING id;
$$;
SELECT pg_temp.act(NULL, NULL);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000e7', 'coupon-one@example.test'),
  ('00000000-0000-0000-0000-0000000000e8', 'coupon-two@example.test'),
  ('00000000-0000-0000-0000-0000000000e9', 'coupon-uk@example.test');
INSERT INTO public.companies (id, name, created_by, country_code, base_currency) VALUES
  ('60000000-0000-0000-0000-000000000001', 'Coupon One', '00000000-0000-0000-0000-0000000000e7', 'IN', 'INR'),
  ('60000000-0000-0000-0000-000000000002', 'Coupon Two', '00000000-0000-0000-0000-0000000000e8', 'IN', 'INR'),
  ('60000000-0000-0000-0000-000000000003', 'Coupon UK', '00000000-0000-0000-0000-0000000000e9', 'GB', 'GBP');
INSERT INTO public.company_members (company_id, user_id, role, status) VALUES
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e7', 'owner', 'active'),
  ('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e8', 'owner', 'active'),
  ('60000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000e9', 'owner', 'active');

-- ---------------------------------------------------------------- creating coupons
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000e7', 'aal1');
SELECT pg_temp.expect_error($$SELECT public.platform_save_coupon('{"code":"X1X","kind":"percent","percentBps":1000}', 'customer')$$,
  '42501', 'Customers cannot create coupons');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f1', 'aal2');
SELECT pg_temp.expect_error($$SELECT public.platform_save_coupon('{"code":"BIG","kind":"percent","percentBps":6000}', 'cap')$$,
  '22023', 'The existing 50% discount cap applies');
SELECT pg_temp.expect_error($$SELECT public.platform_save_coupon('{"code":"a b","kind":"percent","percentBps":1000}', 'bad code')$$,
  '22023', 'Codes are letters, digits, dashes or underscores');
SELECT pg_temp.expect_error($$SELECT public.platform_save_coupon('{"code":"FLAT","kind":"amount","amountMinor":500}', 'no currency')$$,
  '22023', 'A fixed discount needs a currency');
SELECT pg_temp.expect_error($$SELECT public.platform_save_coupon('{"code":"REP","kind":"percent","percentBps":1000,"durationType":"repeating"}', 'months')$$,
  '22023', 'A repeating code needs a number of months');
SELECT pg_temp.expect_error($$SELECT public.platform_save_coupon('{"code":"NOPLAN","kind":"percent","percentBps":1000,"planCodes":["gold"]}', 'plan')$$,
  '22023', 'Unknown plans are refused');
SELECT public.platform_save_coupon('{"code":"launch10","name":"Launch","kind":"percent","percentBps":1000,"planCodes":["pro"],
  "countries":["IN"],"perAccountLimit":1,"maxRedemptions":2,"active":true}', 'Test coupon');
SELECT public.platform_save_coupon('{"code":"FLATUSD","kind":"amount","amountMinor":500,"amountCurrency":"USD","active":true}', 'USD coupon');
SELECT public.platform_save_coupon('{"code":"BIGSPEND","kind":"percent","percentBps":500,"minPurchaseMinor":150000,
  "minPurchaseCurrency":"INR","active":true}', 'Minimum');
SELECT public.platform_save_coupon('{"code":"OLD","kind":"percent","percentBps":500,"endsOn":"2026-01-01","active":true}', 'Expired');
SELECT public.platform_save_coupon('{"code":"ONEONLY","kind":"percent","percentBps":500,"maxRedemptions":1,"active":true}', 'Single');
RESET ROLE;
SELECT pg_temp.ok((SELECT code = 'LAUNCH10' AND per_account_limit = 1 AND duration_type = 'once' AND NOT stackable
  FROM public.billing_offers WHERE code = 'LAUNCH10'), 'Codes are stored upper-case, once, without stacking');
SELECT pg_temp.expect_error($$UPDATE public.billing_offers SET stackable = true WHERE code = 'LAUNCH10'$$, '23514',
  'Stacking cannot be switched on');

-- ---------------------------------------------------------------- quotes
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000e7', 'aal1');
SELECT pg_temp.ok((SELECT (q->'coupon'->>'discountMinor')::int = 9990 AND (q->>'totalMinor')::int = 89910
  AND (q->'tax'->>'taxMinor')::int = 13715
  FROM (SELECT public.billing_quote_coupon('60000000-0000-0000-0000-000000000001', 'pro', 'month', 'launch10') AS q) x),
  'The quote applies the discount and recomputes the included tax');
SELECT pg_temp.expect_error($$SELECT public.billing_quote_coupon('60000000-0000-0000-0000-000000000001', 'standard', 'month', 'LAUNCH10')$$,
  'P0001', 'Plan restrictions apply');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000e9', 'aal1');
SELECT pg_temp.expect_error($$SELECT public.billing_quote_coupon('60000000-0000-0000-0000-000000000003', 'pro', 'month', 'LAUNCH10')$$,
  'P0001', 'Country restrictions apply');
-- GB launch prices are GBP; a fixed USD coupon cannot apply there.
SELECT pg_temp.expect_error($$SELECT public.billing_quote_coupon('60000000-0000-0000-0000-000000000003', 'pro', 'month', 'FLATUSD')$$,
  'P0001', 'A fixed USD discount does not apply to GBP prices');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000e7', 'aal1');
SELECT pg_temp.expect_error($$SELECT public.billing_quote_coupon('60000000-0000-0000-0000-000000000001', 'pro', 'month', 'FLATUSD')$$,
  'P0001', 'A fixed discount only applies in its currency');
SELECT pg_temp.expect_error($$SELECT public.billing_quote_coupon('60000000-0000-0000-0000-000000000001', 'pro', 'month', 'BIGSPEND')$$,
  'P0001', 'The minimum purchase applies');
SELECT pg_temp.expect_error($$SELECT public.billing_quote_coupon('60000000-0000-0000-0000-000000000001', 'pro', 'month', 'OLD')$$,
  'P0001', 'Expired codes are refused');
SELECT pg_temp.expect_error($$SELECT public.billing_quote_coupon('60000000-0000-0000-0000-000000000001', 'pro', 'month', 'NOPE')$$,
  'P0001', 'Unknown codes are refused');
RESET ROLE;

-- ---------------------------------------------------------------- reservation and redemption
SELECT pg_temp.checkout('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e7') AS chk1 \gset
SELECT pg_temp.checkout('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e7') AS chk2 \gset
SELECT pg_temp.checkout('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e8') AS chk3 \gset
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000e8', 'aal1');
SELECT pg_temp.expect_error(format($$SELECT public.billing_attach_coupon(%L, 'LAUNCH10')$$, :'chk1'), '42501',
  'A code can only be attached to your own checkout');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000e7', 'aal1');
SELECT pg_temp.ok((public.billing_attach_coupon(:'chk1', 'LAUNCH10')->>'discountMinor')::int = 9990, 'The code is reserved on the checkout');
SELECT pg_temp.expect_error(format($$SELECT public.billing_attach_coupon(%L, 'LAUNCH10')$$, :'chk2'), 'P0001',
  'One use per billing account');
SELECT pg_temp.ok((public.billing_attach_coupon(:'chk2', 'ONEONLY')->>'code') = 'ONEONLY', 'Another code can be reserved');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000e8', 'aal1');
SELECT pg_temp.expect_error(format($$SELECT public.billing_attach_coupon(%L, 'ONEONLY')$$, :'chk3'), 'P0001',
  'Open reservations count against the overall limit');
RESET ROLE;
UPDATE billing.coupon_redemptions SET created_at = now() - interval '25 hours' WHERE checkout_id = :'chk2';
SET ROLE authenticated;
SELECT pg_temp.ok((public.billing_attach_coupon(:'chk3', 'ONEONLY')->>'code') = 'ONEONLY', 'An abandoned reservation frees its slot after 24 hours');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000e7', 'aal1');
SELECT pg_temp.expect_error(format($$SELECT public.billing_redeem_coupon(%L)$$, :'chk1'), '42501', 'Clients cannot redeem codes');
RESET ROLE;
SELECT pg_temp.ok((SELECT offer_code = 'LAUNCH10' FROM public.billing_checkouts WHERE id = :'chk1'), 'The checkout records the code');
SELECT public.billing_apply_provider_event('razorpay', 'evt_cp1', 'checkout_completed', jsonb_build_object('checkoutId', :'chk1',
  'subscriptionId', 'sub_coupon_1', 'status', 'active'));
SELECT pg_temp.ok((public.billing_redeem_coupon(:'chk1')->>'result') = 'redeemed', 'A verified checkout redeems the code');
SELECT pg_temp.ok((public.billing_redeem_coupon(:'chk1')->>'result') = 'exists', 'A repeated redemption changes nothing');
SELECT pg_temp.ok((SELECT redemption_count FROM public.billing_offers WHERE code = 'LAUNCH10') = 1, 'Redemption is counted once');
SELECT pg_temp.ok((public.billing_redeem_coupon(:'chk2')->>'result') = 'redeemed', 'A reservation can still be redeemed when paid');

-- ---------------------------------------------------------------- terms lock and provider mappings
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT pg_temp.expect_error($$SELECT public.platform_save_coupon('{"code":"LAUNCH10","kind":"percent","percentBps":2000,"planCodes":["pro"],"active":true}', 'change')$$,
  'P0001', 'A used code''s discount cannot change');
SELECT public.platform_save_coupon('{"code":"LAUNCH10","name":"Launch","kind":"percent","percentBps":1000,"planCodes":["pro"],
  "countries":["IN"],"perAccountLimit":1,"maxRedemptions":2,"active":false}', 'Pause');
SELECT public.platform_link_provider_coupon('LAUNCH10', 'razorpay', 'test', 'offer_TestOffer1', 'Dashboard offer');
SELECT pg_temp.expect_error($$SELECT public.platform_link_provider_coupon('LAUNCH10', 'razorpay', 'test', 'bad id!', 'x reason')$$,
  '22023', 'Provider ids are validated');
SELECT pg_temp.ok(jsonb_array_length((SELECT c->'mappings' FROM jsonb_array_elements(public.platform_coupons()) c
  WHERE c->>'code' = 'LAUNCH10')) = 1, 'Platform staff see the provider link');
RESET ROLE;
SELECT pg_temp.ok(NOT (SELECT is_active FROM public.billing_offers WHERE code = 'LAUNCH10'), 'A used code can be paused');
SELECT pg_temp.ok(public.billing_provider_coupon('LAUNCH10', 'razorpay', 'test', 'INR') = 'offer_TestOffer1', 'The Razorpay offer is found');
SELECT public.billing_record_provider_coupon('FLATUSD', 'stripe', 'test', 'USD', 'coupon_first');
SELECT pg_temp.ok(public.billing_record_provider_coupon('FLATUSD', 'stripe', 'test', 'USD', 'coupon_second') = 'coupon_first',
  'A Stripe coupon is created once per code and currency');

-- ---------------------------------------------------------------- discount on the invoice
SELECT public.billing_record_provider_payment('razorpay', 'test', jsonb_build_object('paymentId', 'pay_coupon_1',
  'subscriptionId', 'sub_coupon_1', 'amountMinor', 89910, 'currency', 'INR', 'discountMinor', 9990))->>'invoiceId' AS coupon_invoice \gset
SELECT pg_temp.ok((SELECT total_minor = 89910 AND tax_minor = 13715 AND discount_minor = 9990 AND offer_code = 'LAUNCH10'
  FROM billing.invoices WHERE id = :'coupon_invoice'), 'The invoice records the discount and the tax on the discounted amount');
SELECT pg_temp.ok((public.billing_document('invoice', :'coupon_invoice')->>'discountMinor')::int = 9990, 'The document carries the discount');
SELECT pg_temp.ok((SELECT count(*) FROM public.platform_billing_audit WHERE action = 'coupon.redeemed') >= 2, 'Redemptions are audited');
