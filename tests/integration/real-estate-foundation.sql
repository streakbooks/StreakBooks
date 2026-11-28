-- Real-estate posting, reservation locking and tenant isolation on the disposable fixture.
INSERT INTO public.test_permissions
SELECT '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', permission
FROM unnest(ARRAY[
  'realestate.view', 'realestate.manage', 'realestate.inventory.manage', 'realestate.sales.manage',
  'realestate.collections.manage', 'realestate.post', 'realestate.approve', 'realestate.reverse',
  'realestate.commissions.manage', 'realestate.costs.manage', 'realestate.budgets.manage',
  'realestate.export', 'realestate.admin'
]) AS permission
ON CONFLICT DO NOTHING;

INSERT INTO public.contacts (id, company_id, name)
VALUES ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Asha Purchaser');

SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001"}', false);

DO $$
DECLARE
  c UUID := '20000000-0000-4000-8000-000000000001';
  contact UUID := '50000000-0000-4000-8000-000000000001';
  bank UUID := '40000000-0000-4000-8000-000000000001';
  revenue UUID := '40000000-0000-4000-8000-000000000002';
  asset UUID := '40000000-0000-4000-8000-000000000004';
  liability UUID := '40000000-0000-4000-8000-000000000005';
  inventory UUID := '40000000-0000-4000-8000-000000000010';
  cos UUID := '40000000-0000-4000-8000-000000000007';
  commission_expense UUID := '40000000-0000-4000-8000-000000000009';
  commission_payable UUID := '40000000-0000-4000-8000-000000000015';
  withholding UUID := '40000000-0000-4000-8000-000000000029';
  operating UUID := '40000000-0000-4000-8000-000000000008';
  project UUID;
  unit UUID;
  spare UUID;
  hold UUID;
  sale UUID;
  plan JSONB;
  collection JSONB;
  replay JSONB;
  recognition JSONB;
  broker UUID;
  debits BIGINT;
  credits BIGINT;
BEGIN
  PERFORM public.realestate_upsert_settings(c, jsonb_build_object(
    'enabled', true,
    'recognition_policy', 'point_in_time',
    'area_unit', 'sqm',
    'reservation_hold_days', 7,
    'account_map', jsonb_build_object(
      'bank', bank,
      'contract_liability', liability,
      'contract_asset', asset,
      'revenue', revenue,
      'inventory', inventory,
      'cost_of_sales', cos,
      'commission_expense', commission_expense,
      'commission_payable', commission_payable,
      'withholding_payable', withholding,
      'operating_expense', operating,
      'operating_payable', commission_payable
    )
  ));

  project := (public.realestate_create_project(c, '{"code":"HT","name":"Harbour Tower","currency_code":"USD","status":"active"}'::jsonb)->>'id')::UUID;
  unit := (public.realestate_create_unit(c, jsonb_build_object(
    'project_id', project, 'unit_code', 'A-101', 'kind', 'apartment', 'status', 'available',
    'saleable_area', 50, 'list_price_minor', 100000
  ))->>'id')::UUID;
  spare := (public.realestate_create_unit(c, jsonb_build_object(
    'project_id', project, 'unit_code', 'A-102', 'kind', 'apartment', 'status', 'available', 'list_price_minor', 80000
  ))->>'id')::UUID;
  PERFORM public.test_assert(spare IS NOT NULL, 'second unit is created for the concurrency check');

  hold := (public.realestate_place_hold(c, jsonb_build_object('unit_id', unit, 'holder_name', 'Asha'))->>'id')::UUID;
  sale := (public.realestate_confirm_booking(c, jsonb_build_object(
    'hold_id', hold, 'contact_id', contact, 'contract_minor', 100000
  ))->>'id')::UUID;
  PERFORM public.test_assert((SELECT status FROM public.realestate_units WHERE id = unit) = 'booked', 'booking locks the unit');
  PERFORM public.test_assert((SELECT recognised_minor FROM public.realestate_sales WHERE id = sale) = 0, 'booking does not recognise revenue');

  plan := public.realestate_save_plan(c, jsonb_build_object(
    'sale_id', sale,
    'lines', jsonb_build_array(
      jsonb_build_object('kind', 'deposit', 'label', 'Deposit', 'due_on', '2026-11-01', 'amount_minor', 40000),
      jsonb_build_object('kind', 'instalment', 'label', 'Balance', 'due_on', '2026-12-01', 'amount_minor', 60000)
    )
  ));
  PERFORM public.test_assert((plan->>'status') = 'active', 'schedule is saved without a journal');

  collection := public.realestate_collect(c, jsonb_build_object(
    'sale_id', sale, 'amount_minor', 40000, 'received_on', '2026-11-28', 'fx_rate_to_base', 1, 'idempotency_key', 'collect-1'
  ));
  replay := public.realestate_collect(c, jsonb_build_object(
    'sale_id', sale, 'amount_minor', 40000, 'received_on', '2026-11-28', 'fx_rate_to_base', 1, 'idempotency_key', 'collect-1'
  ));
  PERFORM public.test_assert((collection->>'status') = 'posted', 'collection posts');
  PERFORM public.test_assert((replay->>'replayed')::BOOLEAN, 'collection replay does not post twice');
  PERFORM public.test_assert((SELECT collected_minor FROM public.realestate_sales WHERE id = sale) = 40000, 'collection increases cash held');
  PERFORM public.test_assert((SELECT recognised_minor FROM public.realestate_sales WHERE id = sale) = 0, 'cash is not revenue');
  PERFORM public.test_assert((SELECT allocated_minor FROM public.realestate_instalments WHERE sale_id = sale AND sequence = 1) = 40000, 'deposit line is allocated');

  recognition := public.realestate_recognise(c, jsonb_build_object(
    'sale_id', sale, 'policy', 'point_in_time', 'trigger', 'manual', 'approved', true,
    'control_transferred', true, 'calculation_ref', 'CALC-HT-1',
    'evidence_note', 'Control of unit A-101 transferred on this evidence.',
    'requested_minor', 40000, 'journal_date', '2026-11-28', 'fx_rate_to_base', 1, 'idempotency_key', 'recognise-1'
  ));
  PERFORM public.test_assert((recognition->>'status') = 'posted', 'approved recognition posts');
  PERFORM public.test_assert((SELECT recognised_minor FROM public.realestate_sales WHERE id = sale) = 40000, 'recognised amount is stored');

  SELECT COALESCE(SUM(debit_minor), 0), COALESCE(SUM(credit_minor), 0) INTO debits, credits FROM public.journal_lines;
  PERFORM public.test_assert(debits = credits AND debits > 0, 'every journal line set balances');
  PERFORM public.test_assert((public.realestate_ledger_tie(c)->>'tied')::BOOLEAN, 'registers tie to the posted journals');

  broker := (public.realestate_create_broker(c, '{"name":"North Broker","kind":"broker"}'::jsonb)->>'id')::UUID;
  PERFORM public.realestate_save_commission_rule(c, jsonb_build_object(
    'broker_id', broker, 'name', 'Two percent', 'basis', 'contract', 'rate_bps', 200
  ));
  PERFORM public.realestate_suggest_commission(c, jsonb_build_object('broker_id', broker, 'sale_id', sale));
  PERFORM public.test_assert(
    (SELECT net_minor FROM public.realestate_commission_accruals WHERE sale_id = sale) = 2000,
    'two percent of the contract is suggested and not posted'
  );

  PERFORM public.realestate_record_cost(c, jsonb_build_object(
    'project_id', project, 'category', 'Structure', 'classification', 'wip',
    'amount_minor', 5000, 'incurred_on', '2026-11-20'
  ));
  PERFORM public.test_assert(
    (SELECT journal_id IS NULL FROM public.realestate_costs WHERE category = 'Structure'),
    'WIP cost is not capitalised or posted'
  );
