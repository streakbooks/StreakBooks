-- Billing phase 8 assertions: CA partner applications, referral codes, disclosure, attribution,
-- commission rules, the append-only commission ledger and manual payouts (disabled by default).
-- Runs after billing-07-coupons.sql (India prices, seller, tax rule and open country).
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
CREATE FUNCTION pg_temp.pay(_payment text, _subscription text, _amount bigint) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.billing_record_provider_payment('razorpay', 'test', jsonb_build_object('paymentId', _payment,
    'subscriptionId', _subscription, 'amountMinor', _amount, 'currency', 'INR'));
$$;
SELECT pg_temp.act(NULL, NULL);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000ea', 'ca-partner@example.test'),
  ('00000000-0000-0000-0000-0000000000eb', 'referred-one@example.test'),
  ('00000000-0000-0000-0000-0000000000ec', 'referred-late@example.test');
INSERT INTO public.companies (id, name, created_by, country_code, base_currency) VALUES
  ('80000000-0000-0000-0000-000000000001', 'Referred One', '00000000-0000-0000-0000-0000000000eb', 'IN', 'INR'),
  ('80000000-0000-0000-0000-000000000002', 'Referred Late', '00000000-0000-0000-0000-0000000000ec', 'IN', 'INR'),
  ('80000000-0000-0000-0000-000000000003', 'CA Own Books', '00000000-0000-0000-0000-0000000000ea', 'IN', 'INR');
INSERT INTO public.company_members (company_id, user_id, role, status) VALUES
  ('80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000eb', 'owner', 'active'),
  ('80000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000ec', 'owner', 'active'),
  ('80000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000ea', 'owner', 'active');
INSERT INTO public.firms (id, name, created_by) VALUES
  ('81000000-0000-0000-0000-000000000001', 'Sharma & Co Chartered Accountants', '00000000-0000-0000-0000-0000000000ea');
INSERT INTO public.firm_members (firm_id, user_id, role) VALUES
  ('81000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000ea', 'owner');

SELECT pg_temp.ok((SELECT NOT payouts_enabled AND attribution_window_days IS NULL AND attribution_model = 'last_touch'
  FROM billing.partner_program), 'The programme starts closed, last-touch, with payouts disabled');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM billing.commission_rules), 'No commission rule is seeded');

-- ---------------------------------------------------------------- applications
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000eb', 'aal1');
SELECT pg_temp.expect_error($$SELECT public.platform_partner_program()$$, '42501', 'Customers cannot see the partner programme');
SELECT pg_temp.expect_error($$SELECT public.billing_partner_apply('81000000-0000-0000-0000-000000000001', NULL, 'IN', NULL,
  gen_random_uuid(), NULL)$$, '42501', 'Only firm owners or admins can apply');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000ea', 'aal1');
SELECT pg_temp.expect_error($$SELECT public.billing_partner_apply('81000000-0000-0000-0000-000000000001', NULL, 'IN', NULL,
  gen_random_uuid(), NULL)$$, '40001', 'Applying needs the published partner terms');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT (public.platform_draft_legal_document('PARTNER_TERMS', 'en', 'Partner terms', 'Test partner terms for the partner programme.', 'Test')->>'id') AS terms \gset
SELECT (public.platform_draft_legal_document('PARTNER_DISCLOSURE', 'en', 'Partner disclosure', 'Your adviser may be paid a commission.', 'Test')->>'id') AS disclosure \gset
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f3', 'aal2');
SELECT public.platform_approve_legal_document(:'terms', 'Reviewed');
SELECT public.platform_publish_legal_document(:'terms', 'Publish');
SELECT public.platform_approve_legal_document(:'disclosure', 'Reviewed');
SELECT public.platform_publish_legal_document(:'disclosure', 'Publish');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000ea', 'aal1');
SELECT (public.billing_partner_apply('81000000-0000-0000-0000-000000000001', 'ca@example.test', 'in', 'ICAI 123456',
  :'terms', NULL)->>'id') AS partner \gset
