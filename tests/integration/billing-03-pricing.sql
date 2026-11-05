-- Billing phase 3 assertions: country pricing, exchange rates, exact conversion and publication.
-- Runs after billing-02-plans.sql on the same database.
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
-- "plan:interval:currency:amount:strategy" for the prices a country is offered.
CREATE FUNCTION pg_temp.offer(_country text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(format('%s:%s:%s:%s:%s', p->>'code', x->>'interval', x->>'currency', x->>'amountMinor', x->>'strategy'),
    ' ' ORDER BY p->>'code', x->>'interval'), '')
    FROM jsonb_array_elements(public.billing_price_list(_country)->'plans') p, jsonb_array_elements(p->'prices') x;
$$;
CREATE FUNCTION pg_temp.draft(_plan text, _reason text) RETURNS uuid LANGUAGE sql AS $$
  SELECT (public.platform_draft_country_prices(_plan, _reason)->>'versionId')::uuid;
$$;
CREATE FUNCTION pg_temp.publish(_version uuid, _reason text) RETURNS void LANGUAGE sql AS $$
  SELECT private.platform_price_action('publish', jsonb_build_object('versionId', _version), _reason);
$$;
SELECT pg_temp.act(NULL, NULL);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000f2', 'owner-one@example.test'),
  ('00000000-0000-0000-0000-0000000000f3', 'owner-two@example.test');
INSERT INTO public.platform_roles (user_id, role) VALUES
  ('00000000-0000-0000-0000-0000000000f2', 'platform_owner'),
  ('00000000-0000-0000-0000-0000000000f3', 'platform_owner');

-- ---------------------------------------------------------------- exact arithmetic
SELECT pg_temp.ok(billing.round_ratio(15, 10, 'HALF_UP') = 2 AND billing.round_ratio(25, 10, 'HALF_UP') = 3
  AND billing.round_ratio(-15, 10, 'HALF_UP') = -2, 'HALF_UP rounds halves away from zero');
SELECT pg_temp.ok(billing.round_ratio(15, 10, 'HALF_EVEN') = 2 AND billing.round_ratio(25, 10, 'HALF_EVEN') = 2
  AND billing.round_ratio(-25, 10, 'HALF_EVEN') = -2, 'HALF_EVEN rounds halves to even');
SELECT pg_temp.ok(billing.round_ratio(11, 10, 'UP') = 2 AND billing.round_ratio(19, 10, 'DOWN') = 1
  AND billing.round_ratio(-11, 10, 'UP') = -2 AND billing.round_ratio(20, 10, 'UP') = 2, 'UP and DOWN work by magnitude');
SELECT pg_temp.expect_error($$SELECT billing.round_ratio(1, 3, 'NEAREST')$$, '22023', 'Unknown rounding mode refused');
SELECT pg_temp.ok(billing.fx_convert(1000, 'USD', 'AUD', 1.523456789012, 0, 'HALF_UP') = 1523, 'USD 10 to AUD');
SELECT pg_temp.ok(billing.fx_convert(5000, 'USD', 'JPY', 151.37, 0, 'HALF_UP') = 7569
  AND billing.fx_convert(5000, 'USD', 'JPY', 151.37, 0, 'HALF_EVEN') = 7568
  AND billing.fx_convert(5000, 'USD', 'JPY', 151.37, 0, 'DOWN') = 7568, 'Zero-decimal JPY honours the rounding mode on an exact half');
SELECT pg_temp.ok(billing.fx_convert(1000, 'USD', 'KWD', 0.3071, 250, 'UP') = 3148, 'Three-decimal KWD with a 2.5% markup');
SELECT pg_temp.ok(billing.fx_convert(99999999999, 'USD', 'INR', 83.123456789012, 0, 'HALF_UP') = 8312345678818,
  'Large amounts stay exact');

-- ---------------------------------------------------------------- seeded state
SELECT pg_temp.ok((SELECT count(*) FROM billing.price_inputs) = 6, 'Brief prices seeded as inputs (3 USD base, 3 India INR)');
SELECT pg_temp.ok((SELECT amount_minor FROM billing.price_inputs WHERE plan_code = 'pro' AND country_code IS NULL) = 2000
  AND (SELECT amount_minor FROM billing.price_inputs WHERE plan_code = 'business' AND country_code = 'IN') = 199900,
  'Seeded amounts match the brief');
