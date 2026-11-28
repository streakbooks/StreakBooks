-- End-to-end nonprofit fund accounting against the disposable fixture.
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001"}', false);

DO $$
DECLARE
  c UUID := '20000000-0000-4000-8000-000000000001';
  gen UUID;
  relief UUID;
  empty_fund UUID;
  donor UUID;
  other_donor UUID;
  donation JSONB;
  replay JSONB;
  grant_id UUID;
  pledge_id UUID;
  expense JSONB;
  journal UUID;
  beneficiary_id UUID;
  disbursement JSONB;
  restricted_credits BIGINT;
  liability_credits BIGINT;
  statement JSONB;
  line JSONB;
  donor_statement JSONB;
  currency JSONB;
  recorded JSONB;
  member_a UUID;
  member_b UUID;
  household_id UUID;
  building UUID;
  congregation_id UUID;
  batch JSONB;
  family JSONB;
  journal_count BIGINT;
  event_id UUID;
  volunteer_id UUID;
BEGIN
  PERFORM public.nonprofit_upsert_settings(c, jsonb_build_object(
    'enabled', true,
    'accounting_framework', 'configurable',
    'country_code', 'US',
    'enforce_segregation', true,
    'account_map', jsonb_build_object(
      'bank', '40000000-0000-4000-8000-000000000001',
      'contribution_revenue', '40000000-0000-4000-8000-000000000002',
      'restricted_contribution_revenue', '40000000-0000-4000-8000-000000000003',
      'contributions_receivable', '40000000-0000-4000-8000-000000000004',
      'refundable_advance', '40000000-0000-4000-8000-000000000005',
      'grant_revenue', '40000000-0000-4000-8000-000000000006',
      'programme_expense', '40000000-0000-4000-8000-000000000007',
      'administration_expense', '40000000-0000-4000-8000-000000000008',
      'fundraising_expense', '40000000-0000-4000-8000-000000000009',
      'inventory', '40000000-0000-4000-8000-000000000010',
      'fixed_asset', '40000000-0000-4000-8000-000000000011',
      'accumulated_depreciation', '40000000-0000-4000-8000-000000000012',
      'depreciation_expense', '40000000-0000-4000-8000-000000000013',
      'payroll_expense', '40000000-0000-4000-8000-000000000014',
      'payroll_payable', '40000000-0000-4000-8000-000000000015',
      'due_to', '40000000-0000-4000-8000-000000000016',
      'due_from', '40000000-0000-4000-8000-000000000017',
      'transfer_out', '40000000-0000-4000-8000-000000000018',
      'transfer_in', '40000000-0000-4000-8000-000000000019',
      'restriction_release_debit', '40000000-0000-4000-8000-000000000020',
      'restriction_release_credit', '40000000-0000-4000-8000-000000000021',
      'investment_income', '40000000-0000-4000-8000-000000000022',
      'pledge_impairment', '40000000-0000-4000-8000-000000000023',
      'processing_fee', '40000000-0000-4000-8000-000000000024',
      'fx_gain', '40000000-0000-4000-8000-000000000025',
      'fx_loss', '40000000-0000-4000-8000-000000000026',
      'net_assets_with_restriction', '40000000-0000-4000-8000-000000000027',
      'net_assets_without_restriction', '40000000-0000-4000-8000-000000000028',
      'accounts_payable', '40000000-0000-4000-8000-000000000029'
    )
  ));

  gen := (public.nonprofit_create_fund(c, '{"code":"GEN","name":"General","classification":"unrestricted","restriction":"unrestricted","category":"general"}'::jsonb)->>'id')::UUID;
  relief := (public.nonprofit_create_fund(c, '{"code":"RELIEF","name":"Relief","classification":"donor_restricted","restriction":"donor_restricted","category":"emergency"}'::jsonb)->>'id')::UUID;
  empty_fund := (public.nonprofit_create_fund(c, '{"code":"EMPTY","name":"Empty","classification":"unrestricted","restriction":"unrestricted","category":"general"}'::jsonb)->>'id')::UUID;
  PERFORM public.test_assert((public.nonprofit_close_fund(c, empty_fund)->>'status') = 'closed', 'zero-balance fund closes');

  donor := (public.nonprofit_create_donor(c, '{"donor_kind":"individual","display_name":"Asha Donor","email":"asha@example.org","consent_status":"granted"}'::jsonb)->>'id')::UUID;
  other_donor := (public.nonprofit_create_donor(c, '{"donor_kind":"corporate","display_name":"Other Donor","email":"other@example.org"}'::jsonb)->>'id')::UUID;

  donation := public.nonprofit_submit_donation(c, jsonb_build_object(
    'donor_id', donor, 'donated_on', '2026-11-01', 'currency_code', 'USD', 'fx_rate_to_base', 1,
    'amount_minor', 10000, 'fee_minor', 300, 'method', 'card', 'conditional', false,
    'idempotency_key', 'split-1', 'allocations', jsonb_build_array(
      jsonb_build_object('fund_id', gen, 'amount_minor', 6000),
      jsonb_build_object('fund_id', relief, 'amount_minor', 4000)
    )
  ));
  PERFORM public.test_assert((donation->>'status') = 'posted', 'split donation posts');
  replay := public.nonprofit_submit_donation(c, jsonb_build_object(
    'donor_id', donor, 'donated_on', '2026-11-01', 'currency_code', 'USD',
    'amount_minor', 10000, 'fee_minor', 300, 'idempotency_key', 'split-1',
    'allocations', jsonb_build_array(
      jsonb_build_object('fund_id', gen, 'amount_minor', 6000),
      jsonb_build_object('fund_id', relief, 'amount_minor', 4000)
    )
  ));
  PERFORM public.test_assert((replay->>'replayed')::BOOLEAN AND replay->>'id' = donation->>'id', 'duplicate donation idempotency returns the original');
  PERFORM public.test_assert((SELECT count(*) FROM public.journals WHERE company_id = c AND source_id = (donation->>'id')::UUID) = 1, 'duplicate donation does not post twice');

  SELECT COALESCE(SUM(jl.credit_minor), 0) INTO restricted_credits
  FROM public.journal_lines jl
  JOIN public.nonprofit_fund_tags t ON t.journal_line_id = jl.id
  WHERE jl.journal_id = (donation->>'journal_id')::UUID
    AND jl.account_id = '40000000-0000-4000-8000-000000000003'
    AND t.fund_id = relief;
  PERFORM public.test_assert(restricted_credits = 4000, 'restricted unconditional donation credits contribution revenue');
  SELECT COALESCE(SUM(jl.credit_minor), 0) INTO liability_credits
  FROM public.journal_lines jl
  WHERE jl.journal_id = (donation->>'journal_id')::UUID
    AND jl.account_id = '40000000-0000-4000-8000-000000000005';
  PERFORM public.test_assert(liability_credits = 0, 'restricted unconditional donation is not a liability');
  PERFORM public.test_assert((
    SELECT bool_and(debits = credits) FROM (
      SELECT t.fund_id, SUM(jl.debit_minor) AS debits, SUM(jl.credit_minor) AS credits
      FROM public.nonprofit_fund_tags t
      JOIN public.journal_lines jl ON jl.id = t.journal_line_id
      WHERE t.journal_id = (donation->>'journal_id')::UUID
      GROUP BY t.fund_id
    ) funds
  ), 'each fund in the split donation balances');

  PERFORM public.nonprofit_submit_donation(c, jsonb_build_object(
    'donor_id', donor, 'donated_on', '2026-11-02', 'currency_code', 'EUR', 'fx_rate_to_base', 1.25,
    'amount_minor', 8000, 'method', 'bank_transfer', 'idempotency_key', 'fx-1',
    'allocations', jsonb_build_array(jsonb_build_object('fund_id', gen, 'amount_minor', 8000))
  ));
  PERFORM public.test_assert(EXISTS (
    SELECT 1 FROM public.journals WHERE company_id = c AND currency_code = 'EUR' AND fx_rate_to_base = 1.25
  ), 'foreign currency donation keeps the exchange rate');

  PERFORM public.test_assert((public.nonprofit_submit_donation(c, jsonb_build_object(
    'donor_id', donor, 'donated_on', '2026-11-03', 'currency_code', 'USD', 'amount_minor', 500,
    'in_kind', 'services', 'method', 'in_kind', 'idempotency_key', 'services-1',
    'allocations', jsonb_build_array(jsonb_build_object('fund_id', gen, 'amount_minor', 500))
  ))->>'status') = 'not_recognised', 'donated services are not recognised');

  grant_id := (public.nonprofit_create_grant(c, jsonb_build_object(
    'fund_id', relief, 'grantor_name', 'Civic Foundation', 'code', 'CIVIC', 'title', 'Relief grant',
    'grant_kind', 'foundation', 'conditional', true, 'award_minor', 50000, 'currency_code', 'USD',
    'eligible_categories', jsonb_build_array('food')
  ))->>'id')::UUID;
  PERFORM public.nonprofit_receive_grant(c, grant_id, 50000, '2026-11-04');
  PERFORM public.test_assert((
    SELECT recognised_minor = 0 AND received_minor = 50000 FROM public.nonprofit_grants WHERE id = grant_id
  ), 'conditional grant cash is not revenue');
  PERFORM public.test_assert((
    SELECT COALESCE(SUM(CASE WHEN jl.account_id = '40000000-0000-4000-8000-000000000005' THEN jl.credit_minor - jl.debit_minor ELSE 0 END), 0) = 50000
    FROM public.journal_lines jl
    JOIN public.journals j ON j.id = jl.journal_id
    WHERE j.source_id = grant_id
  ), 'conditional grant credit is a refundable advance');

  expense := public.nonprofit_post_expense(c, jsonb_build_object(
    'fund_id', relief, 'grant_id', grant_id, 'spent_on', '2026-11-05', 'amount_minor', 1000,
    'currency_code', 'USD', 'functional_class', 'programme', 'category', 'rent'
  ));
  PERFORM public.test_assert((expense->>'status') = 'rejected' AND expense->>'journal_id' IS NULL, 'ineligible grant expenditure is rejected and not posted');

  PERFORM public.nonprofit_satisfy_grant(c, grant_id);
  PERFORM set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003"}', false);
  BEGIN
    PERFORM public.nonprofit_recognise_grant(c, grant_id, 20000, '2026-11-06');
    RAISE EXCEPTION 'FAIL: recognition without post permission was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM !~* 'Missing permission' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001"}', false);
  BEGIN
    PERFORM public.nonprofit_recognise_grant(c, grant_id, 20000, '2026-11-06');
    RAISE EXCEPTION 'FAIL: segregation allowed the same person to recognise revenue';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM !~* 'cannot recognise' THEN RAISE; END IF;
  END;
  PERFORM public.nonprofit_upsert_settings(c, jsonb_build_object(
    'enabled', true, 'accounting_framework', 'configurable', 'country_code', 'US',
    'enforce_segregation', false,
    'account_map', (SELECT account_map FROM public.nonprofit_settings WHERE company_id = c)
  ));
  PERFORM public.nonprofit_recognise_grant(c, grant_id, 20000, '2026-11-06');
  PERFORM public.test_assert((SELECT recognised_minor = 20000 FROM public.nonprofit_grants WHERE id = grant_id), 'satisfied conditions recognise only the requested amount');

  expense := public.nonprofit_post_expense(c, jsonb_build_object(
    'fund_id', relief, 'grant_id', grant_id, 'spent_on', '2026-11-07', 'amount_minor', 1000,
    'currency_code', 'USD', 'functional_class', 'programme', 'category', 'food'
  ));
  PERFORM public.test_assert((expense->>'status') = 'posted', 'eligible grant expenditure posts');

  PERFORM public.nonprofit_transfer(c, relief, gen, 500, '2026-11-08');
  PERFORM public.nonprofit_release(c, relief, gen, 250, '2026-11-09');

  pledge_id := (public.nonprofit_create_pledge(c, jsonb_build_object(
    'donor_id', donor, 'fund_id', gen, 'pledged_on', '2026-11-10', 'amount_minor', 3000,
    'currency_code', 'USD', 'unconditional', false
  ))->>'id')::UUID;
  PERFORM public.test_assert((SELECT journal_id IS NULL AND status = 'conditional' FROM public.nonprofit_pledges WHERE id = pledge_id), 'conditional pledge is not recognised');
  pledge_id := (public.nonprofit_create_pledge(c, jsonb_build_object(
    'donor_id', donor, 'fund_id', gen, 'pledged_on', '2026-11-11', 'amount_minor', 2000,
    'currency_code', 'USD', 'unconditional', true
  ))->>'id')::UUID;
  PERFORM public.nonprofit_collect_pledge(c, pledge_id, 2000, '2026-11-12');
  PERFORM public.test_assert((SELECT collected_minor = 2000 AND status = 'collected' FROM public.nonprofit_pledges WHERE id = pledge_id), 'pledge collection does not recognise revenue again');

  PERFORM public.nonprofit_refund_donation(c, (donation->>'id')::UUID, '2026-11-13', 150);
  PERFORM public.test_assert((SELECT status = 'refunded' FROM public.nonprofit_donations WHERE id = (donation->>'id')::UUID), 'donation refund and chargeback fee are recorded');

  PERFORM public.test_assert(public.nonprofit_fund_spendable(c, gen, '2026-10-01') = 0, 'spendable as of a date before activity is zero');
  PERFORM public.nonprofit_submit_donation(c, jsonb_build_object(
    'donor_id', donor, 'donated_on', '2026-11-15', 'currency_code', 'USD',
    'amount_minor', 4000, 'in_kind', 'inventory', 'method', 'in_kind', 'idempotency_key', 'stock-1',
    'allocations', jsonb_build_array(jsonb_build_object('fund_id', gen, 'amount_minor', 4000))
  ));
  PERFORM public.nonprofit_submit_donation(c, jsonb_build_object(
    'donor_id', donor, 'donated_on', '2026-11-15', 'currency_code', 'USD',
    'amount_minor', 9000, 'in_kind', 'fixed_asset', 'method', 'in_kind', 'idempotency_key', 'asset-1',
    'allocations', jsonb_build_array(jsonb_build_object('fund_id', gen, 'amount_minor', 9000))
  ));
  PERFORM public.nonprofit_post_movement(c, jsonb_build_object(
    'kind', 'inventory_distribution', 'fund_id', gen, 'amount_minor', 1500,
    'on', '2026-11-16', 'currency_code', 'USD', 'idempotency_key', 'dist-1'
  ));
  BEGIN
    PERFORM public.nonprofit_post_movement(c, jsonb_build_object(
      'kind', 'inventory_distribution', 'fund_id', gen, 'amount_minor', 99999,
      'on', '2026-11-16', 'currency_code', 'USD', 'idempotency_key', 'dist-too-much'
    ));
    RAISE EXCEPTION 'FAIL: inventory distribution above the balance was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM !~* 'Inventory balance' THEN RAISE; END IF;
  END;
  PERFORM public.nonprofit_post_movement(c, jsonb_build_object(
    'kind', 'depreciation', 'fund_id', gen, 'amount_minor', 900,
    'on', '2026-11-16', 'currency_code', 'USD', 'idempotency_key', 'dep-1'
  ));
  BEGIN
    PERFORM public.nonprofit_post_movement(c, jsonb_build_object(
      'kind', 'depreciation', 'fund_id', gen, 'amount_minor', 99999,
      'on', '2026-11-16', 'currency_code', 'USD', 'idempotency_key', 'dep-too-much'
    ));
    RAISE EXCEPTION 'FAIL: depreciation above book value was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM !~* 'book value' THEN RAISE; END IF;
  END;
  PERFORM public.nonprofit_post_movement(c, jsonb_build_object(
    'kind', 'payroll_accrual', 'fund_id', gen, 'amount_minor', 800,
    'on', '2026-11-16', 'currency_code', 'USD', 'idempotency_key', 'pay-accrue'
  ));
  PERFORM public.nonprofit_post_movement(c, jsonb_build_object(
    'kind', 'payroll_payment', 'fund_id', gen, 'amount_minor', 800,
    'on', '2026-11-17', 'currency_code', 'USD', 'idempotency_key', 'pay-settle'
  ));
  BEGIN
    PERFORM public.nonprofit_post_movement(c, jsonb_build_object(
      'kind', 'payroll_payment', 'fund_id', gen, 'amount_minor', 800,
      'on', '2026-11-17', 'currency_code', 'USD', 'idempotency_key', 'pay-again'
    ));
    RAISE EXCEPTION 'FAIL: payroll payment without a payable was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM !~* 'Payroll payable' THEN RAISE; END IF;
  END;
  PERFORM public.nonprofit_post_movement(c, jsonb_build_object(
    'kind', 'investment_income', 'fund_id', gen, 'amount_minor', 250,
    'on', '2026-11-17', 'currency_code', 'USD', 'idempotency_key', 'invest-1'
  ));
  PERFORM public.nonprofit_post_movement(c, jsonb_build_object(
    'kind', 'fx_settlement', 'fund_id', gen, 'difference_minor', -40,
    'on', '2026-11-17', 'currency_code', 'USD', 'idempotency_key', 'fx-loss'
  ));
  pledge_id := (public.nonprofit_create_pledge(c, jsonb_build_object(
    'donor_id', donor, 'fund_id', gen, 'pledged_on', '2026-11-18', 'amount_minor', 5000,
    'currency_code', 'USD', 'unconditional', true
  ))->>'id')::UUID;
  PERFORM public.nonprofit_impair_pledge(c, pledge_id, 1200, '2026-11-18');
  PERFORM public.test_assert((SELECT impaired_minor = 1200 AND status = 'recognised' FROM public.nonprofit_pledges WHERE id = pledge_id), 'partial pledge impairment keeps the remainder recognised');
  BEGIN
    PERFORM public.nonprofit_impair_pledge(c, pledge_id, 99999, '2026-11-18');
    RAISE EXCEPTION 'FAIL: impairment above the outstanding pledge was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM !~* 'Impairment exceeds' THEN RAISE; END IF;
  END;
  PERFORM public.nonprofit_allocate_expense(c, (expense->>'id')::UUID, 'administration', 400, '2026-11-18', 'alloc-1');
  PERFORM public.test_assert((SELECT allocated_minor = 400 FROM public.nonprofit_expenses WHERE id = (expense->>'id')::UUID), 'allocation records the amount moved to another class');
  BEGIN
    PERFORM public.nonprofit_allocate_expense(c, (expense->>'id')::UUID, 'fundraising', 700, '2026-11-18', 'alloc-too-much');
    RAISE EXCEPTION 'FAIL: allocation above the original expense was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM !~* 'Allocation exceeds' THEN RAISE; END IF;
  END;

  PERFORM public.nonprofit_upsert_settings(c, jsonb_build_object(
    'enabled', true, 'accounting_framework', 'configurable', 'country_code', 'US',
    'enforce_segregation', true,
    'account_map', (SELECT account_map FROM public.nonprofit_settings WHERE company_id = c)
  ));
  beneficiary_id := (public.nonprofit_create_record(c, 'beneficiary', '{"display_name":"Eligible Person","eligibility_status":"eligible"}'::jsonb)->>'id')::UUID;
  disbursement := public.nonprofit_request_disbursement(c, jsonb_build_object('beneficiary_id', beneficiary_id, 'fund_id', gen, 'amount_minor', 100));
  PERFORM public.test_assert((disbursement->>'status') = 'draft', 'eligible disbursement waits for a different approver');
  BEGIN
    PERFORM public.nonprofit_decide_disbursement(c, (disbursement->>'id')::UUID, 'posted', '2026-11-19');
    RAISE EXCEPTION 'FAIL: requester approved their own disbursement';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM !~* 'cannot approve' THEN RAISE; END IF;
  END;
  PERFORM public.nonprofit_upsert_settings(c, jsonb_build_object(
    'enabled', true, 'accounting_framework', 'configurable', 'country_code', 'US',
    'enforce_segregation', false,
    'account_map', (SELECT account_map FROM public.nonprofit_settings WHERE company_id = c)
  ));
  PERFORM public.nonprofit_decide_disbursement(c, (disbursement->>'id')::UUID, 'posted', '2026-11-19');
  PERFORM public.test_assert((SELECT status = 'posted' AND journal_id IS NOT NULL FROM public.nonprofit_disbursements WHERE id = (disbursement->>'id')::UUID), 'approved disbursement posts once');
  BEGIN
    PERFORM public.nonprofit_decide_disbursement(c, (disbursement->>'id')::UUID, 'posted', '2026-11-19');
    RAISE EXCEPTION 'FAIL: posted disbursement was approved again';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM !~* 'not awaiting' THEN RAISE; END IF;
  END;
  PERFORM public.test_assert((public.nonprofit_request_disbursement(c, jsonb_build_object(
    'beneficiary_id', (public.nonprofit_create_record(c, 'beneficiary', '{"display_name":"Ineligible Person","eligibility_status":"ineligible"}'::jsonb)->>'id')::UUID,
    'fund_id', gen, 'amount_minor', 50
  ))->>'status') = 'rejected', 'ineligible beneficiary disbursement is rejected without a journal');
  BEGIN
    PERFORM public.nonprofit_decide_disbursement(c, (public.nonprofit_request_disbursement(c, jsonb_build_object('beneficiary_id', beneficiary_id, 'fund_id', gen, 'amount_minor', 999999999))->>'id')::UUID, 'posted', '2026-11-19');
    RAISE EXCEPTION 'FAIL: disbursement above spendable was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM !~* 'Fund does not have' THEN RAISE; END IF;
  END;
  PERFORM public.test_assert(public.nonprofit_workspace(c)->'disbursements' IS NOT NULL, 'authorised user receives disbursement records');

  PERFORM public.test_assert((
    SELECT SUM(debit_minor) = SUM(credit_minor) AND SUM(debit_minor) > 0
    FROM public.journal_lines WHERE company_id = c
  ), 'organisation ledger stays balanced');
  PERFORM public.test_assert((
    SELECT bool_and(debits = credits) FROM (
      SELECT t.fund_id, SUM(jl.debit_minor) debits, SUM(jl.credit_minor) credits
      FROM public.nonprofit_fund_tags t
      JOIN public.journal_lines jl ON jl.id = t.journal_line_id
      WHERE t.company_id = c
      GROUP BY t.fund_id
    ) funds
  ), 'every fund reconciles internally');

  PERFORM public.nonprofit_create_record(c, 'beneficiary', '{"display_name":"Protected Person","eligibility_status":"eligible"}'::jsonb);
  PERFORM public.nonprofit_submit_donation(c, jsonb_build_object(
    'donor_id', other_donor, 'donated_on', '2026-11-14', 'currency_code', 'USD',
    'amount_minor', 111, 'idempotency_key', 'portal-other',
    'allocations', jsonb_build_array(jsonb_build_object('fund_id', gen, 'amount_minor', 111))
  ));
  PERFORM public.nonprofit_grant_portal(c, jsonb_build_object(
    'user_id', '10000000-0000-4000-8000-000000000002', 'portal_role', 'donor', 'donor_id', other_donor
  ));
  PERFORM public.test_assert(jsonb_array_length(public.nonprofit_workspace(c)->'actions') >= 1, 'smart actions include an outstanding pledge');
  PERFORM public.test_assert(public.nonprofit_workspace(c)->'beneficiaries' IS NOT NULL, 'authorised user receives beneficiary records');

  statement := public.nonprofit_fund_statement(c, '2026-10-01', '2026-10-31');
  PERFORM public.test_assert((statement->>'statutory_filing')::BOOLEAN = false, 'fund statement is not a statutory filing');
  PERFORM public.test_assert((statement->>'government_approved')::BOOLEAN = false, 'fund statement is not government approved');
  PERFORM public.test_assert(statement->>'wording' ILIKE '%not a government filing%', 'fund statement says it is not a government filing');
  PERFORM public.test_assert(NOT (statement ? 'beneficiaries'), 'fund statement does not include beneficiary records');
  PERFORM public.test_assert((
    SELECT bool_and((fund->>'opening_net_assets_minor')::BIGINT = 0 AND (fund->>'closing_net_assets_minor')::BIGINT = 0)
    FROM jsonb_array_elements(statement->'funds') fund
  ), 'statement before activity is zero');

  statement := public.nonprofit_fund_statement(c, '2026-11-01', '2026-11-01');
  SELECT value INTO line FROM jsonb_array_elements(statement->'funds') WHERE value->>'code' = 'GEN';
  PERFORM public.test_assert((line->>'support_minor')::BIGINT = 6000, 'general fund support on the split donation day');
  PERFORM public.test_assert((line->>'expenses_minor')::BIGINT = 180, 'general fund processing fee on the split donation day');
  PERFORM public.test_assert((line->>'closing_net_assets_minor')::BIGINT = 5820, 'general fund closing net assets on the split donation day');
  PERFORM public.test_assert((line->>'spendable_minor')::BIGINT = 5820, 'general fund spendable matches cash on the split donation day');
  SELECT value INTO line FROM jsonb_array_elements(statement->'funds') WHERE value->>'code' = 'RELIEF';
  PERFORM public.test_assert((line->>'support_minor')::BIGINT = 4000, 'restricted fund support on the split donation day');
  PERFORM public.test_assert((line->>'expenses_minor')::BIGINT = 120, 'restricted fund processing fee on the split donation day');
  PERFORM public.test_assert((line->>'closing_net_assets_minor')::BIGINT = 3880, 'restricted fund closing net assets on the split donation day');
  SELECT value INTO line FROM jsonb_array_elements(statement->'funds') WHERE value->>'code' = 'EMPTY';
  PERFORM public.test_assert((line->>'closing_net_assets_minor')::BIGINT = 0 AND line->>'status' = 'closed', 'closed fund stays on the historical statement at zero');

  statement := public.nonprofit_fund_statement(c, '2026-11-08', '2026-11-08');
  SELECT value INTO line FROM jsonb_array_elements(statement->'funds') WHERE value->>'code' = 'RELIEF';
  PERFORM public.test_assert((line->>'transfers_minor')::BIGINT = -500, 'source fund transfer reduces net assets');
  SELECT value INTO line FROM jsonb_array_elements(statement->'funds') WHERE value->>'code' = 'GEN';
  PERFORM public.test_assert((line->>'transfers_minor')::BIGINT = 500, 'destination fund transfer increases net assets');

  statement := public.nonprofit_fund_statement(c, '2026-11-09', '2026-11-09');
  SELECT value INTO line FROM jsonb_array_elements(statement->'funds') WHERE value->>'code' = 'RELIEF';
  PERFORM public.test_assert((line->>'releases_minor')::BIGINT = -250, 'restricted fund release reduces net assets');
  SELECT value INTO line FROM jsonb_array_elements(statement->'funds') WHERE value->>'code' = 'GEN';
  PERFORM public.test_assert((line->>'releases_minor')::BIGINT = 250, 'unrestricted fund release increases net assets');

  statement := public.nonprofit_fund_statement(c, '2026-11-01', '2026-11-30');
  PERFORM public.test_assert((
    SELECT bool_and(
      (fund->>'opening_net_assets_minor')::BIGINT
      + (fund->>'support_minor')::BIGINT
      - (fund->>'expenses_minor')::BIGINT
      + (fund->>'transfers_minor')::BIGINT
      + (fund->>'releases_minor')::BIGINT
      + (fund->>'other_equity_minor')::BIGINT
      = (fund->>'closing_net_assets_minor')::BIGINT
    )
    FROM jsonb_array_elements(statement->'funds') fund
  ), 'each fund statement explains the change in net assets');
  PERFORM public.test_assert(
    (statement->'totals'->>'opening_net_assets_minor')::BIGINT
    + (statement->'totals'->>'support_minor')::BIGINT
    - (statement->'totals'->>'expenses_minor')::BIGINT
    + (statement->'totals'->>'transfers_minor')::BIGINT
    + (statement->'totals'->>'releases_minor')::BIGINT
    + (statement->'totals'->>'other_equity_minor')::BIGINT
    = (statement->'totals'->>'closing_net_assets_minor')::BIGINT,
    'organisation statement totals explain the change in net assets'
  );

  donor_statement := public.nonprofit_donor_statement(c, '2026-10-01', '2026-10-31', donor);
  PERFORM public.test_assert(jsonb_array_length(donor_statement->'currencies') = 0, 'donor statement before gifts has no currency totals');
  donor_statement := public.nonprofit_donor_statement(c, '2026-11-01', '2026-11-30', donor);
  PERFORM public.test_assert((donor_statement->>'statutory_filing')::BOOLEAN = false, 'donor statement is not a statutory filing');
  PERFORM public.test_assert((donor_statement->>'tax_certificate')::BOOLEAN = false, 'donor statement is not a tax certificate');
  PERFORM public.test_assert((donor_statement->>'government_approved')::BOOLEAN = false, 'donor statement is not government approved');
  PERFORM public.test_assert(donor_statement->>'wording' ILIKE '%not a tax certificate%', 'donor statement says it is not a tax certificate');
  PERFORM public.test_assert(NOT (donor_statement ? 'beneficiaries'), 'donor statement does not include beneficiary records');
  SELECT value INTO currency FROM jsonb_array_elements(donor_statement->'currencies') WHERE value->>'currency_code' = 'USD';
  PERFORM public.test_assert(
    (currency->>'net_minor')::BIGINT = 13000
      AND (currency->>'journal_support_minor')::BIGINT = 13000
      AND (currency->>'reconciled')::BOOLEAN,
    'donor USD gifts reconcile to contribution revenue'
  );
  SELECT value INTO currency FROM jsonb_array_elements(donor_statement->'currencies') WHERE value->>'currency_code' = 'EUR';
  PERFORM public.test_assert((currency->>'net_minor')::BIGINT = 8000 AND (currency->>'reconciled')::BOOLEAN, 'donor EUR gifts reconcile to contribution revenue');
  PERFORM public.test_assert((
    SELECT (gift_fund->>'net_minor')::BIGINT = 13000
    FROM jsonb_array_elements(donor_statement->'funds') gift_fund
    WHERE gift_fund->>'code' = 'GEN' AND gift_fund->>'currency_code' = 'USD'
  ), 'general fund donor total is net of the refund');
  PERFORM public.test_assert((
    SELECT (gift_fund->>'net_minor')::BIGINT = 0
    FROM jsonb_array_elements(donor_statement->'funds') gift_fund
    WHERE gift_fund->>'code' = 'RELIEF' AND gift_fund->>'currency_code' = 'USD'
  ), 'restricted fund donor total is zero after the refund');
  PERFORM public.test_assert((donor_statement->>'services_not_recognised')::INTEGER >= 1, 'donated services stay off the statement totals');
  PERFORM public.test_assert((
    SELECT COALESCE(SUM((gift_pledge->>'outstanding_minor')::BIGINT), 0) = 6800
      AND COALESCE(SUM((gift_pledge->>'outstanding_minor')::BIGINT) FILTER (WHERE gift_pledge->>'status' = 'conditional'), 0) = 3000
    FROM jsonb_array_elements(donor_statement->'pledges') gift_pledge
  ), 'outstanding pledges keep the conditional commitment and the impaired remainder');
  PERFORM public.test_assert(jsonb_array_length(donor_statement->'receipts') >= 1, 'donation receipt is listed on the donor statement');
  PERFORM public.test_assert((
    SELECT (gift->>'net_minor')::BIGINT = 13111
    FROM jsonb_array_elements(public.nonprofit_donor_statement(c, '2026-11-01', '2026-11-30', NULL)->'currencies') gift
    WHERE gift->>'currency_code' = 'USD'
  ), 'consolidated statement adds every donor in the currency');
  recorded := public.nonprofit_record_donor_statement(c, '2026-11-01', '2026-11-30', donor, 'not_requested');
  PERFORM public.test_assert(recorded->>'delivery_status' = 'not_requested' AND recorded->>'run_id' IS NOT NULL, 'generating a statement stores an audit run and does not send email');
  PERFORM public.test_assert((public.nonprofit_record_donor_statements(c, '2026-11-01', '2026-11-30')->>'generated')::INTEGER = 2, 'bulk generation stores one statement for each active donor');
  PERFORM public.test_assert(
    jsonb_array_length(public.nonprofit_donor_statement(c, '2026-11-01', '2026-11-30', NULL)->'history') = 3,
    'each generated statement is stored in the organisation history'
  );

  PERFORM public.test_assert(
    (public.nonprofit_set_organisation_kind(c, 'church')->>'organisation_kind') = 'church'
      AND (public.nonprofit_set_organisation_kind(c, 'church')->>'tax_certificate')::BOOLEAN = false,
    'a church uses the existing ledger and does not issue a tax certificate'
  );
  building := (public.nonprofit_create_fund(c, jsonb_build_object(
    'code', 'BUILD', 'name', 'Building', 'classification', 'donor_restricted',
    'restriction', 'donor_restricted', 'category', 'building'
  ))->>'id')::UUID;
  PERFORM public.test_assert((SELECT category FROM public.nonprofit_funds WHERE id = building) = 'building', 'building fund uses the existing fund table');
  congregation_id := (public.nonprofit_create_congregation(c, jsonb_build_object('name', 'Central', 'location', 'North'))->>'id')::UUID;
  member_a := (public.nonprofit_create_donor(c, jsonb_build_object('donor_kind', 'individual', 'display_name', 'Ada Church', 'email', 'ada.church@example.test'))->>'id')::UUID;
  member_b := (public.nonprofit_create_donor(c, jsonb_build_object('donor_kind', 'individual', 'display_name', 'Ben Church', 'email', 'ben.church@example.test'))->>'id')::UUID;
  household_id := (public.nonprofit_create_household(c, jsonb_build_object('name', 'Church family', 'congregation_id', congregation_id))->>'id')::UUID;
  PERFORM public.nonprofit_add_household_member(c, household_id, member_a, 'head');
  PERFORM public.nonprofit_add_household_member(c, household_id, member_b, 'adult');
  SELECT count(*) INTO journal_count FROM public.journals WHERE company_id = c;
  batch := public.nonprofit_post_collection_batch(c, jsonb_build_object(
    'fund_id', building,
    'congregation_id', congregation_id,
    'collected_on', '2026-11-28',
    'giving_kind', 'tithe',
    'currency_code', 'USD',
    'idempotency_key', 'collection-1',
    'lines', jsonb_build_array(
      jsonb_build_object('donor_id', member_a, 'amount_minor', 400, 'anonymous', false),
      jsonb_build_object('donor_id', member_b, 'amount_minor', 250, 'anonymous', false),
      jsonb_build_object('amount_minor', 100, 'anonymous', true)
    )
  ));
  PERFORM public.test_assert((batch->>'posted')::INTEGER = 3 AND (batch->>'anonymous')::INTEGER = 1 AND (batch->>'tax_certificate')::BOOLEAN = false, 'collection batch posts named and anonymous gifts');
  PERFORM public.test_assert((SELECT count(*) FROM public.journals WHERE company_id = c) = journal_count + 3, 'each collection line posts one journal');
  PERFORM public.test_assert((SELECT count(*) FROM public.nonprofit_gift_designations WHERE giving_kind = 'tithe') = 3, 'tithe designation is stored beside the donation');
  batch := public.nonprofit_post_collection_batch(c, jsonb_build_object(
    'fund_id', building, 'collected_on', '2026-11-28', 'giving_kind', 'tithe', 'currency_code', 'USD',
    'idempotency_key', 'collection-1',
    'lines', jsonb_build_array(jsonb_build_object('amount_minor', 100, 'anonymous', true))
  ));
  PERFORM public.test_assert((batch->>'replayed')::BOOLEAN AND (SELECT count(*) FROM public.journals WHERE company_id = c) = journal_count + 3, 'replaying a collection batch does not post again');
  family := public.nonprofit_household_statement(c, household_id, '2026-11-01', '2026-11-30');
  PERFORM public.test_assert((family->>'tax_certificate')::BOOLEAN = false AND family->>'wording' ILIKE '%not a tax certificate%', 'family statement is not a tax certificate');
  PERFORM public.test_assert((
    SELECT (row->>'net_minor')::BIGINT = 650 AND (row->>'journal_support_minor')::BIGINT = 650 AND (row->>'reconciled')::BOOLEAN
    FROM jsonb_array_elements(family->'currencies') row
    WHERE row->>'currency_code' = 'USD'
  ), 'family statement sums member gifts and reconciles to contribution revenue');
  PERFORM public.test_assert(jsonb_array_length(family->'members') = 2, 'anonymous collection lines stay off the family statement');
  PERFORM public.test_assert((
    SELECT (row->>'net_minor')::BIGINT = 400 AND (row->>'reconciled')::BOOLEAN
    FROM jsonb_array_elements(public.nonprofit_donor_statement(c, '2026-11-01', '2026-11-30', member_a)->'currencies') row
    WHERE row->>'currency_code' = 'USD'
  ), 'a member statement shows only that member');
  PERFORM public.nonprofit_create_record(c, 'recurring', jsonb_build_object(
    'donor_id', member_a, 'fund_id', building, 'amount_minor', 100, 'method', 'bank_transfer', 'next_on', '2026-12-06'
  ));
  PERFORM public.test_assert((SELECT count(*) FROM public.journals WHERE company_id = c) = journal_count + 3, 'a recurring gift schedule does not post a journal');
  event_id := (public.nonprofit_create_record(c, 'event', jsonb_build_object('name', 'Sunday service', 'event_on', '2026-11-29'))->>'id')::UUID;
  volunteer_id := (public.nonprofit_create_record(c, 'volunteer', jsonb_build_object('display_name', 'Choir lead'))->>'id')::UUID;
  PERFORM public.nonprofit_record_attendance(c, event_id, member_a, true);
  PERFORM public.test_assert((public.nonprofit_schedule_volunteer(c, jsonb_build_object('volunteer_id', volunteer_id, 'event_id', event_id, 'role_name', 'Usher'))->>'journal_id') IS NULL, 'scheduling a volunteer does not post a journal');
  PERFORM public.test_assert((
    SELECT (item->>'present_count')::INTEGER = 1
    FROM jsonb_array_elements(public.nonprofit_workspace(c)->'events') item
    WHERE item->>'id' = event_id::TEXT
  ), 'attendance is counted on the existing event');
  PERFORM public.test_assert((public.nonprofit_workspace(c)->'settings'->>'organisation_kind') = 'church', 'workspace keeps the church organisation kind');

  BEGIN
    PERFORM public.nonprofit_fund_statement(c, '2026-11-30', '2026-11-01');
    RAISE EXCEPTION 'FAIL: inverted statement period was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM !~* 'starts after' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;