SELECT pg_temp.expect_error(format($$SELECT public.billing_partner_apply('81000000-0000-0000-0000-000000000001', NULL, 'IN', NULL, %L, NULL)$$,
  :'terms'), '23505', 'A firm applies once');
SELECT pg_temp.expect_error(format($$SELECT public.billing_partner_create_code(%L)$$, :'partner'), 'P0001',
  'No referral codes before approval');
RESET ROLE;
SELECT pg_temp.ok((SELECT status = 'pending' AND country_code = 'IN' AND applied_by = '00000000-0000-0000-0000-0000000000ea'
  FROM public.platform_partners WHERE id = :'partner'), 'The application is pending');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM billing.legal_acceptances WHERE kind = 'PARTNER_TERMS'
  AND user_id = '00000000-0000-0000-0000-0000000000ea'), 'Acceptance of the partner terms is recorded');

SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT public.platform_add_partner_user(:'partner', 'platform-finance@example.test', 'member', 'Finance contact');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f1', 'aal2');
SELECT pg_temp.expect_error(format($$SELECT public.platform_review_partner(%L, 'approve', 'checked', 'member')$$, :'partner'),
  '42501', 'A partner member cannot approve their partnership');
SELECT pg_temp.expect_error(format($$SELECT public.billing_partner_create_code(%L)$$, :'partner'), '42501',
  'Partner members who are not admins cannot create codes');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT pg_temp.expect_error(format($$SELECT public.platform_review_partner(%L, 'approve', NULL, 'no evidence')$$, :'partner'),
  '22023', 'Approval records what was verified');
SELECT pg_temp.ok((public.platform_review_partner(:'partner', 'approve', 'ICAI register checked', 'Verified')->>'status') = 'approved',
  'Platform staff approve with evidence');

-- ---------------------------------------------------------------- referral codes and programme settings
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000ea', 'aal1');
SELECT (public.billing_partner_create_code(:'partner')->>'code') AS code1 \gset
SELECT pg_temp.ok(:'code1' ~ '^[A-Z0-9]{12}$', 'Codes are random and 12 characters');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000eb', 'aal1');
SELECT pg_temp.expect_error(format($$SELECT public.billing_record_referral('80000000-0000-0000-0000-000000000001', %L, %L, NULL)$$,
  :'code1', :'disclosure'), 'P0001', 'Referrals are refused until an attribution window is set');

SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT pg_temp.expect_error($$SELECT public.platform_request_partner_program_change('{"commissionPercent": 10}', 'unknown')$$,
  '22023', 'Unknown programme settings are refused');
SELECT pg_temp.expect_error($$SELECT public.platform_request_partner_program_change('{"payoutsEnabled": true}', 'enable')$$,
  '22023', 'Payouts need a regulatory review reference');
SELECT (public.platform_request_partner_program_change('{"attributionWindowDays": 90}', 'Open (test value)')->>'id') AS change1 \gset
SELECT pg_temp.expect_error(format($$SELECT public.platform_decide_partner_program_change(%L, true, 'self')$$, :'change1'),
  '42501', 'The requester cannot approve their own change');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f1', 'aal2');
SELECT pg_temp.expect_error(format($$SELECT public.platform_decide_partner_program_change(%L, true, 'finance')$$, :'change1'),
  '42501', 'Only platform owners decide programme changes');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f3', 'aal2');
SELECT public.platform_decide_partner_program_change(:'change1', true, 'Second owner');
RESET ROLE;
SELECT pg_temp.ok((SELECT attribution_window_days = 90 AND NOT payouts_enabled FROM billing.partner_program),
  'A second owner opens the programme; payouts stay off');

-- ---------------------------------------------------------------- referrals and disclosure
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000ea', 'aal1');
SELECT pg_temp.expect_error(format($$SELECT public.billing_record_referral('80000000-0000-0000-0000-000000000003', %L, %L, NULL)$$,
  :'code1', :'disclosure'), '42501', 'Partners cannot refer an organisation they manage');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000eb', 'aal1');
SELECT pg_temp.expect_error(format($$SELECT public.billing_record_referral('80000000-0000-0000-0000-000000000002', %L, %L, NULL)$$,
  :'code1', :'disclosure'), '42501', 'Referrals need billing permission on the organisation');
