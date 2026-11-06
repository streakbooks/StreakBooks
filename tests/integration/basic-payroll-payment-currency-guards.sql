-- Database-level payroll currency guard regression tests.
-- Run against an isolated Postgres instance after the migration is applied.
-- Every fixture is created within a transaction and rolled back.
\set ON_ERROR_STOP on
BEGIN;
-- Used exclusively by this rollback-only fixture, never in application code.
-- The owner-role trigger otherwise rejects a synthetic test organisation.
SET LOCAL linkbooks.trusted = 'on';

DO $
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
  IF has_function_privilege('authenticated', 'public.payroll_payment_currency_guard()', 'execute')
     OR has_function_privilege('anon', 'public.payroll_payment_currency_guard()', 'execute')
     OR has_function_privilege('authenticated', 'public.payroll_allocation_currency_guard()', 'execute')
     OR has_function_privilege('anon', 'public.payroll_allocation_currency_guard()', 'execute')
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
  ) VALUES (_c, 'PAY-GUARD-BANK', 'Guard test bank', 'asset', 'debit', 'bank')
  RETURNING id INTO _bank;

  -- Database guard 2: bank/GL currency must also match payment currency.
  INSERT INTO public.accounts (
    company_id, code, name, account_type, normal_balance, account_kind, currency_code
  ) VALUES (
    _c, 'PAY-GUARD-USD', 'Guard foreign-currency GL', 'asset', 'debit',
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

  INSERT INTO public.contacts (id, company_id, kind, name)
  VALUES (_contact, _c, 'supplier', 'Guard test employee contact');
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
END $$;

ROLLBACK;

SELECT 'Payroll currency guard: valid base-currency payment/allocations succeed; foreign payment, foreign allocation and bad run update all rejected; fixtures rolled back.' AS result;
