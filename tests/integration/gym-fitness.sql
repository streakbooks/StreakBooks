-- Gym membership, recognition, scheduling and isolation against the disposable fixture.
INSERT INTO public.accounts (id, company_id, code, name, account_type) VALUES
  ('40000000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-000000000001', '2100', 'Deferred membership', 'liability'),
  ('40000000-0000-4000-8000-000000000102', '20000000-0000-4000-8000-000000000001', '2200', 'Prepaid sessions', 'liability'),
  ('40000000-0000-4000-8000-000000000103', '20000000-0000-4000-8000-000000000001', '2210', 'Voucher liability', 'liability'),
  ('40000000-0000-4000-8000-000000000104', '20000000-0000-4000-8000-000000000001', '2250', 'Commission payable', 'liability'),
  ('40000000-0000-4000-8000-000000000105', '20000000-0000-4000-8000-000000000001', '4500', 'Membership revenue', 'income'),
  ('40000000-0000-4000-8000-000000000106', '20000000-0000-4000-8000-000000000001', '4510', 'Joining fees', 'income'),
  ('40000000-0000-4000-8000-000000000107', '20000000-0000-4000-8000-000000000001', '4520', 'Session revenue', 'income'),
  ('40000000-0000-4000-8000-000000000108', '20000000-0000-4000-8000-000000000001', '5900', 'Commission expense', 'expense');

INSERT INTO public.test_permissions
SELECT '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', permission
FROM unnest(ARRAY[
  'gym.view', 'gym.manage', 'gym.post', 'gym.approve', 'gym.reverse', 'gym.export', 'gym.admin',
  'gym.members.manage', 'gym.plans.manage', 'gym.schedule.manage', 'gym.attendance.manage',
  'gym.trainers.manage', 'gym.billing.manage', 'gym.portal.manage'
]) AS permission;

SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001"}', false);

DO $$
DECLARE
  c UUID := '20000000-0000-4000-8000-000000000001';
  other UUID := '20000000-0000-4000-8000-000000000002';
  plan JSONB;
  member JSONB;
  membership JSONB;
  replay JSONB;
  receipt JSONB;
  trainer JSONB;
  package JSONB;
  consumed JSONB;
  class_row JSONB;
  first_booking JSONB;
  second_booking JSONB;
  promoted JSONB;
  workspace JSONB;
  statement JSONB;
  budget JSONB;
  side JSONB;
  side_member JSONB;
  approved JSONB;
  deferred BIGINT;
  recognised BIGINT;
  journals BIGINT;
  message TEXT;
