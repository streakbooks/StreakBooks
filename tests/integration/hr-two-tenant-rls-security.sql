-- HR two-tenant RLS smoke (isolated Postgres only — not production).
-- Verifies company A cannot read company B HR rows under RLS as authenticated member.
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
  emp1 uuid := gen_random_uuid();
  emp2 uuid := gen_random_uuid();
  loc1 uuid;
  loc2 uuid;
  n integer;
BEGIN
  IF to_regclass('public.hr_settings') IS NULL THEN
    RAISE EXCEPTION 'hr_settings missing';
  END IF;

  INSERT INTO auth.users (id) VALUES (u1), (u2);

  INSERT INTO public.companies (
    id, name, country_code, base_currency, fiscal_year_end_month, fiscal_year_end_day, timezone, created_by
  ) VALUES
    (c1, 'HR RLS A', 'GB', 'GBP', 3, 31, 'UTC', u1),
    (c2, 'HR RLS B', 'GB', 'GBP', 3, 31, 'UTC', u2);

  INSERT INTO public.company_tax_settings (company_id) VALUES (c1), (c2);
  INSERT INTO public.company_members (company_id, user_id, role, status) VALUES
    (c1, u1, 'owner', 'active'),
    (c2, u2, 'owner', 'active');

  INSERT INTO public.contacts (id, company_id, kind, name) VALUES
    (contact1, c1, 'supplier', 'HR Emp A'),
    (contact2, c2, 'supplier', 'HR Emp B');

  INSERT INTO public.payroll_employees (
    id, company_id, contact_id, employee_number, first_name, last_name, hire_date, status
  ) VALUES
    (emp1, c1, contact1, 'HR-A-1', 'Ada', 'Alpha', '2026-01-01', 'active'),
    (emp2, c2, contact2, 'HR-B-1', 'Bea', 'Beta', '2026-01-01', 'active');

  INSERT INTO public.hr_settings (company_id, enabled) VALUES (c1, true), (c2, true);

  INSERT INTO public.hr_locations (company_id, code, name) VALUES
    (c1, 'A1', 'Site A'), (c2, 'B1', 'Site B')
  RETURNING id INTO loc1;
  -- second insert return only one; fetch explicitly
  SELECT id INTO loc1 FROM public.hr_locations WHERE company_id = c1 LIMIT 1;
  SELECT id INTO loc2 FROM public.hr_locations WHERE company_id = c2 LIMIT 1;

  INSERT INTO public.hr_employee_profiles (employee_id, company_id, location_id)
  VALUES (emp1, c1, loc1), (emp2, c2, loc2);

  -- As u1, should see only c1 profile via RLS
  PERFORM set_config('request.jwt.claim.sub', u1::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT count(*) INTO n FROM public.hr_employee_profiles WHERE company_id = c2;
  IF n <> 0 THEN
    RAISE EXCEPTION 'Tenant leak: u1 saw % profiles for company B', n;
  END IF;

  SELECT count(*) INTO n FROM public.hr_locations WHERE company_id = c2;
  IF n <> 0 THEN
    RAISE EXCEPTION 'Tenant leak: u1 saw % locations for company B', n;
  END IF;

  SELECT count(*) INTO n FROM public.hr_employee_profiles WHERE company_id = c1;
  IF n < 1 THEN
    RAISE EXCEPTION 'u1 could not see own company profiles';
  END IF;

  -- Direct insert must fail (deny policies)
  BEGIN
    INSERT INTO public.hr_locations (company_id, code, name) VALUES (c1, 'X', 'Blocked');
    RAISE EXCEPTION 'Direct insert into hr_locations should be denied';
  EXCEPTION WHEN insufficient_privilege OR check_violation OR others THEN
    IF SQLERRM LIKE 'Direct insert%' THEN RAISE; END IF;
    -- expected denial path
    NULL;
  END;

  RAISE NOTICE 'hr-two-tenant-rls-ok';
END $$;

ROLLBACK;