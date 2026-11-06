-- Database-level payroll currency guard regression tests.
-- Run against an isolated Postgres instance after the migration is applied.
-- Every fixture is created within a transaction and rolled back.
\set ON_ERROR_STOP on
BEGIN;
-- Used exclusively by this rollback-only fixture, never in application code.
-- The owner-role trigger otherwise rejects a synthetic test organisation.
SET LOCAL linkbooks.trusted = 'on';

DO $$
DECLARE
  _u UUID := gen_random_uuid();
  _c UUID := gen_random_uuid();
  _contact UUID := gen_random_uuid();
  _schedule UUID := gen_random_uuid();
  _employee UUID := gen_random_uuid();
  _run_gbp UUID := gen_random_uuid();
  _run_usd UUID := gen_random_uuid();
  _re_gbp UUID := gen_random_uuid();
  _re_usd UUID := gen_random_uuid();
  _slip_gbp UUID := gen_random_uuid();
  _slip_usd UUID := gen_random_uuid();
  _bank UUID;
  _foreign_account UUID;
  _payment UUID := gen_random_uuid();
  _liability UUID;
  _salary_expense UUID;
  _accrual_journal UUID;
  _rpc_payload JSONB;
  _rpc_first JSONB;
  _rpc_second JSONB;
  _reversal JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.oid = 'public.payroll_payments'::regclass
      AND t.tgname = 'payroll_payment_currency_guard_trg' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Payment currency guard trigger missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.oid = 'public.payroll_payment_allocations'::regclass
      AND t.tgname = 'payroll_allocation_currency_guard_trg' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Allocation currency guard trigger missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.payroll_payments'::regclass
      AND t.tgname = 'payroll_clearing_account_currency_guard_trg'
      AND t.tgenabled = 'O' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Clearing account currency guard trigger missing or disabled';
  END IF;
  IF has_function_privilege('authenticated', 'public.payroll_payment_currency_guard()', 'execute')
     OR has_function_privilege('anon', 'public.payroll_payment_currency_guard()', 'execute')
     OR has_function_privilege('authenticated', 'public.payroll_allocation_currency_guard()', 'execute')
     OR has_function_privilege('anon', 'public.payroll_allocation_currency_guard()', 'execute')
     OR has_function_privilege('authenticated', 'public.payroll_clearing_account_currency_guard()', 'execute')
     OR has_function_privilege('anon', 'public.payroll_clearing_account_currency_guard()', 'execute')
  THEN
    RAISE EXCEPTION 'Trigger helpers must not be executable directly by clients';
  END IF;

  INSERT INTO auth.users (id) VALUES (_u);
  INSERT INTO public.companies (
    id, name, country_code, base_currency, fiscal_year_end_month, fiscal_year_end_day,
    timezone, created_by
  ) VALUES (_c, 'Payroll guard test organisation', 'GB', 'GBP', 12, 31, 'UTC', _u);
  INSERT INTO public.company_members (company_id, user_id, role, status)
  VALUES (_c, _u, 'owner', 'active');
  INSERT INTO public.company_tax_settings (company_id) VALUES (_c);

  INSERT INTO public.payroll_settings (
    company_id, enabled, operating_country_code, payroll_currency
  ) VALUES (_c, true, 'GB', 'GBP');

  INSERT INTO public.accounts (
    company_id, code, name, account_type, normal_balance, account_kind
  ) VALUES (_c, 'PAY-BANK', 'Guard test bank', 'asset', 'debit', 'bank')
  RETURNING id INTO _bank;

  -- Accounting prerequisites for a genuine authenticated payment RPC:
  -- active net-pay liability, salary expense and an open posting period.
  INSERT INTO public.accounts
    (company_id, code, name, account_type, normal_balance, account_kind)
  VALUES (_c, 'PAY-LIAB', 'Guard test net-pay liability',
          'liability', 'credit', 'current_liability')
  RETURNING id INTO _liability;

  INSERT INTO public.accounts
    (company_id, code, name, account_type, normal_balance, account_kind)
  VALUES (_c, 'PAY-EXP', 'Guard test salary expense',
          'expense', 'debit', 'expense')
  RETURNING id INTO _salary_expense;

  UPDATE public.payroll_settings
  SET net_pay_liability_account_id = _liability,
      salary_expense_account_id = _salary_expense
  WHERE company_id = _c;

  INSERT INTO public.accounting_periods
    (company_id, name, start_date, end_date, status)
  VALUES (_c, 'Guard test current period', CURRENT_DATE - 1, CURRENT_DATE + 1, 'open');

  -- Database guard 2: bank/GL currency must also match payment currency.
  INSERT INTO public.accounts (
    company_id, code, name, account_type, normal_balance, account_kind, currency_code
  ) VALUES (
    _c, 'PAY-USD', 'Guard foreign-currency GL', 'asset', 'debit',
    'bank', 'USD'
  ) RETURNING id INTO _foreign_account;

  BEGIN
    INSERT INTO public.payroll_payments (
      company_id, payment_date, payment_method, amount_minor, currency,
      clearing_account_id
    ) VALUES (_c, CURRENT_DATE, 'manual', 100, 'GBP', _foreign_account);
    RAISE EXCEPTION 'Foreign clearing GL account unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'Payroll clearing account currency differs%'
    THEN RAISE; END IF;
  END;

  -- A linked bank can be foreign currency while the GL account override is
  -- NULL. The trigger must catch that, too.
  INSERT INTO public.bank_accounts (
    company_id, name, currency_code, gl_account_id
  ) VALUES (_c, 'Foreign linked test bank', 'USD', _bank);

  BEGIN
    INSERT INTO public.payroll_payments (
      company_id, payment_date, payment_method, amount_minor, currency,
      clearing_account_id
    ) VALUES (_c, CURRENT_DATE, 'manual', 100, 'GBP', _bank);
    RAISE EXCEPTION 'Foreign linked bank account unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'Linked bank account currency differs%'
    THEN RAISE; END IF;
  END;

  DELETE FROM public.bank_accounts
  WHERE company_id = _c AND gl_account_id = _bank;

  -- Any non-base currency must fail, including direct inserts that bypass the
  -- application's recordPayrollPayment handler and invoke SQL directly.
  BEGIN
    INSERT INTO public.payroll_payments (
      company_id, payment_date, payment_method, amount_minor,
      currency, clearing_account_id
    ) VALUES (_c, CURRENT_DATE, 'manual', 100, 'USD', _bank);
    RAISE EXCEPTION 'Foreign-currency payroll payment INSERT unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'Payroll payment currency must match%' THEN RAISE; END IF;
  END;

  INSERT INTO public.payroll_payments (
    id, company_id, payment_date, payment_method, amount_minor, currency, clearing_account_id
  ) VALUES (_payment, _c, CURRENT_DATE, 'manual', 200, 'GBP', _bank);

  BEGIN
    UPDATE public.payroll_payments SET currency = 'USD' WHERE id = _payment;
    RAISE EXCEPTION 'Foreign-currency payroll payment UPDATE unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'Payroll payment currency must match%' THEN RAISE; END IF;
  END;

  -- Updating an already posted payment to a different-currency GL account
  -- must be rejected just like inserting a new mismatched payment.
  BEGIN
    UPDATE public.payroll_payments
    SET clearing_account_id = _foreign_account WHERE id = _payment;
    RAISE EXCEPTION 'Foreign clearing GL account UPDATE unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'Payroll clearing account currency differs%'
    THEN RAISE; END IF;
  END;

  -- Use a dedicated synthetic contact number to bypass unrelated
  -- authenticated contact-number allocation during this rollback-only test.
  INSERT INTO public.contacts (id, company_id, kind, name, account_number)
  VALUES (_contact, _c, 'employee', 'Guard test employee contact', 'PG-TEST');
  INSERT INTO public.payroll_pay_schedules (
    id, company_id, name, frequency, anchor_date, is_default, is_active
  ) VALUES (_schedule, _c, 'Guard monthly', 'monthly', '2026-01-01', true, true);
  INSERT INTO public.payroll_employees (
    id, company_id, contact_id, employee_number, first_name, last_name, hire_date,
    payroll_country_code, payroll_currency, pay_schedule_id
  ) VALUES (_employee, _c, _contact, 'GUARD-EMP1', 'Test', 'Employee', '2026-01-01',
            'GB', 'GBP', _schedule);

  INSERT INTO public.payroll_runs (
    id, company_id, run_number, pay_schedule_id, period_start, period_end,
    payment_date, status, currency
  ) VALUES
    (_run_gbp, _c, 'GUARD-RUN1', _schedule, '2026-01-01', '2026-01-31', '2026-02-05', 'posted', 'GBP'),
    (_run_usd, _c, 'GUARD-RUN2', _schedule, '2026-02-01', '2026-02-28', '2026-03-05', 'posted', 'USD');

  INSERT INTO public.payroll_run_employees (
    id, company_id, run_id, employee_id, gross_minor, deductions_minor, net_minor
  ) VALUES
    (_re_gbp, _c, _run_gbp, _employee, 200, 0, 200),
    (_re_usd, _c, _run_usd, _employee, 200, 0, 200);
  INSERT INTO public.payroll_payslips (
    id, company_id, run_id, run_employee_id, employee_id, payslip_number, snapshot
  ) VALUES
    (_slip_gbp, _c, _run_gbp, _re_gbp, _employee, 'GUARD-PS1', '{}'::jsonb),
    (_slip_usd, _c, _run_usd, _re_usd, _employee, 'GUARD-PS2', '{}'::jsonb);

  -- Same-organisation matching-currency allocation remains valid.
  INSERT INTO public.payroll_payment_allocations (
    company_id, payment_id, payslip_id, run_id, run_employee_id, amount_minor
  ) VALUES (_c, _payment, _slip_gbp, _run_gbp, _re_gbp, 50);

  BEGIN
    INSERT INTO public.payroll_payment_allocations (
      company_id, payment_id, payslip_id, run_id, run_employee_id, amount_minor
    ) VALUES (_c, _payment, _slip_usd, _run_usd, _re_usd, 50);
    RAISE EXCEPTION 'Cross-currency payslip allocation unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'Payroll allocation company, run, employee or currency mismatch%'
    THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE public.payroll_payment_allocations
    SET run_id = _run_usd
    WHERE payment_id = _payment AND payslip_id = _slip_gbp;
    RAISE EXCEPTION 'Foreign run reassignment unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'Payroll allocation company, run, employee or currency mismatch%'
    THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE public.payroll_payment_allocations
    SET run_employee_id = _re_usd
    WHERE payment_id = _payment AND payslip_id = _slip_gbp;
    RAISE EXCEPTION 'Foreign run employee reassignment unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'Payroll allocation company, run, employee or currency mismatch%'
    THEN RAISE; END IF;
  END;
  -- Simulate a signed-in company owner for the actual SECURITY DEFINER
  -- posting/replay/reversal RPCs; the identity exists only in this transaction.
  PERFORM set_config('request.jwt.claim.sub', _u::text, true);
  IF auth.uid() IS DISTINCT FROM _u THEN
    RAISE EXCEPTION 'Synthetic test user was not authenticated';
  END IF;

  -- The payment RPC correctly requires a posted payroll run with an
  -- accrual journal. Create a real balanced journal through post_journal.
  _accrual_journal := public.post_journal(jsonb_build_object(
    'company_id', _c,
    'journal_date', CURRENT_DATE,
    'memo', 'Guard test payroll accrual',
    'currency_code', 'GBP',
    'source_type', 'payroll',
    'source_id', _run_gbp,
    'idempotency_key', 'guard-accrual',
    'lines', jsonb_build_array(
      jsonb_build_object('account_id', _salary_expense, 'debit_minor', 200, 'credit_minor', 0),
      jsonb_build_object('account_id', _liability, 'debit_minor', 0, 'credit_minor', 200)
    )
  ));
  UPDATE public.payroll_runs
  SET accrual_journal_id = _accrual_journal WHERE id = _run_gbp;

  _rpc_payload := jsonb_build_object(
    'company_id', _c, 'payment_date', CURRENT_DATE,
    'payment_method', 'manual', 'amount_minor', 125,
    'clearing_account_id', _bank, 'currency_code', 'GBP',
    'reference', 'Guard rpc', 'idempotency_key', 'guard-rpc-retry',
    'allocations', jsonb_build_array(
      jsonb_build_object('payslip_id', _slip_gbp, 'amount_minor', 50)
    )
  );

  _rpc_first := public.record_payroll_payment(_rpc_payload);
  IF (_rpc_first->>'replayed')::boolean IS NOT FALSE
     OR (_rpc_first->>'unallocated_minor')::bigint <> 75 THEN
    RAISE EXCEPTION 'First authenticated settlement did not post with 75 unallocated';
  END IF;
  IF (SELECT amount_paid_minor FROM public.payroll_payslips
      WHERE id = _slip_gbp) <> 50 THEN
    RAISE EXCEPTION 'Payment allocation did not update payslip paid amount';
  END IF;

  -- Exact retry returns the same payment and journal without new GL entries.
  _rpc_second := public.record_payroll_payment(_rpc_payload);
  IF (_rpc_second->>'replayed')::boolean IS NOT TRUE
     OR _rpc_second->>'payment_id' IS DISTINCT FROM _rpc_first->>'payment_id'
     OR _rpc_second->>'journal_id' IS DISTINCT FROM _rpc_first->>'journal_id'
     OR (_rpc_second->>'unallocated_minor')::bigint <> 75 THEN
    RAISE EXCEPTION 'Exact payment retry failed safe idempotent replay';
  END IF;

  BEGIN
    PERFORM public.record_payroll_payment(
      _rpc_payload || '{"amount_minor":126}'::jsonb
    );
    RAISE EXCEPTION 'Changed amount silently replayed original payment';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE 'Payroll idempotency key already used%'
    THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.record_payroll_payment(
      _rpc_payload || jsonb_build_object(
        'allocations', jsonb_build_array(
          jsonb_build_object('payslip_id', _slip_gbp, 'amount_minor', 51)
        )
      )
    );
    RAISE EXCEPTION 'Changed payslip allocation silently replayed original payment';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE 'Payroll idempotency key already used%'
    THEN RAISE; END IF;
  END;

  -- Reject other payload mutations under the same key, including date,
  -- method, clearing account, currency, reference and memo.
  BEGIN
    PERFORM public.record_payroll_payment(
      _rpc_payload || jsonb_build_object('payment_date', CURRENT_DATE + 1)
    );
    RAISE EXCEPTION 'Changed date silently replayed original payment';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE 'Payroll idempotency key already used%'
    THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_payroll_payment(
      _rpc_payload || '{"payment_method":"cheque"}'::jsonb
    );
    RAISE EXCEPTION 'Changed method silently replayed original payment';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE 'Payroll idempotency key already used%'
    THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_payroll_payment(
      _rpc_payload || jsonb_build_object('clearing_account_id', _foreign_account)
    );
    RAISE EXCEPTION 'Changed clearing account silently replayed original payment';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE 'Payroll idempotency key already used%'
    THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_payroll_payment(
      _rpc_payload || '{"currency_code":"USD"}'::jsonb
    );
    RAISE EXCEPTION 'Changed currency silently replayed original payment';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE 'Payroll idempotency key already used%'
    THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_payroll_payment(
      _rpc_payload || '{"reference":"different reference"}'::jsonb
    );
    RAISE EXCEPTION 'Changed reference silently replayed original payment';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE 'Payroll idempotency key already used%'
    THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_payroll_payment(
      _rpc_payload || '{"memo":"different memo"}'::jsonb
    );
    RAISE EXCEPTION 'Changed memo silently replayed original payment';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE 'Payroll idempotency key already used%'
    THEN RAISE; END IF;
  END;

  IF (SELECT COUNT(*) FROM public.payroll_payments
      WHERE company_id = _c AND idempotency_key = 'guard-rpc-retry') <> 1 THEN
    RAISE EXCEPTION 'Idempotency key caused duplicate payments';
  END IF;
  IF (SELECT COUNT(*) FROM public.journals
      WHERE company_id = _c AND idempotency_key = 'guard-rpc-retry:post') <> 1 THEN
    RAISE EXCEPTION 'Idempotency key caused duplicate journal postings';
  END IF;

  -- Reversal should undo allocation and post a reversing journal.
  _reversal := public.reverse_payroll_payment(
    _c, (_rpc_first->>'payment_id')::uuid, CURRENT_DATE
  );
  IF (_reversal->>'reversal_journal_id') IS NULL
     OR (SELECT status FROM public.payroll_payments
         WHERE id = (_rpc_first->>'payment_id')::uuid) IS DISTINCT FROM 'reversed'
  THEN
    RAISE EXCEPTION 'Payment reversal did not complete';
  END IF;
  IF (SELECT amount_paid_minor FROM public.payroll_payslips
      WHERE id = _slip_gbp) <> 0 THEN
    RAISE EXCEPTION 'Reversal did not restore payslip outstanding amount';
  END IF;
  BEGIN
    PERFORM public.record_payroll_payment(_rpc_payload);
    RAISE EXCEPTION 'Reversed payment accepted a reused idempotency key';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE 'Payroll payment was reversed; use a new idempotency key%'
    THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;

SELECT 'Payroll SQL: currency guards, authenticated payment post/replay/collision and reversal passed; all fixtures rolled back.' AS result;
