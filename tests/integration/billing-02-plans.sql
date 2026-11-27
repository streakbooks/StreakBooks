-- Billing phase 2 assertions: STANDARD / PRO / BUSINESS catalogue, trials and entitlements.
-- Runs after billing-01-accounts.sql on the same database; uses its own users and companies.
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
CREATE FUNCTION pg_temp.limit_of(_plan text, _feature text) RETURNS bigint LANGUAGE sql AS $$
  SELECT l.limit_value FROM public.plan_version_limits l JOIN public.plan_versions v ON v.id = l.version_id
   WHERE v.plan_code = _plan AND v.status = 'published' AND l.feature_key = _feature;
$$;
CREATE FUNCTION pg_temp.enabled(_plan text, _feature text) RETURNS boolean LANGUAGE sql AS $$
  SELECT l.enabled FROM public.plan_version_limits l JOIN public.plan_versions v ON v.id = l.version_id
   WHERE v.plan_code = _plan AND v.status = 'published' AND l.feature_key = _feature;
$$;
CREATE FUNCTION pg_temp.sub(_company uuid) RETURNS public.company_subscriptions LANGUAGE sql AS $$
  SELECT * FROM public.company_subscriptions WHERE company_id = _company;
$$;
SELECT pg_temp.act(NULL, NULL);

-- ---------------------------------------------------------------- catalogue (D2)
SELECT pg_temp.ok((SELECT array_agg(code ORDER BY plan_rank) FROM public.billing_plans
  WHERE is_public AND is_active) = ARRAY['standard', 'pro', 'business'], 'Only STANDARD, PRO and BUSINESS are on sale, in rank order');
SELECT pg_temp.ok((SELECT bool_and(pricing_source = 'price_book' AND trial_enabled AND trial_days = 30)
  FROM public.billing_plans WHERE code IN ('standard', 'pro', 'business')), 'New plans use the price book and a 30-day trial');
SELECT pg_temp.ok((SELECT bool_and(NOT is_public AND NOT trial_enabled AND pricing_source = 'legacy')
  FROM public.billing_plans WHERE code IN ('starter', 'growth', 'premium', 'practice')), 'Legacy plans are hidden, keep legacy pricing and offer no trial');
SELECT pg_temp.ok((SELECT count(*) FROM public.plan_versions WHERE status = 'published' AND visibility = 'live'
  AND plan_code IN ('standard', 'pro', 'business')) = 3, 'Each new plan has one live published version');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.plan_versions WHERE visibility = 'live'
  AND plan_code IN ('starter', 'growth', 'premium', 'practice')), 'No legacy version is live');
SELECT pg_temp.ok((SELECT count(*) FROM public.plan_versions WHERE plan_code = 'pro' AND status = 'published') = 1,
  'Previous top-tier PRO version is archived, not deleted');
-- Launch migration publishes price-book rows for STANDARD / PRO / BUSINESS.
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.plan_prices p JOIN public.plan_versions v ON v.id = p.version_id
  WHERE v.plan_code IN ('standard', 'pro', 'business') AND v.status = 'published' AND v.price_book),
  'Launch price-book rows exist for STANDARD / PRO / BUSINESS');

-- ---------------------------------------------------------------- entitlement matrix (D1, D19)
SELECT pg_temp.ok(pg_temp.limit_of('standard', 'users') = 2 AND pg_temp.limit_of('pro', 'users') = 5
  AND pg_temp.limit_of('business', 'users') = 10, 'User limits 2 / 5 / 10');
SELECT pg_temp.ok(pg_temp.limit_of('standard', 'invoices') = 50 AND pg_temp.limit_of('standard', 'bills') = 50,
  'STANDARD allows 50 invoices and 50 bills per month');
SELECT pg_temp.ok(pg_temp.enabled('pro', 'invoices') AND pg_temp.limit_of('pro', 'invoices') IS NULL
  AND pg_temp.limit_of('business', 'bills') IS NULL, 'PRO and BUSINESS documents are unlimited');
SELECT pg_temp.ok(NOT pg_temp.enabled('standard', 'ai_queries') AND pg_temp.enabled('pro', 'ai_queries'),
  'AI assistant is excluded from STANDARD and included on PRO');
SELECT pg_temp.ok(NOT pg_temp.enabled('standard', 'quotes') AND pg_temp.enabled('pro', 'quotes')
  AND pg_temp.enabled('business', 'quotes'), 'Quotes from PRO');
SELECT pg_temp.ok(NOT pg_temp.enabled('pro', 'fixed_assets') AND pg_temp.enabled('business', 'fixed_assets'),
  'Fixed assets on BUSINESS only');
