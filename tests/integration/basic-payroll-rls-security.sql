-- Basic Global Payroll Batch 7: multi-tenant RLS and payment-detail boundary smoke.
-- Run against an isolated Postgres with StreakBooks migrations applied (not production).
\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  c1 uuid := gen_random_uuid();
  c2 uuid := gen_random_uuid();
  contact1 uuid := gen_random_uuid();
  contact2 uuid := gen_random_uuid();
  schedule1 uuid := gen_random_uuid();
  schedule2 uuid := gen_random_uuid();
  emp1 uuid := gen_random_uuid();
  emp2 uuid := gen_random_uuid();
  run1 uuid := gen_random_uuid();
  run2 uuid := gen_random_uuid();
  re1 uuid := gen_random_uuid();
  re2 uuid := gen_random_uuid();
  slip1 uuid := gen_random_uuid();
  slip2 uuid := gen_random_uuid();
  page jsonb;
  n integer;
BEGIN
  IF to_regclass('public.payroll_employees') IS NULL THEN
    RAISE EXCEPTION 'payroll_employees missing — apply basic global payroll migrations first';
  END IF;

  INSERT INTO auth.users (id) VALUES (u1), (u2);

  INSERT INTO public.companies (
    id, name, country_code, base_currency, fiscal_year_end_month, fiscal_year_end_day, timezone, created_by
  ) VALUES
    (c1, 'Payroll RLS A', 'GB', 'GBP', 3, 31, 'UTC', u1),
    (c2, 'Payroll RLS B', 'GB', 'GBP', 3, 31, 'UTC', u2);

  INSERT INTO public.company_tax_settings (company_id) VALUES (c1), (c2);

  INSERT INTO public.company_members (company_id, user_id, role, status) VALUES
    (c1, u1, 'owner', 'active'),
    (c2, u2, 'owner', 'active');

  INSERT INTO public.contacts (id, company_id, kind, name) VALUES
    (contact1, c1, 'supplier', 'Employee contact A'),
    (contact2, c2, 'supplier', 'Employee contact B');

  INSERT INTO public.payroll_settings (company_id, enabled, operating_country_code, payroll_currency)
  VALUES
    (c1, true, 'GB', 'GBP'),
    (c2, true, 'GB', 'GBP');

  INSERT INTO public.payroll_pay_schedules (
    id, company_id, name, frequency, anchor_date, is_default, is_active
  ) VALUES
    (schedule1, c1, 'Monthly', 'monthly', '2026-01-31', true, true),
    (schedule2, c2, 'Monthly', 'monthly', '2026-01-31', true, true);

  INSERT INTO public.payroll_employees (
    id, company_id, contact_id, employee_number, first_name, last_name, hire_date,
    payroll_country_code, payroll_currency, pay_schedule_id
  ) VALUES
    (emp1, c1, contact1, 'E-RLS-A', 'Alex', 'Alpha', '2026-01-01', 'GB', 'GBP', schedule1),
    (emp2, c2, contact2, 'E-RLS-B', 'Blake', 'Beta', '2026-01-01', 'GB', 'GBP', schedule2);

  INSERT INTO public.payroll_employee_payment_details (
    employee_id, company_id, account_name, bank_name, account_number, sort_code
  ) VALUES
    (emp1, c1, 'Alex Alpha', 'Test Bank', '12345678', '12-34-56'),
    (emp2, c2, 'Blake Beta', 'Other Bank', '87654321', '65-43-21');

  INSERT INTO public.payroll_runs (
    id, company_id, run_number, pay_schedule_id, period_start, period_end, payment_date,
    status, currency
  ) VALUES
    (run1, c1, 'RUN-RLS-A', schedule1, '2026-01-01', '2026-01-31', '2026-02-05', 'approved', 'GBP'),
    (run2, c2, 'RUN-RLS-B', schedule2, '2026-01-01', '2026-01-31', '2026-02-05', 'approved', 'GBP');

  INSERT INTO public.payroll_run_employees (
    id, company_id, run_id, employee_id, gross_minor, deductions_minor, net_minor
  ) VALUES
    (re1, c1, run1, emp1, 100000, 0, 100000),
    (re2, c2, run2, emp2, 200000, 0, 200000);

  INSERT INTO public.payroll_payslips (
    id, company_id, run_id, run_employee_id, employee_id, payslip_number, snapshot
  ) VALUES
    (
      slip1, c1, run1, re1, emp1, 'PS-A-001',
      jsonb_build_object('version', 1, 'lines', '[]'::jsonb, 'totals', jsonb_build_object('net_minor', 100000))
    ),
    (
      slip2, c2, run2, re2, emp2, 'PS-B-001',
      jsonb_build_object('version', 1, 'lines', '[]'::jsonb, 'totals', jsonb_build_object('net_minor', 200000))
    );

  PERFORM set_config('test.payroll.u1', u1::text, true);
  PERFORM set_config('test.payroll.u2', u2::text, true);
  PERFORM set_config('test.payroll.c1', c1::text, true);
  PERFORM set_config('test.payroll.c2', c2::text, true);
  PERFORM set_config('test.payroll.emp1', emp1::text, true);
  PERFORM set_config('test.payroll.emp2', emp2::text, true);
  PERFORM set_config('test.payroll.slip1', slip1::text, true);
  PERFORM set_config('test.payroll.slip2', slip2::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', current_setting('test.payroll.u1'), 'role', 'authenticated')::text,
  true
);