SELECT pg_temp.expect_error(format($$SELECT public.billing_record_referral('80000000-0000-0000-0000-000000000001', %L, %L, NULL)$$,
  :'code1', :'terms'), '40001', 'The current partner disclosure must be accepted');
SELECT pg_temp.expect_error(format($$SELECT public.billing_record_referral('80000000-0000-0000-0000-000000000001', 'NOPE12345678', %L, NULL)$$,
  :'disclosure'), 'P0001', 'Unknown codes are refused');
SELECT pg_temp.ok((public.billing_record_referral('80000000-0000-0000-0000-000000000001', lower(:'code1'), :'disclosure', NULL)
  ->>'result') = 'attributed', 'A customer referral is attributed');
SELECT pg_temp.ok((SELECT (s->'attribution'->>'partnerName') = 'Sharma & Co Chartered Accountants' AND (s->>'programOpen')::boolean
  FROM (SELECT public.billing_referral_status('80000000-0000-0000-0000-000000000001') AS s) x), 'The customer sees who referred them');
SELECT pg_temp.expect_error($$SELECT count(*) FROM billing.referral_attributions$$, '42501', 'Clients cannot read referral tables');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000ec', 'aal1');
SELECT public.billing_record_referral('80000000-0000-0000-0000-000000000002', :'code1', :'disclosure', NULL);
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*) FROM billing.referral_touches t JOIN billing.legal_acceptances a ON a.id = t.disclosure_acceptance_id
  WHERE a.kind = 'PARTNER_DISCLOSURE') = 2, 'Every touch records the disclosure acceptance');
SET ROLE anon;
SELECT pg_temp.expect_error(format($$SELECT public.billing_record_referral('80000000-0000-0000-0000-000000000001', %L, %L, NULL)$$,
  :'code1', :'disclosure'), '42501', 'Anonymous callers cannot record referrals');
RESET ROLE;