SELECT pg_temp.ok((SELECT strategy = 'FIXED' AND currency = 'INR' FROM billing.country_pricing_rules WHERE country_code = 'IN'),
  'India uses fixed INR prices');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM billing.price_inputs WHERE billing_interval = 'year'), 'No yearly price is invented');
SELECT pg_temp.ok(pg_temp.offer('IN') = '' AND pg_temp.offer('US') = '', 'Nothing is published by the migration');
SELECT pg_temp.ok((SELECT bool_and(price_book) FROM public.plan_versions v WHERE v.plan_code IN ('standard', 'business'))
  AND NOT (SELECT price_book FROM public.plan_versions WHERE plan_code = 'pro' AND version_no = 1),
  'Catalogue versions are price-book versions; the retired PRO version is not');

-- ---------------------------------------------------------------- access
SET ROLE anon;
SELECT pg_temp.ok(public.billing_price_list('US') ? 'plans', 'Anonymous visitors can read the price list');
SELECT pg_temp.expect_error($$SELECT public.platform_country_pricing()$$, '42501', 'Anonymous callers cannot read pricing admin');
SELECT pg_temp.expect_error($$SELECT public.platform_draft_country_prices('pro', 'anon')$$, '42501', 'Anonymous callers cannot draft prices');
RESET ROLE;
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000a1', 'aal2');
SELECT pg_temp.expect_error('SELECT * FROM billing.price_inputs', '42501', 'Clients cannot read price inputs');
SELECT pg_temp.expect_error('SELECT * FROM billing.exchange_rates', '42501', 'Clients cannot read exchange rates');
SELECT pg_temp.expect_error($$SELECT public.platform_record_exchange_rate('AUD', '1.5', NULL, 'customer')$$, '42501',
  'Customers cannot record rates');
SELECT pg_temp.expect_error($$SELECT public.platform_set_price_input('pro', 'month', NULL, 'USD', 1, 'customer')$$, '42501',
  'Customers cannot change prices');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal1');
SELECT pg_temp.expect_error($$SELECT public.platform_country_pricing()$$, '42501', 'Platform staff need an MFA session');

-- ---------------------------------------------------------------- validation
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT pg_temp.ok(jsonb_array_length(public.platform_country_pricing()->'inputs') = 6, 'Platform owner sees the pricing inputs');
SELECT pg_temp.expect_error($$SELECT public.platform_set_country_pricing_rule('DE', 'BASE', 'EUR', 0, 'HALF_UP', NULL, true, 'bad')$$,
  '22023', 'BASE rule must be USD');
SELECT pg_temp.expect_error($$SELECT public.platform_set_country_pricing_rule('DE', 'FX_CONVERTED', 'USD', 0, 'HALF_UP', NULL, true, 'bad')$$,
  '22023', 'FX rule needs a non-USD currency');
SELECT pg_temp.expect_error($$SELECT public.platform_set_country_pricing_rule('DE', 'FX_CONVERTED', 'EUR', 10001, 'HALF_UP', NULL, true, 'bad')$$,
  '22023', 'Markup is capped');
SELECT pg_temp.expect_error($$SELECT public.platform_set_country_pricing_rule('ZZ', 'FIXED', 'USD', 0, 'HALF_UP', NULL, true, 'bad')$$,
  '22023', 'Unknown country refused');
SELECT pg_temp.expect_error($$SELECT public.platform_set_price_input('pro', 'month', NULL, 'INR', 100, 'bad')$$,
  '22023', 'Base prices must be USD');
SELECT pg_temp.expect_error($$SELECT public.platform_set_price_input('pro', 'month', 'IN', 'INR', 0, 'bad')$$,
  '22023', 'Zero price refused');
SELECT pg_temp.expect_error($$SELECT public.platform_set_price_input('starter', 'month', NULL, 'USD', 1200, 'bad')$$,
  '22023', 'Legacy plans are not priced by country');
SELECT pg_temp.expect_error($$SELECT public.platform_record_exchange_rate('AUD', '1.5e2', NULL, 'bad')$$,
  '22023', 'Rates must be plain decimals');