SELECT pg_temp.ok((SELECT array_agg(key ORDER BY key) FROM public.billing_features WHERE availability = 'coming_soon')
  = ARRAY['api', 'inventory', 'ocr'], 'OCR, inventory and API are marked coming soon');
SELECT pg_temp.ok((SELECT count(*) FROM public.billing_features WHERE key IN ('tax_reports', 'quotes', 'recurring',
  'payment_reminders', 'bank_rules', 'tracking', 'advanced_reporting', 'ocr', 'purchase_orders',
  'advanced_permissions', 'priority_support')) = 11, 'New feature keys registered');
SELECT pg_temp.ok((SELECT trial_plan_code = 'pro' AND trial_days = 30 FROM public.billing_settings WHERE id),
  'Signup trial defaults to PRO for 30 days');

-- ---------------------------------------------------------------- existing subscriptions
SELECT pg_temp.ok((SELECT plan_code = 'pro' AND status = 'trialing' AND trial_ends_at > now() + interval '8 days'
  AND trial_ends_at < now() + interval '10 days' FROM pg_temp.sub('10000000-0000-0000-0000-00000000000a')),
  'Growth trial continues on PRO with its original end date');
SELECT pg_temp.ok((SELECT price_version_id = (SELECT id FROM public.plan_versions WHERE plan_code = 'pro' AND status = 'published')
  FROM pg_temp.sub('10000000-0000-0000-0000-00000000000a')), 'Migrated trial points at the PRO version');
SELECT pg_temp.ok((SELECT plan_code = 'starter' AND status = 'active' AND provider = 'razorpay'
  FROM pg_temp.sub('10000000-0000-0000-0000-00000000000b')), 'Paid legacy subscription is untouched');
SELECT pg_temp.ok((SELECT source = 'backfill' AND user_id = '00000000-0000-0000-0000-0000000000a1' AND billing_account_id IS NOT NULL
  FROM billing.trial_grants WHERE company_id = '10000000-0000-0000-0000-00000000000a'), 'Past trial recorded against its creator and account');

-- ---------------------------------------------------------------- signup trials and abuse rule
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000e1', 'trial-one@example.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'trial-two@example.test');
INSERT INTO public.companies (id, name, created_by, country_code, base_currency)
  VALUES ('20000000-0000-0000-0000-000000000001', 'Echo One', '00000000-0000-0000-0000-0000000000e1', 'IN', 'INR');
INSERT INTO public.company_members (company_id, user_id, role, status)
  VALUES ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', 'owner', 'active');
SELECT pg_temp.ok((SELECT plan_code = 'pro' AND status = 'trialing' AND trial_ends_at - trial_started_at = interval '30 days'
  FROM pg_temp.sub('20000000-0000-0000-0000-000000000001')), 'First organisation starts a 30-day PRO trial');
SELECT pg_temp.ok((SELECT source = 'signup' AND billing_account_id IS NOT NULL FROM billing.trial_grants
  WHERE company_id = '20000000-0000-0000-0000-000000000001'), 'Signup trial is recorded and linked to the billing account');

INSERT INTO public.companies (id, name, created_by, country_code, base_currency)
  VALUES ('20000000-0000-0000-0000-000000000002', 'Echo Two', '00000000-0000-0000-0000-0000000000e1', 'GB', 'GBP');
SELECT pg_temp.ok((SELECT status = 'expired' AND trial_started_at IS NULL FROM pg_temp.sub('20000000-0000-0000-0000-000000000002')),
  'Second organisation by the same person gets no trial');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM billing.trial_grants WHERE company_id = '20000000-0000-0000-0000-000000000002'),
  'No trial record for the second organisation');
INSERT INTO public.company_members (company_id, user_id, role, status)
  VALUES ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e1', 'owner', 'active');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.company_members WHERE company_id = '20000000-0000-0000-0000-000000000002'
  AND user_id = '00000000-0000-0000-0000-0000000000e1'), 'Creator still becomes owner of a read-only organisation');
SELECT pg_temp.expect_error($$INSERT INTO public.company_members (company_id, user_id, role, status)
  VALUES ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e2', 'admin', 'active')$$,
  'P0001', 'Read-only organisation cannot add more people');

INSERT INTO public.companies (id, name, created_by, country_code)
  VALUES ('20000000-0000-0000-0000-000000000003', 'Alpha Two', '00000000-0000-0000-0000-0000000000a1', 'GB');
SELECT pg_temp.ok((SELECT status FROM pg_temp.sub('20000000-0000-0000-0000-000000000003')) = 'expired',
  'Someone whose earlier trial was backfilled gets no new trial');