DO $$
DECLARE
  c1 uuid := current_setting('test.payroll.c1')::uuid;
  c2 uuid := current_setting('test.payroll.c2')::uuid;
  emp1 uuid := current_setting('test.payroll.emp1')::uuid;
  emp2 uuid := current_setting('test.payroll.emp2')::uuid;
  slip1 uuid := current_setting('test.payroll.slip1')::uuid;
  slip2 uuid := current_setting('test.payroll.slip2')::uuid;
  page jsonb;
  n integer;
BEGIN
  SELECT count(*) INTO n FROM public.payroll_employee_payment_details;
  IF n <> 0 THEN
    RAISE EXCEPTION 'authenticated can SELECT full payment details (count=%)', n;
  END IF;

  SELECT count(*) INTO n FROM public.payroll_employees WHERE company_id = c1;
  IF n <> 1 THEN RAISE EXCEPTION 'Member cannot read own payroll employees'; END IF;

  SELECT count(*) INTO n FROM public.payroll_employees WHERE company_id = c2;
  IF n <> 0 THEN RAISE EXCEPTION 'Cross-tenant payroll employee leak'; END IF;

  SELECT count(*) INTO n FROM public.payroll_payslips WHERE company_id = c1;
  IF n <> 1 THEN RAISE EXCEPTION 'Member cannot read own payslips'; END IF;

  SELECT count(*) INTO n FROM public.payroll_payslips WHERE id = slip2;
  IF n <> 0 THEN RAISE EXCEPTION 'Cross-tenant payslip leak via direct SELECT'; END IF;

  page := public.get_payroll_employee_page(c1, emp1);
  IF page->'payment'->>'account_number' IS NOT NULL THEN
    RAISE EXCEPTION 'Employee page returned raw account_number';
  END IF;
  IF coalesce(page->'payment'->>'account_number_masked', '') = '12345678' THEN
    RAISE EXCEPTION 'Employee page returned unmasked account number';
  END IF;

  BEGIN
    PERFORM public.get_payroll_employee_page(c2, emp2);
    RAISE EXCEPTION 'Cross-tenant get_payroll_employee_page succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%member%' AND SQLERRM NOT LIKE '%not found%' AND SQLERRM NOT LIKE '%permission%' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    PERFORM public.get_payroll_payslip(c2, slip2);
    RAISE EXCEPTION 'Cross-tenant get_payroll_payslip succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%member%' AND SQLERRM NOT LIKE '%not found%' AND SQLERRM NOT LIKE '%permission%' THEN
      RAISE;
    END IF;
  END;

  IF public.get_payroll_payslip(c1, slip1) IS NULL THEN
    RAISE EXCEPTION 'Own payslip RPC failed';
  END IF;
END $$;

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', current_setting('test.payroll.u2'), 'role', 'authenticated')::text,
  true
);

DO $$
DECLARE
  c1 uuid := current_setting('test.payroll.c1')::uuid;
  slip1 uuid := current_setting('test.payroll.slip1')::uuid;
  n integer;
BEGIN
  SELECT count(*) INTO n FROM public.payroll_payslips WHERE company_id = c1;
  IF n <> 0 THEN RAISE EXCEPTION 'Tenant B can read tenant A payslips'; END IF;

  IF EXISTS (SELECT 1 FROM public.payroll_payslips WHERE id = slip1) THEN
    RAISE EXCEPTION 'Tenant B can read tenant A payslip by id';
  END IF;
END $$;

RESET ROLE;
ROLLBACK;

SELECT 'Basic Global Payroll: payment-detail SELECT block, masked RPC, and two-tenant payslip/employee RLS passed; rolled back.' AS result;