UPDATE public.accounting_periods
SET status = 'locked'
WHERE company_id = '20000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001"}', false);
SELECT public.test_raises(
  $sql$SELECT public.nonprofit_submit_donation(
    '20000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'donated_on', '2026-11-20',
      'currency_code', 'USD',
      'amount_minor', 100,
      'idempotency_key', 'locked-1',
      'allocations', jsonb_build_array(jsonb_build_object(
        'fund_id', (SELECT id FROM public.nonprofit_funds WHERE company_id = '20000000-0000-4000-8000-000000000001' AND code = 'GEN'),
        'amount_minor', 100
      ))
    )
  )$sql$,
  'Accounting period is',
  'locked period rejects posting'
);
RESET ROLE;
UPDATE public.accounting_periods
SET status = 'open'
WHERE company_id = '20000000-0000-4000-8000-000000000001';

SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000004"}', false);
SELECT public.test_raises(
  $sql$SELECT public.nonprofit_workspace('20000000-0000-4000-8000-000000000001')$sql$,
  'do not have access',
  'cross-tenant workspace is denied'
);
SELECT public.test_raises(
  $sql$SELECT public.nonprofit_fund_statement('20000000-0000-4000-8000-000000000001', '2026-11-01', '2026-11-30')$sql$,
  'do not have access',
  'cross-tenant fund statement is denied'
);
SELECT public.test_raises(
  $sql$SELECT public.nonprofit_donor_statement('20000000-0000-4000-8000-000000000001', '2026-11-01', '2026-11-30', NULL)$sql$,
  'do not have access',
  'cross-tenant donor statement is denied'
);
SELECT public.test_raises(
  $sql$SELECT public.nonprofit_set_organisation_kind('20000000-0000-4000-8000-000000000001', 'church')$sql$,
  'do not have access',
  'cross-tenant organisation kind is denied'
);

SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003"}', false);
SELECT public.test_assert(
  (SELECT count(*) FROM public.nonprofit_beneficiaries WHERE company_id = '20000000-0000-4000-8000-000000000001') = 0,
  'beneficiary records stay hidden without beneficiaries.view'
);
SELECT public.test_assert(
  (SELECT count(*) FROM public.nonprofit_disbursements WHERE company_id = '20000000-0000-4000-8000-000000000001') = 0,
  'disbursement records stay hidden without beneficiaries.view'
);
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002"}', false);
SELECT public.test_assert(
  (SELECT count(*) = 1 AND bool_and(amount_minor = 111) FROM public.nonprofit_donations),
  'donor portal user sees only their own donation'
);
SELECT public.test_raises(
  $sql$SELECT public.nonprofit_fund_statement('20000000-0000-4000-8000-000000000001', '2026-11-01', '2026-11-30')$sql$,
  'Missing permission',
  'donor portal user cannot read the fund statement'
);
SELECT public.test_assert(
  (
    SELECT (currency->>'net_minor')::BIGINT = 111 AND (currency->>'reconciled')::BOOLEAN
    FROM jsonb_array_elements(
      (public.nonprofit_my_donor_statement('2026-11-01', '2026-11-30')->0->'statement')->'currencies'
    ) currency
    WHERE currency->>'currency_code' = 'USD'
  ),
  'portal donor statement shows only that donor and reconciles'
);
SELECT public.test_assert(
  (SELECT count(*) FROM public.nonprofit_statement_runs) = 0,
  'portal donor cannot read organisation statement history'
);
SELECT public.test_raises(
  $sql$SELECT public.nonprofit_record_donor_statement('20000000-0000-4000-8000-000000000001', '2026-11-01', '2026-11-30', NULL, 'not_requested')$sql$,
  'Missing permission',
  'portal donor cannot generate organisation statements'
);
SELECT public.test_raises(
  $sql$SELECT public.nonprofit_household_statement('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000099', '2026-11-01', '2026-11-30')$sql$,
  'Missing permission',
  'portal donor cannot read a family statement'
);
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003"}', false);
SELECT public.test_assert(
  (SELECT (s->>'statutory_filing')::BOOLEAN = false AND NOT (s ? 'beneficiaries')
   FROM (SELECT public.nonprofit_fund_statement('20000000-0000-4000-8000-000000000001', '2026-11-01', '2026-11-01') AS s) statement),
  'a viewer can read the management statement without beneficiary records'
);
SELECT public.test_raises(
  $sql$SELECT public.nonprofit_record_donor_statement('20000000-0000-4000-8000-000000000001', '2026-11-01', '2026-11-30', NULL, 'not_requested')$sql$,
  'Missing permission',
  'a viewer without export cannot generate donor statements'
);
SELECT public.test_raises(
  $sql$SELECT public.nonprofit_set_organisation_kind('20000000-0000-4000-8000-000000000001', 'mosque')$sql$,
  'Missing permission',
  'a manager without nonprofit.admin cannot change organisation kind'
);
SELECT public.test_assert(
  (SELECT count(*) FROM public.nonprofit_statement_runs) = 3,
  'a viewer can see generated statement history'
);
RESET ROLE;
INSERT INTO public.nonprofit_gateway_events (company_id, gateway, event_id, status)
VALUES ('20000000-0000-4000-8000-000000000001', 'stripe', 'evt_1', 'processed');
SELECT public.test_raises(
  $sql$INSERT INTO public.nonprofit_gateway_events (company_id, gateway, event_id, status)
  VALUES ('20000000-0000-4000-8000-000000000001', 'stripe', 'evt_1', 'duplicate')$sql$,
  'duplicate key',
  'duplicate gateway event is rejected'
);
