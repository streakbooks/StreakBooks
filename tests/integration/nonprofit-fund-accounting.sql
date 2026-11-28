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
  restricted_credits BIGINT;
  liability_credits BIGINT;
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

SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003"}', false);
SELECT public.test_assert(
  (SELECT count(*) FROM public.nonprofit_beneficiaries WHERE company_id = '20000000-0000-4000-8000-000000000001') = 0,
  'beneficiary records stay hidden without beneficiaries.view'
);
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002"}', false);
SELECT public.test_assert(
  (SELECT count(*) = 1 AND bool_and(amount_minor = 111) FROM public.nonprofit_donations),
  'donor portal user sees only their own donation'
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