-- ---------------------------------------------------------------- commission rules
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT pg_temp.expect_error($$SELECT public.platform_save_commission_rule('{"name":"Bad","kind":"percent","holdDays":0,
  "minPayoutMinor":0,"minPayoutCurrency":"INR","effectiveFrom":"2026-01-01"}', 'missing rate')$$, '23514', 'A percentage rule needs a rate');
SELECT (public.platform_save_commission_rule('{"name":"Test rule","kind":"percent","percentBps":1000,"planCodes":["pro"],
  "countries":["IN"],"durationMonths":12,"holdDays":0,"minPayoutMinor":1000,"minPayoutCurrency":"INR",
  "effectiveFrom":"2026-01-01"}', 'Test values only')->>'id') AS rule1 \gset
SELECT pg_temp.expect_error(format($$SELECT public.platform_approve_commission_rule(%L, 'self')$$, :'rule1'), '42501',
  'The author cannot approve their own rule');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f3', 'aal2');
SELECT public.platform_approve_commission_rule(:'rule1', 'Second owner');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT (public.platform_save_commission_rule('{"name":"Overlap","kind":"fixed","fixedMinor":500,"fixedCurrency":"INR","holdDays":0,
  "minPayoutMinor":0,"minPayoutCurrency":"INR","effectiveFrom":"2026-06-01"}', 'Overlap')->>'id') AS rule2 \gset
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f3', 'aal2');
SELECT pg_temp.expect_error(format($$SELECT public.platform_approve_commission_rule(%L, 'overlap')$$, :'rule2'), '23P01',
  'Approved rules for the same scope cannot overlap');
RESET ROLE;
SELECT pg_temp.expect_error(format($$UPDATE billing.commission_rules SET percent_bps = 5000 WHERE id = %L$$, :'rule1'), '42501',
  'Approved rule terms are frozen');
SELECT pg_temp.expect_error(format($$DELETE FROM billing.commission_rules WHERE id = %L$$, :'rule1'), '42501',
  'Approved rules cannot be deleted');

-- ---------------------------------------------------------------- accrual
SELECT pg_temp.checkout('80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000eb') AS chk1 \gset
SELECT pg_temp.checkout('80000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000ec') AS chk2 \gset
SELECT pg_temp.act(NULL, NULL);
SELECT public.billing_apply_provider_event('razorpay', 'evt_ref1', 'checkout_completed', jsonb_build_object('checkoutId', :'chk1',
  'subscriptionId', 'sub_ref_1', 'status', 'active'));
SELECT public.billing_apply_provider_event('razorpay', 'evt_ref2', 'checkout_completed', jsonb_build_object('checkoutId', :'chk2',
  'subscriptionId', 'sub_ref_2', 'status', 'active'));
SELECT (pg_temp.pay('pay_ref_1', 'sub_ref_1', 99900)->>'paymentId') AS pay1 \gset
SELECT pg_temp.ok((SELECT l.amount_minor = 8466 AND l.basis_minor = 84661 AND l.currency = 'INR' AND l.rule_id = :'rule1'
  FROM billing.commission_ledger l JOIN billing.payments p ON p.id = :'pay1' JOIN billing.invoices i ON i.payment_id = p.id
  WHERE l.invoice_id = i.id AND l.entry_type = 'accrual'), 'Commission accrues on the net amount, excluding tax, rounded down');
SELECT pg_temp.pay('pay_ref_1', 'sub_ref_1', 99900);
SELECT pg_temp.ok((SELECT count(*) FROM billing.commission_ledger WHERE entry_type = 'accrual') = 1, 'A replayed payment accrues once');
SELECT pg_temp.ok((SELECT locked_at IS NOT NULL FROM billing.referral_attributions WHERE company_id = '80000000-0000-0000-0000-000000000001'),
  'The first paid invoice locks the attribution');
SELECT pg_temp.expect_error($$UPDATE billing.commission_ledger SET amount_minor = 1$$, '42501', 'Ledger entries cannot be edited');
SELECT pg_temp.expect_error($$DELETE FROM billing.commission_ledger$$, '42501', 'Ledger entries cannot be deleted');

UPDATE billing.referral_attributions SET touched_at = now() - interval '100 days' WHERE company_id = '80000000-0000-0000-0000-000000000002';
SELECT pg_temp.pay('pay_ref_late', 'sub_ref_2', 99900);
SELECT pg_temp.ok((SELECT status = 'ended' FROM billing.referral_attributions WHERE company_id = '80000000-0000-0000-0000-000000000002')
  AND NOT EXISTS (SELECT 1 FROM billing.commission_ledger WHERE company_id = '80000000-0000-0000-0000-000000000002'),
  'No commission when the first payment comes after the attribution window');

SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000eb', 'aal1');
SELECT pg_temp.ok((public.billing_record_referral('80000000-0000-0000-0000-000000000001', :'code1', :'disclosure', NULL)->>'result')
  = 'already_attributed', 'A locked attribution does not move');
RESET ROLE;

-- ---------------------------------------------------------------- refunds reverse commission
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT (public.platform_request_refund(:'pay1', 49950, 'Half refund')->>'refundId') AS refund1 \gset
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f3', 'aal2');
SELECT public.platform_decide_refund(:'refund1', true, 'Approved');
RESET ROLE;
SELECT pg_temp.act(NULL, NULL);
SELECT public.billing_refund_submitted(:'refund1', 'rfnd_ref_1', 'succeeded', NULL);
SELECT pg_temp.ok((SELECT sum(amount_minor) FROM billing.commission_ledger WHERE entry_type = 'reversal') = -4233,
  'A half refund reverses half the commission');
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT (public.platform_request_refund(:'pay1', 49950, 'Rest refunded')->>'refundId') AS refund2 \gset
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f3', 'aal2');
SELECT public.platform_decide_refund(:'refund2', true, 'Approved');
RESET ROLE;
SELECT pg_temp.act(NULL, NULL);
SELECT public.billing_refund_submitted(:'refund2', 'rfnd_ref_2', 'succeeded', NULL);
SELECT pg_temp.ok((SELECT sum(amount_minor) FROM billing.commission_ledger WHERE company_id = '80000000-0000-0000-0000-000000000001') = 0,
  'A full refund reverses exactly what accrued');
SELECT pg_temp.pay('pay_ref_3', 'sub_ref_1', 99900);
SELECT pg_temp.ok((SELECT count(*) FROM billing.commission_ledger WHERE entry_type = 'accrual') = 2,
  'Later invoices within the duration accrue');

-- ---------------------------------------------------------------- payouts
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT pg_temp.expect_error(format($$SELECT public.platform_request_partner_payout(%L, 'INR', 'pay')$$, :'partner'), '42501',
  'Payouts are disabled by default');
SELECT (public.platform_request_partner_program_change('{"payoutsEnabled": true, "regulatoryReviewReference": "TEST-REVIEW-1"}',
  'Test enable')->>'id') AS change2 \gset
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f3', 'aal2');
SELECT public.platform_decide_partner_program_change(:'change2', true, 'Second owner');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f1', 'aal2');
SELECT pg_temp.expect_error(format($$SELECT public.platform_request_partner_payout(%L, 'INR', 'own')$$, :'partner'), '42501',
  'Partner members cannot request their own payout');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT pg_temp.expect_error(format($$SELECT public.platform_request_partner_payout(%L, 'USD', 'pay')$$, :'partner'), 'P0001',
  'Payouts follow the rule''s minimum payout currency');
SELECT (public.platform_request_partner_payout(:'partner', 'INR', 'Monthly payout')->>'id') AS payout1 \gset
SELECT pg_temp.expect_error(format($$SELECT public.platform_request_partner_payout(%L, 'INR', 'again')$$, :'partner'), 'P0001',
  'Requested amounts leave the available balance');
SELECT pg_temp.expect_error(format($$SELECT public.platform_decide_partner_payout(%L, 'approve', NULL, 'self')$$, :'payout1'), '42501',
  'The requester cannot approve a payout');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f3', 'aal2');
SELECT public.platform_decide_partner_payout(:'payout1', 'approve', NULL, 'Second owner');
SELECT pg_temp.expect_error(format($$SELECT public.platform_decide_partner_payout(%L, 'mark_paid', NULL, 'paid')$$, :'payout1'), '22023',
  'Marking paid needs the manual transfer reference');
SELECT public.platform_decide_partner_payout(:'payout1', 'mark_paid', 'NEFT-TEST-0001', 'Transferred manually');
SELECT pg_temp.expect_error(format($$SELECT public.platform_decide_partner_payout(%L, 'cancel', NULL, 'late')$$, :'payout1'), '22023',
  'Paid payouts cannot be cancelled');
RESET ROLE;
SELECT pg_temp.ok((SELECT amount_minor = 8466 AND status = 'paid' AND payment_reference = 'NEFT-TEST-0001'
  FROM billing.partner_payouts WHERE id = :'payout1'), 'The payout is a manual record with its reference');

SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000ea', 'aal1');
SELECT pg_temp.ok((SELECT (b->>'availableMinor')::int = 0 AND (b->>'paidOutMinor')::int = 8466
  FROM (SELECT public.billing_partner_portal()->'partners'->0->'balances'->0 AS b) x), 'The partner sees the paid-out balance');
SELECT pg_temp.ok((SELECT jsonb_array_length(p->'referrals') = 2 AND p->>'role' = 'admin'
  FROM (SELECT public.billing_partner_portal()->'partners'->0 AS p) x), 'The partner sees their referrals');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000eb', 'aal1');
SELECT pg_temp.ok(jsonb_array_length(public.billing_partner_portal()->'partners') = 0, 'Customers see no partner data');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT pg_temp.expect_error(format($$SELECT public.platform_adjust_partner_commission(%L, NULL, 'INR', 100, 'short')$$, :'partner'),
  '22023', 'Adjustments need an explanation');
SELECT public.platform_adjust_partner_commission(:'partner', NULL, 'INR', -100, 'Chargeback CB-TEST-1 on a referred payment');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*) FROM public.platform_billing_audit WHERE action IN ('commission.accrued', 'commission.reversed',
  'referral.recorded', 'partner.applied')) >= 6, 'Partner activity is audited');