SELECT pg_temp.expect_error($$SELECT public.platform_record_exchange_rate('AUD', '0', NULL, 'bad')$$,
  '22023', 'Zero rate refused');
SELECT pg_temp.expect_error($$SELECT public.platform_record_exchange_rate('USD', '1', NULL, 'bad')$$,
  '22023', 'USD to USD rate refused');

-- ---------------------------------------------------------------- draft and two-person publication
SELECT pg_temp.draft('standard', 'Launch prices') AS std_v1 \gset
SELECT pg_temp.draft('pro', 'Launch prices') AS pro_v1 \gset
SELECT pg_temp.draft('business', 'Launch prices') AS biz_v1 \gset
-- private.platform_price_action is reached through a server wrapper; call it as the owner with the
-- caller's claims, which is what decides who is acting.
RESET ROLE;
SELECT pg_temp.ok((SELECT status = 'draft' AND price_book AND visibility = 'draft' FROM public.plan_versions WHERE id = :'pro_v1'),
  'Owner draft is an unpublished price-book version');
SELECT pg_temp.ok((SELECT count(*) FROM public.plan_prices WHERE version_id = :'pro_v1') = 2, 'Draft holds the USD base and India prices');
SELECT pg_temp.ok((SELECT count(*) FROM public.plan_version_limits WHERE version_id = :'pro_v1')
  = (SELECT count(*) FROM public.plan_version_limits l JOIN public.plan_versions v ON v.id = l.version_id
     WHERE v.plan_code = 'pro' AND v.status = 'published'), 'Draft keeps the published entitlements');
SELECT pg_temp.ok(pg_temp.offer('US') = '', 'Drafts are not visible to customers');
SELECT pg_temp.expect_error(format($$SELECT pg_temp.publish(%L, 'self approval')$$, :'pro_v1'), '42501',
  'The drafter cannot publish their own prices');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f1', 'aal2');
SELECT pg_temp.expect_error(format($$SELECT pg_temp.publish(%L, 'finance approval')$$, :'pro_v1'), '42501',
  'Finance staff cannot publish');
SET ROLE authenticated;
SELECT pg_temp.ok((public.platform_draft_country_prices('standard', 'Finance proposal')->>'status') = 'review',
  'Finance staff drafts go to review');
RESET ROLE;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f3', 'aal2');
SELECT pg_temp.publish(:'std_v1', 'Second owner approval');
SELECT pg_temp.publish(:'pro_v1', 'Second owner approval');
SELECT pg_temp.publish(:'biz_v1', 'Second owner approval');
SET ROLE anon;
SELECT pg_temp.ok(pg_temp.offer('IN') = 'business:month:INR:199900:FIXED pro:month:INR:99900:FIXED standard:month:INR:49900:FIXED',
  'India sees the fixed INR prices');
SELECT pg_temp.ok(pg_temp.offer('us') = 'business:month:USD:5000:BASE pro:month:USD:2000:BASE standard:month:USD:1000:BASE',
  'United States sees the USD base prices');
SELECT pg_temp.ok(pg_temp.offer('ZZ') = pg_temp.offer(NULL) AND public.billing_price_list('ZZ')->>'country' IS NULL,
  'Unknown countries fall back to USD');
SELECT pg_temp.ok(pg_temp.offer('GB') = pg_temp.offer('US'), 'Countries without a rule use the base prices');
RESET ROLE;

-- ---------------------------------------------------------------- FX countries
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT public.platform_set_country_pricing_rule('AU', 'FX_CONVERTED', 'AUD', 0, 'HALF_UP', 48, true, 'Australia launch');
SELECT public.platform_set_country_pricing_rule('NF', 'FX_CONVERTED', 'AUD', 0, 'HALF_UP', NULL, true, 'Norfolk Island');
SELECT public.platform_set_country_pricing_rule('KW', 'FX_CONVERTED', 'KWD', 250, 'UP', NULL, true, 'Kuwait');
SELECT pg_temp.expect_error($$SELECT pg_temp.draft('pro', 'missing rates')$$, '22023', 'Draft refused while a rate is missing');
SELECT public.platform_record_exchange_rate('AUD', '1.523456789012', now() - interval '1 minute', 'Manual AUD rate');
SELECT public.platform_record_exchange_rate('KWD', '0.3071', now() - interval '1 minute', 'Manual KWD rate');
RESET ROLE;
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.plan_versions WHERE reason = 'missing rates'), 'A refused draft leaves nothing behind');
INSERT INTO billing.exchange_rates (quote_currency, rate, source, provider, fetched_at, effective_at)
  VALUES ('NZD', 1.7, 'MANUAL', 'manual', now() - interval '3 hours', now() - interval '3 hours');