END $$;

SELECT public.test_raises(
  $$SELECT public.realestate_recognise('20000000-0000-4000-8000-000000000001', jsonb_build_object('sale_id', (SELECT id FROM public.realestate_sales LIMIT 1), 'policy', 'point_in_time', 'trigger', 'cash', 'approved', true, 'control_transferred', true, 'calculation_ref', 'CALC-NO', 'evidence_note', 'Cash arrived in the bank today.', 'requested_minor', 1, 'idempotency_key', 'cash-no', 'journal_date', '2026-11-28', 'fx_rate_to_base', 1))$$,
  'does not recognise revenue',
  'cash does not recognise revenue'
);

SELECT public.test_raises(
  $$SELECT public.realestate_place_hold('20000000-0000-4000-8000-000000000001', jsonb_build_object('unit_id', (SELECT id FROM public.realestate_units WHERE unit_code = 'A-101'), 'holder_name', 'Second'))$$,
  'cannot be reserved',
  'booked unit cannot be reserved again'
);

SELECT public.test_raises(
  $$SELECT public.realestate_record_cost('20000000-0000-4000-8000-000000000001', jsonb_build_object('project_id', (SELECT id FROM public.realestate_projects LIMIT 1), 'category', 'Land', 'classification', 'capitalisable', 'amount_minor', 100, 'incurred_on', '2026-11-20', 'post', true, 'idempotency_key', 'cap-1', 'fx_rate_to_base', 1))$$,
  'stay unposted',
  'capitalisable cost is not posted'
);

SELECT public.test_raises(
  $$SELECT public.realestate_cancel_sale('20000000-0000-4000-8000-000000000001', jsonb_build_object('sale_id', (SELECT id FROM public.realestate_sales LIMIT 1), 'disposition', 'available'))$$,
  'Reverse revenue',
  'a recognised sale cannot be cancelled first'
);

SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003"}', false);
SELECT public.test_assert((SELECT count(*) FROM public.realestate_units) = 0, 'a member without realestate.view sees no units');
SELECT public.test_raises(
  $$SELECT public.realestate_workspace('20000000-0000-4000-8000-000000000001')$$,
  'Missing permission',
  'workspace requires realestate.view'
);

SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000004"}', false);
SELECT public.test_raises(
  $$SELECT public.realestate_workspace('20000000-0000-4000-8000-000000000001')$$,
  'do not have access',
  'another organisation cannot open this workspace'
);