BEGIN
  PERFORM public.gym_upsert_settings(c, jsonb_build_object(
    'enabled', true,
    'currency_code', 'USD',
    'country_code', 'US',
    'timezone', 'UTC',
    'account_map', jsonb_build_object(
      'bank', '40000000-0000-4000-8000-000000000001',
      'accounts_receivable', '40000000-0000-4000-8000-000000000004',
      'deferred_membership_revenue', '40000000-0000-4000-8000-000000000101',
      'membership_revenue', '40000000-0000-4000-8000-000000000105',
      'joining_fee_revenue', '40000000-0000-4000-8000-000000000106',
      'tax_liability', '40000000-0000-4000-8000-000000000029',
      'prepaid_session_liability', '40000000-0000-4000-8000-000000000102',
      'session_revenue', '40000000-0000-4000-8000-000000000107',
      'voucher_liability', '40000000-0000-4000-8000-000000000103',
      'commission_expense', '40000000-0000-4000-8000-000000000108',
      'commission_payable', '40000000-0000-4000-8000-000000000104',
      'cancellation_fee_revenue', '40000000-0000-4000-8000-000000000105'
    )
  ));
  plan := public.gym_save_plan(c, jsonb_build_object(
    'code', 'ANNUAL', 'name', 'Annual', 'billing_interval', 'year', 'term_count', 1,
    'price_minor', 120000, 'joining_fee_minor', 0, 'tax_bps', 0,
    'joining_fee_policy', 'defer', 'recognition', 'monthly', 'cancel_policy', 'keep_deferred',
    'currency_code', 'USD', 'requires_acceptance', true
  ));
  member := public.gym_create_member(c, jsonb_build_object('display_name', 'Asha Rao', 'email', 'asha@gym.test', 'status', 'prospect'));
  membership := public.gym_activate_membership(c, jsonb_build_object(
    'member_id', member->>'id', 'plan_id', plan->>'id', 'starts_on', '2026-01-15',
    'idempotency_key', 'annual-asha', 'signature_name', 'Asha Rao'
  ));
  replay := public.gym_activate_membership(c, jsonb_build_object(
    'member_id', member->>'id', 'plan_id', plan->>'id', 'starts_on', '2026-01-15',
    'idempotency_key', 'annual-asha', 'signature_name', 'Asha Rao'
  ));
  PERFORM public.test_assert((replay->>'replayed')::BOOLEAN, 'repeat activation does not create another contract');
  SELECT count(*) INTO journals FROM public.journals WHERE idempotency_key = 'gym-membership-' || (membership->>'id');
  PERFORM public.test_assert(journals = 1, 'membership invoice posts once');
  SELECT COALESCE(SUM(credit_minor), 0) INTO deferred
  FROM public.journal_lines
  WHERE account_id = '40000000-0000-4000-8000-000000000101';
  PERFORM public.test_assert(deferred = 120000, 'annual fee is deferred, not earned, on invoice');
  receipt := public.gym_record_receipt(c, jsonb_build_object(
    'member_id', member->>'id', 'amount_minor', 120000, 'method', 'bank_transfer',
    'received_on', '2026-01-15', 'idempotency_key', 'pay-asha', 'currency_code', 'USD'
  ));
  PERFORM public.test_assert(receipt->>'journal_id' IS NOT NULL, 'bank receipt posts a journal');
  PERFORM public.gym_recognise_due(c, '2026-01-15');
  SELECT COALESCE(SUM(amount_minor), 0) INTO recognised
  FROM public.gym_recognition_lines WHERE status = 'recognised';
  SELECT COALESCE(SUM(amount_minor), 0) INTO deferred
  FROM public.gym_recognition_lines WHERE status = 'scheduled';
  PERFORM public.test_assert(recognised = 10000 AND deferred = 110000, 'one month is earned and eleven remain deferred');
  PERFORM public.gym_recognise_due(c, '2026-01-15');
  SELECT count(*) INTO journals FROM public.journals WHERE source_type = 'gym_recognition';
  PERFORM public.test_assert(journals = 1, 'recognition retry does not post again');

  statement := public.gym_member_statement(c, (member->>'id')::UUID, '2026-01-01', '2026-01-31');
  PERFORM public.test_assert((statement->>'charges_minor')::BIGINT = 120000, 'january statement includes the membership invoice');
  PERFORM public.test_assert((statement->>'receipts_minor')::BIGINT = 120000, 'january statement includes the bank receipt');
  PERFORM public.test_assert((statement->>'closing_minor')::BIGINT = (statement->>'opening_minor')::BIGINT, 'january activity nets to the opening balance');

  trainer := public.gym_save_trainer(c, jsonb_build_object(
    'display_name', 'Ravi', 'kind', 'contractor', 'commission_kind', 'percent', 'commission_bps', 1000
  ));
  package := public.gym_sell_package(c, jsonb_build_object(
    'member_id', member->>'id', 'trainer_id', trainer->>'id', 'sessions', 3, 'price_minor', 30000,
    'idempotency_key', 'pack-asha', 'currency_code', 'USD'
  ));
  consumed := public.gym_consume_session(c, jsonb_build_object('package_id', package->>'id', 'count', 1, 'idempotency_key', 'use-1'));
  PERFORM public.test_assert((SELECT liability_minor FROM public.gym_packages WHERE id = (package->>'id')::UUID) = 20000, 'one session recognises a third of the liability');
  BEGIN
    PERFORM public.gym_consume_session(c, jsonb_build_object('package_id', package->>'id', 'count', 3, 'idempotency_key', 'use-too-many'));
    RAISE EXCEPTION 'negative sessions were allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Not enough sessions%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.gym_book_appointment(c, jsonb_build_object(
      'trainer_id', trainer->>'id', 'member_id', member->>'id', 'kind', 'personal_training',
      'starts_at', '2026-02-01T10:00:00Z', 'ends_at', '2026-02-01T11:00:00Z', 'idempotency_key', 'appt-1'
    ));
    PERFORM public.gym_book_appointment(c, jsonb_build_object(
      'trainer_id', trainer->>'id', 'member_id', member->>'id', 'kind', 'personal_training',
      'starts_at', '2026-02-01T10:30:00Z', 'ends_at', '2026-02-01T11:30:00Z', 'idempotency_key', 'appt-2'
    ));
    RAISE EXCEPTION 'overlapping appointment was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%already booked%' THEN RAISE; END IF;
  END;

  class_row := public.gym_save_class(c, jsonb_build_object(
    'name', 'Strength', 'capacity', 1, 'price_minor', 0,
    'starts_at', '2026-02-02T09:00:00Z', 'ends_at', '2026-02-02T10:00:00Z'
  ));
  first_booking := public.gym_book_class(c, jsonb_build_object('session_id', class_row->>'id', 'member_id', member->>'id'));
  second_booking := public.gym_create_member(c, jsonb_build_object('display_name', 'Dev Patel', 'email', 'dev@gym.test', 'status', 'active'));
  second_booking := public.gym_book_class(c, jsonb_build_object('session_id', class_row->>'id', 'member_id', second_booking->>'id'));
  PERFORM public.test_assert(first_booking->>'status' = 'registered' AND second_booking->>'status' = 'waitlisted', 'a full class waitlists instead of overbooking');
  promoted := public.gym_cancel_booking(c, (first_booking->>'id')::UUID);
  PERFORM public.test_assert(promoted->>'kind' IS NOT NULL, 'cancelling a place promotes the waiting list');

  PERFORM public.gym_check_in(c, jsonb_build_object('member_id', member->>'id', 'attended_on', '2026-01-20', 'source', 'qr', 'idempotency_key', 'in-1'));
  PERFORM public.test_assert((SELECT count(*) FROM public.gym_attendance) = 1, 'valid membership can check in');

  BEGIN
    PERFORM public.gym_record_receipt(c, jsonb_build_object(
      'member_id', member->>'id', 'amount_minor', 100, 'method', 'card_gateway', 'idempotency_key', 'fake-card'
    ));
    RAISE EXCEPTION 'gateway receipt was marked successful';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%verified provider%' THEN RAISE; END IF;
  END;

  PERFORM public.gym_cancel_membership(c, jsonb_build_object('membership_id', membership->>'id', 'idempotency_key', 'cancel-asha'));
  PERFORM public.test_assert(
    (SELECT count(*) FROM public.gym_recognition_lines WHERE status = 'scheduled') = 11,
    'cancellation without a forfeit policy does not earn the balance'
  );

  PERFORM public.test_assert(
    (SELECT amount_minor FROM public.gym_commissions WHERE package_id = (package->>'id')::UUID) = 1000,
    'ten percent of the delivered session waits as commission'
  );
  approved := public.gym_approve_commission(c, (SELECT id FROM public.gym_commissions WHERE package_id = (package->>'id')::UUID));
  PERFORM public.test_assert(approved->>'status' = 'approved' AND approved->>'journal_id' IS NOT NULL, 'approving commission posts the payable');
  approved := public.gym_approve_commission(c, (approved->>'id')::UUID);
  PERFORM public.test_assert(approved->>'replayed' = 'true', 'approving the same commission does not post again');

  side := public.gym_save_plan(c, jsonb_build_object(
    'code', 'MONTH3', 'name', 'Three months', 'billing_interval', 'month', 'term_count', 3,
    'price_minor', 30000, 'joining_fee_minor', 0, 'tax_bps', 0,
    'joining_fee_policy', 'defer', 'recognition', 'monthly', 'cancel_policy', 'keep_deferred',
    'currency_code', 'USD', 'requires_acceptance', false
  ));
  side_member := public.gym_create_member(c, jsonb_build_object('display_name', 'Meera Shah', 'email', 'meera@gym.test', 'status', 'prospect'));
  side := public.gym_activate_membership(c, jsonb_build_object(
    'member_id', side_member->>'id', 'plan_id', side->>'id', 'starts_on', '2026-03-01', 'idempotency_key', 'month-meera'
  ));
  journals := (SELECT count(*) FROM public.journals);
  side := public.gym_freeze_membership(c, jsonb_build_object('membership_id', side->>'id', 'days', 10));
  PERFORM public.test_assert(
    side->>'status' = 'frozen'
      AND (SELECT recognise_on FROM public.gym_recognition_lines WHERE membership_id = (side->>'id')::UUID AND line_no = 1) = '2026-03-11'
      AND (SELECT ends_on FROM public.gym_memberships WHERE id = (side->>'id')::UUID) = '2026-06-10'
      AND (SELECT count(*) FROM public.journals) = journals,
    'a freeze shifts the service period and posts no journal'
  );
  side := public.gym_reactivate_membership(c, (side->>'id')::UUID);
  PERFORM public.test_assert(side->>'status' = 'active', 'a frozen membership can be reactivated');
  side := public.gym_renew_membership(c, jsonb_build_object('membership_id', side->>'id', 'idempotency_key', 'renew-meera'));
  approved := public.gym_renew_membership(c, jsonb_build_object('membership_id', (SELECT renewed_from_id FROM public.gym_memberships WHERE id = (side->>'id')::UUID), 'idempotency_key', 'renew-meera-again'));
  PERFORM public.test_assert(
    (SELECT starts_on FROM public.gym_memberships WHERE id = (side->>'id')::UUID) = '2026-06-11'
      AND approved->>'replayed' = 'true'
      AND approved->>'id' = side->>'id',
    'renewal starts the day after the contract and does not duplicate'
  );

  side := public.gym_save_plan(c, jsonb_build_object(
    'code', 'REFUND', 'name', 'Refundable month', 'billing_interval', 'month', 'term_count', 1,
    'price_minor', 12000, 'joining_fee_minor', 0, 'tax_bps', 0,
    'joining_fee_policy', 'defer', 'recognition', 'monthly', 'cancel_policy', 'refund_unrecognised',
    'currency_code', 'USD', 'requires_acceptance', false
  ));
  side_member := public.gym_create_member(c, jsonb_build_object('display_name', 'Neil Roy', 'email', 'neil@gym.test', 'status', 'prospect'));
  side := public.gym_activate_membership(c, jsonb_build_object(
    'member_id', side_member->>'id', 'plan_id', side->>'id', 'starts_on', '2026-04-01', 'idempotency_key', 'refund-neil'
  ));
  PERFORM public.gym_record_receipt(c, jsonb_build_object(
    'member_id', side_member->>'id', 'amount_minor', 12000, 'method', 'bank_transfer', 'idempotency_key', 'neil-pay', 'received_on', '2026-04-01'
  ));
  side := public.gym_cancel_membership(c, jsonb_build_object(
    'membership_id', side->>'id', 'destination', 'bank', 'idempotency_key', 'refund-neil-cancel'
  ));
  PERFORM public.test_assert(
    side->>'replayed' = 'false'
      AND (SELECT amount_minor FROM public.gym_refunds WHERE idempotency_key = 'refund-neil-cancel') = 12000
      AND (SELECT refunded_minor FROM public.gym_receipts WHERE idempotency_key = 'neil-pay') = 0
      AND (SELECT status FROM public.gym_charges WHERE membership_id = (side->>'id')::UUID) = 'settled'
      AND (SELECT count(*) FROM public.gym_recognition_lines WHERE membership_id = (side->>'id')::UUID AND status = 'scheduled') = 0
      AND (SELECT count(*) FROM public.journals WHERE source_type::TEXT = 'gym_refund') = 1,
    'a cash refund of unrecognised membership returns cash and leaves the settled charge in place'
  );
  approved := public.gym_cancel_membership(c, jsonb_build_object(
    'membership_id', side->>'id', 'destination', 'bank', 'idempotency_key', 'refund-neil-cancel'
  ));
  PERFORM public.test_assert(approved->>'replayed' = 'true', 'repeating a refund does not post again');

  side := public.gym_save_plan(c, jsonb_build_object(
    'code', 'FORFEIT', 'name', 'Forfeit month', 'billing_interval', 'month', 'term_count', 1,
    'price_minor', 6000, 'joining_fee_minor', 0, 'tax_bps', 0,
    'joining_fee_policy', 'defer', 'recognition', 'monthly', 'cancel_policy', 'forfeit',
    'currency_code', 'USD', 'requires_acceptance', false
  ));
  side_member := public.gym_create_member(c, jsonb_build_object('display_name', 'Isha Sen', 'email', 'isha@gym.test', 'status', 'prospect'));
  side := public.gym_activate_membership(c, jsonb_build_object(
    'member_id', side_member->>'id', 'plan_id', side->>'id', 'starts_on', '2026-05-01', 'idempotency_key', 'forfeit-isha'
  ));
  side := public.gym_cancel_membership(c, jsonb_build_object('membership_id', side->>'id', 'idempotency_key', 'forfeit-isha-cancel'));
  PERFORM public.test_assert(
    (SELECT count(*) FROM public.journals WHERE source_type::TEXT = 'gym_cancellation') = 1
      AND (SELECT count(*) FROM public.gym_recognition_lines WHERE membership_id = (side->>'id')::UUID AND status = 'cancelled') = 1,
    'forfeit earns the unused balance only when the contract says so'
  );

  side := public.gym_issue_voucher(c, jsonb_build_object('amount_minor', 5000, 'idempotency_key', 'voucher-1'));
  side_member := public.gym_create_member(c, jsonb_build_object('display_name', 'Kabir Das', 'email', 'kabir@gym.test', 'status', 'prospect'));
  approved := public.gym_save_plan(c, jsonb_build_object(
    'code', 'OPEN', 'name', 'Open month', 'billing_interval', 'month', 'term_count', 1,
    'price_minor', 8000, 'joining_fee_minor', 0, 'tax_bps', 0,
    'joining_fee_policy', 'defer', 'recognition', 'monthly', 'cancel_policy', 'keep_deferred',
    'currency_code', 'USD', 'requires_acceptance', false
  ));
  approved := public.gym_activate_membership(c, jsonb_build_object(
    'member_id', side_member->>'id', 'plan_id', approved->>'id', 'starts_on', '2026-06-01', 'idempotency_key', 'open-kabir'
  ));
  side := public.gym_redeem_voucher(c, jsonb_build_object(
    'voucher_id', side->>'id', 'member_id', side_member->>'id', 'amount_minor', 5000, 'idempotency_key', 'redeem-1'
  ));
  PERFORM public.test_assert(
    (SELECT remaining_minor FROM public.gym_vouchers WHERE idempotency_key = 'voucher-1') = 0
      AND (SELECT allocated_minor FROM public.gym_charges WHERE membership_id = (approved->>'id')::UUID) = 5000
      AND side->>'journal_id' IS NOT NULL,
    'a voucher reduces the open balance and the liability'
  );

  PERFORM public.gym_link_portal(c, (side_member->>'id')::UUID, '10000000-0000-4000-8000-000000000002');
  PERFORM set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002"}', false);
  side := public.gym_my_portal(c);
  PERFORM public.test_assert(side->>'linked' = 'true' AND side->>'display_name' = 'Kabir Das', 'a linked sign-in sees only that member');
  PERFORM set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001"}', false);
  side := public.gym_my_portal(c);
  PERFORM public.test_assert(side->>'linked' = 'false', 'an unlinked sign-in does not see another member');
  BEGIN
    PERFORM public.gym_link_portal(c, (member->>'id')::UUID, '10000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'one sign-in was linked twice';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%already linked%' THEN RAISE; END IF;
  END;

  RESET ROLE;
  UPDATE public.accounting_periods SET status = 'locked' WHERE company_id = c;
  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001"}', false);
  BEGIN
    PERFORM public.gym_record_receipt(c, jsonb_build_object(
      'member_id', member->>'id', 'amount_minor', 100, 'method', 'cash', 'idempotency_key', 'locked-period'
    ));
    RAISE EXCEPTION 'a locked period accepted a receipt';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%posting is not allowed%' THEN RAISE; END IF;
  END;
  RESET ROLE;
  UPDATE public.accounting_periods SET status = 'open' WHERE company_id = c;
  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001"}', false);
  PERFORM public.test_assert(true, 'a locked accounting period rejects a new receipt');

  PERFORM public.gym_upsert_settings(c, jsonb_build_object(
    'enabled', false, 'currency_code', 'USD', 'country_code', 'US', 'timezone', 'UTC',
    'account_map', jsonb_build_object(
      'bank', '40000000-0000-4000-8000-000000000001',
      'accounts_receivable', '40000000-0000-4000-8000-000000000004',
      'deferred_membership_revenue', '40000000-0000-4000-8000-000000000101',
      'membership_revenue', '40000000-0000-4000-8000-000000000105'
    )
  ));
  PERFORM public.test_assert((SELECT count(*) FROM public.journals WHERE source_type::TEXT LIKE 'gym_%') > 0, 'disabling the module keeps posted journals');
  BEGIN
    PERFORM public.gym_record_receipt(c, jsonb_build_object(
      'member_id', member->>'id', 'amount_minor', 100, 'method', 'cash', 'idempotency_key', 'after-disable'
    ));
    RAISE EXCEPTION 'disabled module still posted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%not activated%' THEN RAISE; END IF;
  END;

  journals := (SELECT count(*) FROM public.journals);
  budget := public.gym_save_budget(c, jsonb_build_object(
    'budget_year', 2026, 'budget_month', 1, 'role', 'membership_revenue', 'amount_minor', 50000
  ));
  budget := public.gym_save_budget(c, jsonb_build_object(
    'budget_year', 2026, 'budget_month', 1, 'role', 'membership_revenue', 'amount_minor', 60000
  ));
  PERFORM public.test_assert(
    (SELECT count(*) FROM public.gym_budget_lines) = 1
      AND (SELECT amount_minor FROM public.gym_budget_lines) = 60000
      AND budget->>'id' IS NOT NULL
      AND (SELECT count(*) FROM public.journals) = journals,
    'a budget line updates in place and does not post a journal'
  );

  PERFORM set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000004"}', false);
  BEGIN
    PERFORM public.gym_workspace(c);
    RAISE EXCEPTION 'another organisation read this gym';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%do not have access%' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001"}', false);
  workspace := public.gym_workspace(c);
  PERFORM public.test_assert(jsonb_array_length(workspace->'actions') >= 1, 'cancelled deferred revenue is an action');
  PERFORM public.test_assert((workspace #>> '{kpis,recognised_minor}')::BIGINT = 10000, 'dashboard earned revenue comes from recognition rows');
END $$;