INSERT INTO public.companies (id, name, created_by, country_code, is_demo)
  VALUES ('20000000-0000-0000-0000-000000000004', 'Demo Company Ltd', '00000000-0000-0000-0000-0000000000e2', 'GB', true);
SELECT pg_temp.ok((SELECT plan_code = 'practice' AND status = 'complimentary' FROM pg_temp.sub('20000000-0000-0000-0000-000000000004')),
  'Demo organisation stays complimentary');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM billing.trial_grants WHERE company_id = '20000000-0000-0000-0000-000000000004'),
  'Demo organisation does not use up a trial');

SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000e1', 'aal1');
SELECT pg_temp.expect_error($$SELECT public.start_company_trial('20000000-0000-0000-0000-000000000002', 'pro')$$,
  'P0001', 'Manual trial refused once the person has used one');
SELECT pg_temp.expect_error($$SELECT public.start_company_trial('20000000-0000-0000-0000-000000000002', 'starter')$$,
  'P0001', 'Manual trial refused on a plan without trials');
SELECT pg_temp.ok((public.get_entitlements('20000000-0000-0000-0000-000000000001')->'limits'->>'users')::int = 5,
  'PRO trial resolves to 5 users');
SELECT pg_temp.ok(public.get_entitlements('20000000-0000-0000-0000-000000000002')->>'access' = 'read_only',
  'Organisation without a plan is read-only');
SELECT pg_temp.expect_error('SELECT * FROM billing.trial_grants', '42501', 'Clients cannot read trial records');
SELECT pg_temp.expect_error($$SELECT billing.trial_eligibility('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1')$$,
  '42501', 'Clients cannot call the eligibility check directly');

-- ---------------------------------------------------------------- public catalogue
RESET ROLE;
SET ROLE anon;
SELECT pg_temp.act(NULL, NULL);
SELECT pg_temp.ok((SELECT array_agg(x->>'code' ORDER BY ord) FROM jsonb_array_elements(public.list_public_billing_plans())
  WITH ORDINALITY AS t(x, ord)) = ARRAY['standard', 'pro', 'business'], 'Public catalogue lists the three plans');
SELECT pg_temp.ok((SELECT x->'trial' = '{"enabled": true, "days": 30}'::jsonb AND x->>'pricingSource' = 'price_book'
  FROM jsonb_array_elements(public.list_public_billing_plans()) x WHERE x->>'code' = 'pro'), 'Public PRO shows its trial and price source');
SELECT pg_temp.ok((SELECT f->>'availability' FROM jsonb_array_elements(public.list_public_billing_plans()) x,
  jsonb_array_elements(x->'features') f WHERE x->>'code' = 'business' AND f->>'key' = 'ocr') = 'coming_soon',
  'Public catalogue marks OCR as coming soon');
RESET ROLE;
BEGIN;
-- Use a non-launch currency so this does not collide with launch USD month rows.
INSERT INTO public.plan_prices (version_id, currency, billing_interval, amount_minor)
  SELECT id, 'EUR', 'month', 4200 FROM public.plan_versions WHERE plan_code = 'pro' AND status = 'published' AND price_book
  ON CONFLICT DO NOTHING;
SET LOCAL ROLE anon;
SELECT pg_temp.ok((SELECT x->'prices' FROM jsonb_array_elements(public.list_public_billing_plans()) x
  WHERE x->>'code' = 'pro') = 'null'::jsonb, 'Legacy catalogue never shows a price-book plan price');
ROLLBACK;
SET ROLE anon;
SELECT pg_temp.expect_error($$SELECT public.platform_set_plan_trial('pro', true, 30, 'anon')$$, '42501',
  'Anonymous callers cannot change plans');
SELECT pg_temp.expect_error($$SELECT public.start_company_trial('20000000-0000-0000-0000-000000000002', 'pro')$$, '42501',
  'Anonymous callers cannot start trials');
RESET ROLE;

-- ---------------------------------------------------------------- guards
SELECT pg_temp.expect_error($$INSERT INTO public.billing_checkouts (company_id, plan_code, billing_interval, provider, currency, unit_amount_minor)
  VALUES ('20000000-0000-0000-0000-000000000001', 'pro', 'month', 'stripe', 'USD', 0)$$,
  '23514', 'Legacy checkout refuses plans without published prices');
INSERT INTO public.billing_checkouts (company_id, plan_code, billing_interval, provider, currency, unit_amount_minor)
  VALUES ('20000000-0000-0000-0000-000000000001', 'starter', 'month', 'stripe', 'GBP', 1200);