SET ROLE authenticated;
SELECT public.platform_set_country_pricing_rule('NZ', 'FX_CONVERTED', 'NZD', 0, 'HALF_UP', 1, true, 'New Zealand');
SELECT pg_temp.expect_error($$SELECT pg_temp.draft('pro', 'stale rate')$$, '22023', 'Draft refused when a rate is older than allowed');
SELECT public.platform_set_country_pricing_rule('NZ', 'FX_CONVERTED', 'NZD', 0, 'HALF_UP', 1, false, 'Pause New Zealand');
SELECT pg_temp.draft('pro', 'Add FX countries') AS pro_v2 \gset
RESET ROLE;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f3', 'aal2');
SELECT pg_temp.publish(:'pro_v2', 'Second owner approval');
SELECT pg_temp.ok(pg_temp.offer('AU') LIKE '%pro:month:AUD:3047:FX_CONVERTED%', 'Australia sees the converted AUD price');
SELECT pg_temp.ok(pg_temp.offer('NF') LIKE '%pro:month:AUD:3047:FX_CONVERTED%', 'Two countries can share a currency');
SELECT pg_temp.ok(pg_temp.offer('KW') LIKE '%pro:month:KWD:6296:FX_CONVERTED%', 'Kuwait sees the marked-up KWD price');
SELECT pg_temp.ok(pg_temp.offer('AU') LIKE '%standard:month:USD:1000:BASE%', 'Plans not yet republished keep their published prices');
SELECT pg_temp.ok(pg_temp.offer('NZ') = pg_temp.offer('US'), 'Paused rules fall back to the base prices');
SELECT pg_temp.ok((SELECT base_currency = 'USD' AND base_amount_minor = 2000 AND fx_rate = 1.523456789012 AND markup_bps = 0
  AND rounding_mode = 'HALF_UP' AND fx_rate_id IS NOT NULL FROM public.plan_prices
  WHERE version_id = :'pro_v2' AND country_code = 'AU'), 'Snapshot records base amount, rate, markup and rounding');

-- ---------------------------------------------------------------- immutability and rollback
SELECT pg_temp.expect_error(format($$UPDATE public.plan_prices SET amount_minor = 1 WHERE version_id = %L$$, :'pro_v2'),
  '55000', 'Published prices cannot change');
SELECT pg_temp.expect_error(format($$DELETE FROM public.plan_prices WHERE version_id = %L$$, :'pro_v2'),
  '55000', 'Published prices cannot be deleted');
SELECT pg_temp.expect_error($$UPDATE billing.exchange_rates SET rate = 2$$, '55000', 'Exchange rates are append-only');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT pg_temp.expect_error($$SELECT private.platform_price_action('draft', '{"planCode":"pro","currency":"USD","interval":"month","amountMinor":2500}', 'legacy')$$,
  '22023', 'Single-price drafts are refused for price-book plans');
SELECT private.platform_price_action('rollback', '{"planCode":"pro"}', 'Undo FX launch');
SELECT pg_temp.ok(pg_temp.offer('AU') LIKE '%pro:month:USD:2000:BASE%', 'Rollback restores the previous price-book prices');
SELECT pg_temp.ok((SELECT status FROM public.plan_versions WHERE plan_code = 'pro' AND version_no = 1) = 'archived',
  'Rollback never republishes the retired PRO prices');
SELECT pg_temp.ok((SELECT count(*) FROM public.platform_audit WHERE action IN ('price.country_draft', 'price.publish',
  'pricing.country_rule_set', 'pricing.fx_rate_recorded', 'price.rollback')) >= 12, 'Pricing changes are audited');
