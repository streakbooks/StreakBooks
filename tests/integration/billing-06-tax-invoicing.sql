-- Billing phase 6 assertions: sellers, numbering, tax rules, invoices, credit notes and refunds.
-- Runs last on the same database. Statements run as the database owner stand for the server's
-- service-role calls. Tax values here are synthetic test data, not tax advice.
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
CREATE FUNCTION pg_temp.pay(_provider text, _payment jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.billing_record_provider_payment(_provider, 'test', _payment);
$$;
SELECT pg_temp.act(NULL, NULL);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000d4', 'tax-owner@example.test'),
  ('00000000-0000-0000-0000-0000000000d5', 'tax-staff@example.test');
INSERT INTO public.companies (id, name, created_by, country_code, base_currency)
  VALUES ('50000000-0000-0000-0000-000000000001', 'Tax India', '00000000-0000-0000-0000-0000000000d4', 'IN', 'INR');
INSERT INTO public.company_members (company_id, user_id, role, status) VALUES
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d4', 'owner', 'active'),
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d5', 'staff', 'active');

-- ---------------------------------------------------------------- tax arithmetic
SELECT pg_temp.ok(billing.inclusive_tax(99900, 1800) = 15239 AND billing.exclusive_tax(1000, 1800) = 180
  AND billing.inclusive_tax(100, 0) = 0 AND billing.inclusive_tax(1, 1800) = 0, 'Tax is split or added with one half-up rounding');

-- ---------------------------------------------------------------- readiness and sellers
SELECT pg_temp.ok(billing.country_readiness('JP') @> ARRAY['no active seller entity serves this country',
  'no approved tax rule is in force'], 'Readiness lists what is missing');
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT pg_temp.expect_error($$SELECT public.platform_set_country_billing('JP', true, 'early')$$, 'P0001',
  'A country cannot open without seller, numbering and tax rule');
SELECT public.platform_save_seller_entity(NULL, jsonb_build_object('legalName', 'Synthetic Seller India', 'country', 'IN',
  'line1', '1 Example Road', 'city', 'Mumbai', 'region', 'MH', 'servesCountries', jsonb_build_array('IN'),
  'taxRegistrations', jsonb_build_array(jsonb_build_object('scheme', 'GSTIN', 'number', '27ABCDE1234F1Z5'))), 'Seller')->>'id' AS seller_in \gset
SELECT public.platform_save_seller_entity(NULL, jsonb_build_object('legalName', 'Synthetic Seller Global', 'country', 'GB',
  'line1', '2 Example Street', 'city', 'London', 'isDefault', true), 'Default seller')->>'id' AS seller_gb \gset
SELECT public.platform_save_seller_entity(NULL, jsonb_build_object('legalName', 'Second Default', 'country', 'US',
  'line1', '3 Example Ave', 'city', 'Austin', 'isDefault', true), 'Second default')->>'id' AS seller_us \gset
SELECT pg_temp.expect_error($$SELECT public.platform_save_seller_entity(NULL, '{"legalName":"X","country":"IN"}', 'missing address')$$,
  '22023', 'A seller needs an address');
SELECT pg_temp.expect_error(format($$SELECT public.platform_set_seller_status(%L, 'active', 'self')$$, :'seller_in'), '42501',
  'The creator cannot activate their own seller');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f1', 'aal2');
SELECT pg_temp.expect_error(format($$SELECT public.platform_set_seller_status(%L, 'active', 'finance')$$, :'seller_in'), '42501',
  'Finance staff cannot activate a seller');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f3', 'aal2');
SELECT public.platform_set_seller_status(:'seller_in', 'active', 'Second owner');
SELECT public.platform_set_seller_status(:'seller_gb', 'active', 'Second owner');
SELECT pg_temp.expect_error(format($$SELECT public.platform_set_seller_status(%L, 'active', 'two defaults')$$, :'seller_us'), '22023',
  'Only one active default seller');
RESET ROLE;
SELECT pg_temp.ok((billing.seller_for_country('IN')).id = :'seller_in' AND (billing.seller_for_country('FR')).id = :'seller_gb',
  'A country seller wins over the default seller');

-- ---------------------------------------------------------------- numbering
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT pg_temp.expect_error(format($$SELECT public.platform_create_invoice_series(%L, 'invoice', 'WAYTOOLONGPX', 6, 'long')$$, :'seller_in'),
  '22023', 'Document numbers must fit in 16 characters');
SELECT public.platform_create_invoice_series(:'seller_in', 'invoice', 'TS/IN/', 6, 'Invoices')->>'id' AS series_in \gset
SELECT public.platform_create_invoice_series(:'seller_in', 'credit_note', 'TC/IN/', 6, 'Credit notes');
SELECT public.platform_create_invoice_series(:'seller_gb', 'invoice', 'TS/GL/', 6, 'Invoices');
SELECT public.platform_create_invoice_series(:'seller_gb', 'credit_note', 'TC/GL/', 6, 'Credit notes');
RESET ROLE;
SELECT pg_temp.expect_error(format($$UPDATE billing.invoice_series SET next_number = 0 WHERE id = %L$$, :'series_in'), '55000',
  'A series cannot be rewound');
SELECT pg_temp.expect_error(format($$UPDATE billing.invoice_series SET prefix = 'XX/' WHERE id = %L$$, :'series_in'), '55000',
  'A series prefix cannot change');

-- ---------------------------------------------------------------- tax rules
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT pg_temp.expect_error($$SELECT public.platform_draft_tax_rule('{"country":"IN","label":"GST","rateBps":500,"priceMode":"inclusive",
  "treatment":"exempt","basis":"test","effectiveFrom":"2026-01-01"}', 'bad')$$, '22023', 'Non-standard treatments carry no rate');
SELECT public.platform_draft_tax_rule('{"country":"IN","customerType":"ANY","label":"GST","rateBps":1800,"priceMode":"inclusive",
  "basis":"Synthetic test rule","effectiveFrom":"2026-01-01"}', 'India rule')->>'id' AS rule_in \gset
SELECT public.platform_draft_tax_rule('{"country":"IN","customerType":"B2B","label":"GST","rateBps":0,"priceMode":"inclusive",
  "treatment":"zero_rated","invoiceNote":"Synthetic zero-rated note","basis":"Synthetic test rule","effectiveFrom":"2026-01-01"}',
  'B2B rule')->>'id' AS rule_in_b2b \gset
SELECT public.platform_draft_tax_rule('{"country":"IN","customerType":"ANY","label":"GST","rateBps":1200,"priceMode":"inclusive",
  "basis":"Overlap","effectiveFrom":"2026-06-01"}', 'Overlap')->>'id' AS rule_overlap \gset
SELECT public.platform_draft_tax_rule('{"country":"GB","customerType":"ANY","label":"VAT","rateBps":2000,"priceMode":"exclusive",
  "basis":"Synthetic test rule","effectiveFrom":"2026-01-01"}', 'GB rule')->>'id' AS rule_gb \gset
SELECT pg_temp.expect_error(format($$SELECT public.platform_approve_tax_rule(%L, 'self')$$, :'rule_in'), '42501',
  'The drafter cannot approve a tax rule');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f1', 'aal2');
SELECT pg_temp.expect_error(format($$SELECT public.platform_approve_tax_rule(%L, 'finance')$$, :'rule_in'), '42501',
  'Finance staff cannot approve a tax rule');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f3', 'aal2');
SELECT public.platform_approve_tax_rule(:'rule_in', 'Second owner');
SELECT public.platform_approve_tax_rule(:'rule_in_b2b', 'Second owner');
SELECT public.platform_approve_tax_rule(:'rule_gb', 'Second owner');
SELECT pg_temp.expect_error(format($$SELECT public.platform_approve_tax_rule(%L, 'overlap')$$, :'rule_overlap'), '22023',
  'Overlapping approved rules are refused');
RESET ROLE;
SELECT pg_temp.expect_error(format($$UPDATE billing.tax_rules SET rate_bps = 500 WHERE id = %L$$, :'rule_in'), '55000',
  'An approved tax rule cannot change');
SELECT pg_temp.ok((billing.resolve_tax_rule('IN', NULL, true, current_date)).id = :'rule_in_b2b'
  AND (billing.resolve_tax_rule('IN', NULL, false, current_date)).id = :'rule_in'
  AND (billing.resolve_tax_rule('IN', NULL, false, '2025-12-31')).id IS NULL, 'The most specific rule in force applies');
SELECT pg_temp.ok(billing.country_readiness('IN') = ARRAY[]::text[] AND billing.country_readiness('GB') = ARRAY[]::text[],
  'India (inclusive, Razorpay) and the UK (exclusive, Stripe) are ready');
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT public.platform_draft_tax_rule('{"country":"IN","customerType":"B2C","label":"GST","rateBps":1800,"priceMode":"exclusive",
  "basis":"Exclusive test","effectiveFrom":"2026-01-01"}', 'Exclusive')->>'id' AS rule_ex \gset
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f3', 'aal2');
SELECT public.platform_approve_tax_rule(:'rule_ex', 'Second owner');
RESET ROLE;
SELECT pg_temp.ok(billing.country_readiness('IN') @> ARRAY['Razorpay cannot add tax to a price, so tax for this country must be price-inclusive'],
  'Razorpay countries need price-inclusive tax');
SET ROLE authenticated;
SELECT public.platform_retire_tax_rule(:'rule_ex', 'Remove exclusive');
RESET ROLE;

-- ---------------------------------------------------------------- checkout price with tax
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000d4', 'aal1');
SELECT pg_temp.ok((SELECT (r->>'totalMinor')::int = 99900 AND r->'tax'->>'label' = 'GST' AND (r->'tax'->>'taxMinor')::int = 15239
  AND r->'tax'->>'mode' = 'inclusive' FROM (SELECT public.billing_checkout_price('50000000-0000-0000-0000-000000000001', 'pro', 'month') AS r) x),
  'The checkout price shows the tax included');
RESET ROLE;

-- ---------------------------------------------------------------- invoices
INSERT INTO public.billing_checkouts (company_id, plan_code, billing_interval, provider, currency, unit_amount_minor, plan_price_id, country_code, mode)
SELECT '50000000-0000-0000-0000-000000000001', 'pro', 'month', 'razorpay', 'INR', 99900, p.id, 'IN', 'test'
  FROM public.plan_prices p JOIN public.plan_versions v ON v.id = p.version_id
 WHERE v.plan_code = 'pro' AND v.status = 'published' AND v.price_book AND p.country_code = 'IN' AND p.billing_interval = 'month'
RETURNING id AS checkout_tax \gset
SELECT public.billing_apply_provider_event('razorpay', 'evt_tax_1', 'checkout_completed', jsonb_build_object('checkoutId', :'checkout_tax',
  'subscriptionId', 'sub_tax_in', 'status', 'active', 'periodEnd', now() + interval '30 days'));
SELECT pg_temp.pay('razorpay', jsonb_build_object('paymentId', 'pay_t1', 'subscriptionId', 'sub_tax_in', 'amountMinor', 99900,
  'currency', 'inr', 'method', 'upi', 'periodStart', now(), 'periodEnd', now() + interval '30 days')) AS first \gset
SELECT pg_temp.ok((:'first'::jsonb)->>'result' = 'issued' AND (:'first'::jsonb)->>'number' = 'TS/IN/000001', 'A payment issues the first invoice');
SELECT pg_temp.ok((SELECT subtotal_minor = 84661 AND tax_minor = 15239 AND total_minor = 99900 AND customer_type = 'B2C'
  AND seller->>'legalName' = 'Synthetic Seller India' AND customer->>'name' IS NOT NULL
  FROM billing.invoices WHERE id = ((:'first'::jsonb)->>'invoiceId')::uuid), 'The invoice splits the included tax and snapshots both parties');
SELECT pg_temp.ok((pg_temp.pay('razorpay', jsonb_build_object('paymentId', 'pay_t1', 'subscriptionId', 'sub_tax_in', 'amountMinor', 99900,
  'currency', 'INR'))->>'result') = 'exists', 'A repeated payment does not issue a second invoice');
SELECT pg_temp.ok((pg_temp.pay('razorpay', jsonb_build_object('paymentId', 'pay_t2', 'subscriptionId', 'sub_tax_in', 'amountMinor', 99900,
  'currency', 'INR'))->>'number') = 'TS/IN/000002', 'Numbering is gapless');
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000d4', 'aal1');
SELECT pg_temp.expect_error($$SELECT public.billing_set_tax_id((SELECT gen_random_uuid()), 'GSTIN', '27ABCDE1234F1Z5')$$, '42501',
  'Only account managers can set a tax ID');
RESET ROLE;
SELECT billing_account_id AS acct_tax FROM billing.billing_account_companies WHERE company_id = '50000000-0000-0000-0000-000000000001' \gset
SET ROLE authenticated;
SELECT pg_temp.expect_error(format($$SELECT public.billing_set_tax_id(%L, 'GSTIN', 'NOTAGSTIN')$$, :'acct_tax'), '22023',
  'GSTINs are checked for shape');
SELECT public.billing_set_tax_id(:'acct_tax', 'GSTIN', '27abcde1234f1z5');
RESET ROLE;
SELECT pg_temp.pay('razorpay', jsonb_build_object('paymentId', 'pay_t3', 'subscriptionId', 'sub_tax_in',
  'amountMinor', 99900, 'currency', 'INR'))->>'invoiceId' AS b2b_invoice \gset
SELECT pg_temp.ok((SELECT customer_type = 'B2B' AND tax_minor = 0 AND tax->>'treatment' = 'zero_rated'
  AND tax->>'note' = 'Synthetic zero-rated note' AND customer->>'taxId' = '27ABCDE1234F1Z5'
  FROM billing.invoices WHERE id = :'b2b_invoice'), 'A business customer gets the B2B rule and its note');
SELECT pg_temp.ok((pg_temp.pay('razorpay', jsonb_build_object('paymentId', 'pay_t4', 'subscriptionId', 'sub_tax_in', 'amountMinor', 99900,
  'currency', 'INR', 'taxMinor', 100))->>'result') = 'pending', 'Tax charged against a zero-rated rule is held for review');
SELECT pg_temp.ok((pg_temp.pay('stripe', jsonb_build_object('paymentId', 'pi_gb_1', 'subscriptionId', 'sub_gb', 'amountMinor', 2400,
  'currency', 'USD'))->>'reason') = 'The approved rule adds tax but the provider did not charge it', 'Exclusive tax must come from the provider');
SELECT pg_temp.pay('stripe', jsonb_build_object('paymentId', 'pi_gb_2', 'subscriptionId', 'sub_gb', 'amountMinor', 2400,
  'currency', 'USD', 'taxMinor', 400))->>'invoiceId' AS gb_invoice \gset
SELECT pg_temp.ok((SELECT subtotal_minor = 2000 AND tax_minor = 400 AND tax->>'mode' = 'exclusive' AND seller->>'legalName' = 'Synthetic Seller Global'
  FROM billing.invoices WHERE id = :'gb_invoice'), 'Exclusive tax reported by Stripe is used as charged');
SELECT pg_temp.ok((SELECT count(*) FROM billing.payments WHERE invoice_issue_error IS NOT NULL) = 2, 'Unissued payments keep their reason');

-- ---------------------------------------------------------------- immutability
SELECT pg_temp.expect_error(format($$UPDATE billing.invoices SET total_minor = 1 WHERE id = %L$$, (:'first'::jsonb)->>'invoiceId'), '55000',
  'An issued invoice cannot change');
SELECT pg_temp.expect_error(format($$DELETE FROM billing.invoices WHERE id = %L$$, (:'first'::jsonb)->>'invoiceId'), '55000',
  'An issued invoice cannot be deleted');
SELECT pg_temp.expect_error($$UPDATE billing.invoice_lines SET description = 'edited'$$, '55000', 'Invoice lines cannot change');
SELECT pg_temp.expect_error($$UPDATE billing.payments SET amount_minor = 1$$, '55000', 'A recorded payment cannot change');
SELECT public.billing_record_document_pdf('invoice', ((:'first'::jsonb)->>'invoiceId')::uuid, 'invoices/a.pdf', 'aa');
SELECT pg_temp.ok(public.billing_record_document_pdf('invoice', ((:'first'::jsonb)->>'invoiceId')::uuid, 'invoices/b.pdf', 'bb') = 'invoices/a.pdf',
  'The stored PDF is kept once recorded');

-- ---------------------------------------------------------------- customer documents
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000d4', 'aal1');
SELECT pg_temp.ok(jsonb_array_length(public.billing_documents('50000000-0000-0000-0000-000000000001')->'invoices') = 3,
  'The owner sees the organisation''s invoices');
SELECT pg_temp.ok((public.billing_document('invoice', ((:'first'::jsonb)->>'invoiceId')::uuid)->'lines'->0->>'description') = 'StreakBooks Pro subscription',
  'The owner can open an invoice');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000d5', 'aal1');
SELECT pg_temp.expect_error($$SELECT public.billing_documents('50000000-0000-0000-0000-000000000001')$$, '42501', 'Staff cannot see invoices');
SELECT pg_temp.expect_error(format($$SELECT public.billing_document('invoice', %L)$$, (:'first'::jsonb)->>'invoiceId'), '42501',
  'Staff cannot open an invoice');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f1', 'aal2');
SELECT pg_temp.ok(public.billing_document('invoice', ((:'first'::jsonb)->>'invoiceId')::uuid) ? 'seller', 'Platform billing staff can open invoices');

-- ---------------------------------------------------------------- refunds
RESET ROLE;
SELECT id AS pay_t1 FROM billing.payments WHERE provider_payment_id = 'pay_t1' \gset
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT pg_temp.expect_error(format($$SELECT public.platform_request_refund(%L, 100000, 'too much')$$, :'pay_t1'), '22023',
  'A refund cannot exceed the payment');
SELECT public.platform_request_refund(:'pay_t1', 50000, 'Synthetic goodwill refund')->>'refundId' AS refund_ok \gset
SELECT pg_temp.expect_error(format($$SELECT public.platform_request_refund(%L, 50000, 'over')$$, :'pay_t1'), '22023',
  'Open requests count against the refundable amount');
SELECT pg_temp.expect_error(format($$SELECT public.platform_decide_refund(%L, true, 'self')$$, :'refund_ok'), '42501',
  'The requester cannot approve their own refund');
SELECT pg_temp.expect_error(format($$SELECT public.platform_refund_for_execution(%L)$$, :'refund_ok'), '22023',
  'An unapproved refund cannot be sent');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f1', 'aal2');
SELECT pg_temp.expect_error(format($$SELECT public.platform_decide_refund(%L, true, 'finance')$$, :'refund_ok'), '42501',
  'Finance staff cannot approve refunds');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f3', 'aal2');
SELECT public.platform_decide_refund(:'refund_ok', true, 'Second owner');
SELECT pg_temp.ok((public.platform_refund_for_execution(:'refund_ok')->>'providerPaymentId') = 'pay_t1', 'An approved refund can be sent to the provider');
RESET ROLE;
SELECT public.billing_refund_submitted(:'refund_ok', 'rfnd_t1', 'pending', NULL);
SELECT pg_temp.ok((SELECT status FROM billing.refunds WHERE id = :'refund_ok') = 'submitted', 'A pending provider refund waits');
SELECT pg_temp.ok((public.billing_refund_result('razorpay', 'rfnd_t1', 'succeeded', NULL)->>'number') = 'TC/IN/000001',
  'A completed refund issues a credit note');
SELECT pg_temp.ok((SELECT subtotal_minor = 42373 AND tax_minor = 7627 AND total_minor = 50000 FROM billing.credit_notes WHERE refund_id = :'refund_ok')
  AND (SELECT status = 'partially_credited' AND credited_minor = 50000 FROM billing.invoices WHERE id = ((:'first'::jsonb)->>'invoiceId')::uuid)
  AND (SELECT status = 'partially_refunded' AND refunded_minor = 50000 FROM billing.payments WHERE id = :'pay_t1'),
  'The credit note carries proportional tax and the invoice and payment are updated');
SELECT pg_temp.ok((public.billing_refund_result('razorpay', 'rfnd_t1', 'succeeded', NULL)->>'reason') = 'refund already final',
  'A repeated refund webhook changes nothing');
SELECT pg_temp.expect_error($$UPDATE billing.credit_notes SET total_minor = 1$$, '55000', 'A credit note cannot change');
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT public.platform_request_refund(:'pay_t1', 49900, 'Second refund')->>'refundId' AS refund_fail \gset
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f3', 'aal2');
SELECT public.platform_decide_refund(:'refund_fail', true, 'Second owner');
RESET ROLE;
SELECT public.billing_refund_submitted(:'refund_fail', NULL, 'failed', 'Provider declined');
SELECT pg_temp.ok((SELECT status = 'failed' FROM billing.refunds WHERE id = :'refund_fail')
  AND (SELECT refunded_minor = 50000 FROM billing.payments WHERE id = :'pay_t1'), 'A failed refund leaves the payment unchanged');
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f2', 'aal2');
SELECT pg_temp.ok((public.platform_request_refund(:'pay_t1', 49900, 'Retry refund')->>'status') = 'requested',
  'A failed refund frees the amount for a new request');

-- ---------------------------------------------------------------- service-only and audit
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000d4', 'aal1');
SELECT pg_temp.expect_error($$SELECT public.billing_record_provider_payment('razorpay', 'test', '{}')$$, '42501', 'Clients cannot record payments');
SELECT pg_temp.expect_error($$SELECT public.billing_refund_result('razorpay', 'x', 'succeeded', NULL)$$, '42501', 'Clients cannot complete refunds');
SELECT pg_temp.expect_error($$SELECT public.billing_record_document_pdf('invoice', gen_random_uuid(), 'x', 'y')$$, '42501',
  'Clients cannot record document files');
SELECT pg_temp.expect_error($$SELECT public.platform_finance_overview()$$, '42501', 'Customers cannot see platform finance');
RESET ROLE;
SET ROLE anon;
SELECT pg_temp.expect_error($$SELECT public.billing_documents('50000000-0000-0000-0000-000000000001')$$, '42501', 'Anonymous callers see nothing');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*) FROM public.platform_billing_audit WHERE action IN ('invoice.issued', 'refund.succeeded')) >= 5,
  'Invoices and refunds are in the billing audit');