SELECT pg_temp.ok(true, 'Legacy checkout still accepts a legacy plan');
SELECT pg_temp.expect_error($$UPDATE public.company_subscriptions SET plan_code = 'business'
  WHERE company_id = '10000000-0000-0000-0000-00000000000b'$$, '23514', 'Paid subscription cannot move to an unpriced plan');
UPDATE public.company_subscriptions SET plan_code = 'business' WHERE company_id = '20000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok((SELECT plan_code = 'business' AND status = 'trialing' AND trial_started_at IS NOT NULL
  FROM pg_temp.sub('20000000-0000-0000-0000-000000000001')), 'Trial can switch plan and keeps its dates');
UPDATE public.company_subscriptions SET plan_code = 'pro' WHERE company_id = '20000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------- platform administration
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000a1', 'aal2');
SELECT pg_temp.expect_error($$SELECT public.platform_set_plan_trial('standard', true, 14, 'not staff')$$, '42501',
  'Customers cannot change trial settings');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f1', 'aal1');
SELECT pg_temp.expect_error($$SELECT public.platform_set_trial_rule('max_trials_per_user', false, 1, 'no mfa')$$, '42501',
  'Platform staff need an MFA session');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f1', 'aal2');
SELECT pg_temp.ok((public.platform_set_plan_trial('standard', true, 14, 'Shorter STANDARD trial')->>'trialDays')::int = 14,
  'Platform staff set a plan trial length');
SELECT pg_temp.expect_error($$SELECT public.platform_set_plan_trial('standard', true, 0, 'bad length')$$, '22023',
  'Trial length is validated');
SELECT pg_temp.expect_error($$SELECT public.platform_set_trial_rule('unknown_rule', true, 1, 'bad rule')$$, '22023',
  'Unknown trial rules are refused');
SELECT public.platform_set_trial_rule('max_trials_per_user', false, 1, 'Allow repeat trials for a pilot');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*) FROM public.platform_audit WHERE action IN ('plan.trial_updated', 'trial_rule.updated')) = 2,
  'Trial setting changes are audited');
SELECT pg_temp.ok((SELECT trial_days FROM public.billing_plans WHERE code = 'standard') = 14, 'Trial length stored');

UPDATE public.billing_settings SET trial_plan_code = 'standard' WHERE id;
INSERT INTO public.companies (id, name, created_by, country_code)
  VALUES ('20000000-0000-0000-0000-000000000005', 'Echo Three', '00000000-0000-0000-0000-0000000000e1', 'AU');
SELECT pg_temp.ok((SELECT plan_code = 'standard' AND status = 'trialing' AND trial_ends_at - trial_started_at = interval '14 days'
  FROM pg_temp.sub('20000000-0000-0000-0000-000000000005')), 'With the per-person rule off, a new organisation trials the configured plan');
UPDATE public.billing_settings SET trial_plan_code = 'pro' WHERE id;

SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f1', 'aal2');
SELECT public.platform_set_trial_rule('max_trials_per_user', true, 1, 'Pilot finished');
SELECT pg_temp.ok((public.platform_draft_plan_limits('pro', '[{"featureKey": "users", "enabled": true, "limit": 6}]',
  'Proposed PRO seat increase')->>'status') = 'review', 'Finance staff limit changes go to review');
SELECT pg_temp.expect_error($$SELECT public.platform_draft_plan_limits('pro', '[{"featureKey": "nope", "enabled": true}]', 'typo')$$,
  '22023', 'Unknown features are refused');
SELECT pg_temp.expect_error($$SELECT public.platform_draft_plan_limits('pro', '[{"featureKey": "users", "enabled": true, "limit": -1}]', 'neg')$$,
  '22023', 'Negative limits are refused');
RESET ROLE;
SELECT pg_temp.ok(pg_temp.limit_of('pro', 'users') = 5, 'Published PRO limits are unchanged by a draft');
SELECT pg_temp.ok((SELECT l.limit_value FROM public.plan_version_limits l JOIN public.plan_versions v ON v.id = l.version_id
  WHERE v.plan_code = 'pro' AND v.status = 'review' AND l.feature_key = 'users') = 6, 'Draft carries the proposed limit');
SELECT pg_temp.ok((SELECT count(*) FROM public.plan_version_limits l JOIN public.plan_versions v ON v.id = l.version_id
  WHERE v.plan_code = 'pro' AND v.status = 'review') = (SELECT count(*) FROM public.plan_version_limits l
  JOIN public.plan_versions v ON v.id = l.version_id WHERE v.plan_code = 'pro' AND v.status = 'published'),
  'Draft copies every published entitlement');
