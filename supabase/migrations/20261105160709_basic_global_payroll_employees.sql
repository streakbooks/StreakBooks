-- Basic Global Payroll Batch 2: employees, payment details and salary structures.
--
-- Requires 20261105153212 (payroll settings, schedules, component types).
--
-- Rules
--  * Clients SELECT only; writes go through SECURITY DEFINER RPCs.
--  * Employee banking details are never returned in full — only masked via RPC.
--  * Employees are never hard-deleted; archive / terminate only.
--  * Salary history is effective-dated; closing a period sets effective_to.
--  * Amounts are integer minor units.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  employee_number TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'terminated')),
  hire_date DATE NOT NULL,
  termination_date DATE,
  department TEXT,
  designation TEXT,
  employment_type TEXT NOT NULL DEFAULT 'salaried'
    CHECK (employment_type IN ('salaried', 'hourly', 'contractor', 'other')),
  work_location TEXT,
  payroll_country_code TEXT NOT NULL CHECK (payroll_country_code ~ '^[A-Z]{2}$'),
  payroll_currency TEXT NOT NULL CHECK (payroll_currency ~ '^[A-Z]{3}$'),
  pay_schedule_id UUID REFERENCES public.payroll_pay_schedules(id) ON DELETE SET NULL,
  salary_structure_id UUID,
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer'
    CHECK (payment_method IN ('bank_transfer', 'cash', 'cheque', 'other')),
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_employees_number_len CHECK (char_length(trim(employee_number)) BETWEEN 1 AND 40),
  CONSTRAINT payroll_employees_name_len CHECK (
    char_length(trim(first_name)) BETWEEN 1 AND 80
    AND char_length(trim(last_name)) BETWEEN 1 AND 80
  ),
  CONSTRAINT payroll_employees_email_len CHECK (email IS NULL OR char_length(email) <= 254),
  CONSTRAINT payroll_employees_term_order CHECK (
    termination_date IS NULL OR termination_date >= hire_date
  ),
  CONSTRAINT payroll_employees_terminated_status CHECK (
    (status = 'terminated' AND termination_date IS NOT NULL)
    OR (status <> 'terminated')
  ),
  CONSTRAINT payroll_employees_company_number_uniq UNIQUE (company_id, employee_number),
  CONSTRAINT payroll_employees_company_contact_uniq UNIQUE (company_id, contact_id)
);

CREATE INDEX IF NOT EXISTS payroll_employees_company_status_idx
  ON public.payroll_employees (company_id, status, employee_number);
CREATE INDEX IF NOT EXISTS payroll_employees_company_name_idx
  ON public.payroll_employees (company_id, lower(last_name), lower(first_name));

CREATE TABLE IF NOT EXISTS public.payroll_employee_payment_details (
  employee_id UUID PRIMARY KEY REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_name TEXT,
  bank_name TEXT,
  account_number TEXT,
  sort_code TEXT,
  iban TEXT,
  bic TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_employee_payment_sort_code CHECK (
    sort_code IS NULL OR sort_code ~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}$'
  ),
  CONSTRAINT payroll_employee_payment_account_number CHECK (
    account_number IS NULL OR account_number ~ '^[0-9A-Z]{4,34}$'
  ),
  CONSTRAINT payroll_employee_payment_bic CHECK (
    bic IS NULL OR bic ~ '^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$'
  ),
  CONSTRAINT payroll_employee_payment_iban CHECK (
    iban IS NULL OR public.is_valid_iban(iban)
  )
);

CREATE TABLE IF NOT EXISTS public.payroll_salary_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_salary_structures_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_salary_structures_company_name_uidx
  ON public.payroll_salary_structures (company_id, lower(name));

ALTER TABLE public.payroll_employees
  DROP CONSTRAINT IF EXISTS payroll_employees_structure_fk;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payroll_employees_structure_fk'
  ) THEN
    ALTER TABLE public.payroll_employees
      ADD CONSTRAINT payroll_employees_structure_fk
      FOREIGN KEY (salary_structure_id)
      REFERENCES public.payroll_salary_structures(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.payroll_salary_structure_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  structure_id UUID NOT NULL REFERENCES public.payroll_salary_structures(id) ON DELETE CASCADE,
  component_type_id UUID NOT NULL REFERENCES public.payroll_component_types(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (amount_minor >= 0 AND amount_minor <= 900000000000000),
  rate_minor BIGINT NOT NULL DEFAULT 0 CHECK (rate_minor >= 0 AND rate_minor <= 900000000000000),
  percentage_bps INTEGER NOT NULL DEFAULT 0 CHECK (percentage_bps BETWEEN 0 AND 1000000),
  is_recurring BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 100000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_salary_structure_lines_uniq UNIQUE (structure_id, component_type_id)
);

CREATE TABLE IF NOT EXISTS public.payroll_employee_salary_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  structure_id UUID REFERENCES public.payroll_salary_structures(id) ON DELETE SET NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  change_reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_employee_salary_versions_range CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

CREATE INDEX IF NOT EXISTS payroll_employee_salary_versions_emp_idx
  ON public.payroll_employee_salary_versions (employee_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS public.payroll_employee_salary_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.payroll_employee_salary_versions(id) ON DELETE CASCADE,
  component_type_id UUID NOT NULL REFERENCES public.payroll_component_types(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (amount_minor >= 0 AND amount_minor <= 900000000000000),
  rate_minor BIGINT NOT NULL DEFAULT 0 CHECK (rate_minor >= 0 AND rate_minor <= 900000000000000),
  percentage_bps INTEGER NOT NULL DEFAULT 0 CHECK (percentage_bps BETWEEN 0 AND 1000000),
  is_recurring BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE NOT NULL,
  effective_to DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_employee_salary_lines_range CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  ),
  CONSTRAINT payroll_employee_salary_lines_uniq UNIQUE (version_id, component_type_id)
);

CREATE INDEX IF NOT EXISTS payroll_employee_salary_lines_emp_idx
  ON public.payroll_employee_salary_lines (employee_id, effective_from DESC);

ALTER TABLE public.payroll_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_employee_payment_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_salary_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_salary_structure_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_employee_salary_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_employee_salary_lines ENABLE ROW LEVEL SECURITY;

-- Payment details: no direct SELECT of full identifiers for authenticated clients.
DROP POLICY IF EXISTS "Payroll viewers can read employees" ON public.payroll_employees;
CREATE POLICY "Payroll viewers can read employees" ON public.payroll_employees
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'payroll.view')
  );

DROP POLICY IF EXISTS "No direct read of employee payment details" ON public.payroll_employee_payment_details;
CREATE POLICY "No direct read of employee payment details" ON public.payroll_employee_payment_details
  FOR SELECT TO authenticated
  USING (false);

DROP POLICY IF EXISTS "Payroll viewers can read salary structures" ON public.payroll_salary_structures;
CREATE POLICY "Payroll viewers can read salary structures" ON public.payroll_salary_structures
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'payroll.view')
  );

DROP POLICY IF EXISTS "Payroll viewers can read structure lines" ON public.payroll_salary_structure_lines;
CREATE POLICY "Payroll viewers can read structure lines" ON public.payroll_salary_structure_lines
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'payroll.view')
  );

DROP POLICY IF EXISTS "Payroll viewers can read salary versions" ON public.payroll_employee_salary_versions;
CREATE POLICY "Payroll viewers can read salary versions" ON public.payroll_employee_salary_versions
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'payroll.view')
  );

DROP POLICY IF EXISTS "Payroll viewers can read salary lines" ON public.payroll_employee_salary_lines;
CREATE POLICY "Payroll viewers can read salary lines" ON public.payroll_employee_salary_lines
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'payroll.view')
  );

REVOKE ALL ON
  public.payroll_employees,
  public.payroll_employee_payment_details,
  public.payroll_salary_structures,
  public.payroll_salary_structure_lines,
  public.payroll_employee_salary_versions,
  public.payroll_employee_salary_lines
FROM PUBLIC, anon;

GRANT SELECT ON
  public.payroll_employees,
  public.payroll_salary_structures,
  public.payroll_salary_structure_lines,
  public.payroll_employee_salary_versions,
  public.payroll_employee_salary_lines
TO authenticated;
-- payment details: no GRANT SELECT

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payroll_allocate_employee_number(_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prefix TEXT;
  _next INTEGER;
  _candidate TEXT;
BEGIN
  INSERT INTO public.payroll_settings (
    company_id, operating_country_code, payroll_currency
  )
  SELECT c.id, c.country_code, c.base_currency
  FROM public.companies c
  WHERE c.id = _company_id
  ON CONFLICT (company_id) DO NOTHING;

  UPDATE public.payroll_settings
  SET next_employee_number = next_employee_number + 1,
      updated_at = now()
  WHERE company_id = _company_id
  RETURNING employee_number_prefix, next_employee_number - 1
  INTO _prefix, _next;

  IF _next IS NULL THEN
    RAISE EXCEPTION 'Payroll settings are missing for this organisation';
  END IF;

  _candidate := _prefix || lpad(_next::TEXT, 4, '0');
  WHILE EXISTS (
    SELECT 1 FROM public.payroll_employees
    WHERE company_id = _company_id AND employee_number = _candidate
  ) LOOP
    UPDATE public.payroll_settings
    SET next_employee_number = next_employee_number + 1, updated_at = now()
    WHERE company_id = _company_id
    RETURNING employee_number_prefix, next_employee_number - 1
    INTO _prefix, _next;
    _candidate := _prefix || lpad(_next::TEXT, 4, '0');
  END LOOP;

  RETURN _candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_allocate_employee_number(UUID) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.payroll_close_open_salary_version(
  _company_id UUID,
  _employee_id UUID,
  _day_before DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.payroll_employee_salary_versions
  SET effective_to = _day_before
  WHERE company_id = _company_id
    AND employee_id = _employee_id
    AND effective_to IS NULL
    AND effective_from <= _day_before;

  UPDATE public.payroll_employee_salary_lines
  SET effective_to = _day_before
  WHERE company_id = _company_id
    AND employee_id = _employee_id
    AND effective_to IS NULL
    AND effective_from <= _day_before;
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_close_open_salary_version(UUID, UUID, DATE) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- Employee RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_payroll_employees(
  _company_id UUID,
  _status TEXT DEFAULT NULL,
  _q TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rows JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.view') THEN
    RAISE EXCEPTION 'You do not have permission to view payroll';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.employee_number), '[]'::jsonb)
  INTO _rows
  FROM public.payroll_employees e
  WHERE e.company_id = _company_id
    AND (_status IS NULL OR e.status = _status)
    AND (
      _q IS NULL OR btrim(_q) = '' OR
      e.employee_number ILIKE '%' || btrim(_q) || '%' OR
      e.first_name ILIKE '%' || btrim(_q) || '%' OR
      e.last_name ILIKE '%' || btrim(_q) || '%' OR
      COALESCE(e.email, '') ILIKE '%' || btrim(_q) || '%' OR
      COALESCE(e.department, '') ILIKE '%' || btrim(_q) || '%' OR
      COALESCE(e.designation, '') ILIKE '%' || btrim(_q) || '%'
    );

  RETURN jsonb_build_object('employees', _rows);
END;
$$;

REVOKE ALL ON FUNCTION public.list_payroll_employees(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_payroll_employees(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_payroll_employee_page(_company_id UUID, _employee_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _employee public.payroll_employees%ROWTYPE;
  _payment JSONB;
  _versions JSONB;
  _lines JSONB;
  _structures JSONB;
  _schedules JSONB;
  _components JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.view') THEN
    RAISE EXCEPTION 'You do not have permission to view payroll';
  END IF;

  SELECT * INTO _employee
  FROM public.payroll_employees
  WHERE id = _employee_id AND company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;

  SELECT jsonb_build_object(
    'account_name', d.account_name,
    'bank_name', d.bank_name,
    'account_number_masked', public.ops_mask_identifier(d.account_number, 4),
    'sort_code_masked', CASE WHEN d.sort_code IS NULL THEN NULL ELSE '••-••-' || right(d.sort_code, 2) END,
    'iban_masked', public.ops_mask_identifier(d.iban, 4),
    'bic', d.bic,
    'has_account_number', d.account_number IS NOT NULL,
    'has_sort_code', d.sort_code IS NOT NULL,
    'has_iban', d.iban IS NOT NULL
  )
  INTO _payment
  FROM public.payroll_employee_payment_details d
  WHERE d.employee_id = _employee_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.effective_from DESC), '[]'::jsonb)
  INTO _versions
  FROM public.payroll_employee_salary_versions v
  WHERE v.employee_id = _employee_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.effective_from DESC, l.component_type_id), '[]'::jsonb)
  INTO _lines
  FROM public.payroll_employee_salary_lines l
  WHERE l.employee_id = _employee_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY lower(s.name)), '[]'::jsonb)
  INTO _structures
  FROM public.payroll_salary_structures s
  WHERE s.company_id = _company_id AND s.is_active;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.is_default DESC, lower(s.name)), '[]'::jsonb)
  INTO _schedules
  FROM public.payroll_pay_schedules s
  WHERE s.company_id = _company_id AND s.is_active;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.sort_order, lower(c.code)), '[]'::jsonb)
  INTO _components
  FROM public.payroll_component_types c
  WHERE c.company_id = _company_id AND c.is_active;

  RETURN jsonb_build_object(
    'employee', to_jsonb(_employee),
    'payment', _payment,
    'salary_versions', _versions,
    'salary_lines', _lines,
    'structures', _structures,
    'schedules', _schedules,
    'components', _components
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_payroll_employee_page(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payroll_employee_page(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_payroll_employee(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _contact_id UUID;
  _settings public.payroll_settings%ROWTYPE;
  _company RECORD;
  _first TEXT;
  _last TEXT;
  _email TEXT;
  _hire DATE;
  _term DATE;
  _status TEXT;
  _department TEXT;
  _designation TEXT;
  _employment TEXT;
  _location TEXT;
  _country TEXT;
  _currency TEXT;
  _schedule UUID;
  _structure UUID;
  _method TEXT;
  _notes TEXT;
  _number TEXT;
  _display_name TEXT;
  _row public.payroll_employees%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.employees.manage') THEN
    RAISE EXCEPTION 'You do not have permission to manage payroll employees';
  END IF;

  SELECT id, country_code, base_currency INTO _company
  FROM public.companies WHERE id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organisation not found'; END IF;

  SELECT * INTO _settings FROM public.payroll_settings WHERE company_id = _company_id;
  IF NOT FOUND THEN
    INSERT INTO public.payroll_settings (company_id, operating_country_code, payroll_currency)
    VALUES (_company_id, _company.country_code, _company.base_currency)
    RETURNING * INTO _settings;
  END IF;
  PERFORM public.payroll_seed_default_components(_company_id);

  _id := NULLIF(_payload->>'id', '')::UUID;
  _first := trim(COALESCE(_payload->>'first_name', ''));
  _last := trim(COALESCE(_payload->>'last_name', ''));
  _email := NULLIF(lower(trim(COALESCE(_payload->>'email', ''))), '');
  _hire := NULLIF(_payload->>'hire_date', '')::DATE;
  _term := NULLIF(_payload->>'termination_date', '')::DATE;
  _status := COALESCE(_payload->>'status', 'active');
  _department := NULLIF(trim(COALESCE(_payload->>'department', '')), '');
  _designation := NULLIF(trim(COALESCE(_payload->>'designation', '')), '');
  _employment := COALESCE(_payload->>'employment_type', 'salaried');
  _location := NULLIF(trim(COALESCE(_payload->>'work_location', '')), '');
  _country := upper(trim(COALESCE(_payload->>'payroll_country_code', _settings.operating_country_code)));
  _currency := upper(trim(COALESCE(_payload->>'payroll_currency', _settings.payroll_currency)));
  _schedule := NULLIF(_payload->>'pay_schedule_id', '')::UUID;
  _structure := NULLIF(_payload->>'salary_structure_id', '')::UUID;
  _method := COALESCE(_payload->>'payment_method', 'bank_transfer');
  _notes := NULLIF(trim(COALESCE(_payload->>'notes', '')), '');
  _number := NULLIF(trim(COALESCE(_payload->>'employee_number', '')), '');
  _display_name := btrim(_first || ' ' || _last);

  IF char_length(_first) < 1 OR char_length(_last) < 1 THEN
    RAISE EXCEPTION 'First and last name are required';
  END IF;
  IF _hire IS NULL THEN RAISE EXCEPTION 'Hire date is required'; END IF;
  IF _status NOT IN ('active', 'archived', 'terminated') THEN
    RAISE EXCEPTION 'Unsupported employee status';
  END IF;
  IF _status = 'terminated' AND _term IS NULL THEN
    RAISE EXCEPTION 'Termination date is required when status is terminated';
  END IF;
  IF _term IS NOT NULL AND _term < _hire THEN
    RAISE EXCEPTION 'Termination date cannot be before hire date';
  END IF;
  IF _employment NOT IN ('salaried', 'hourly', 'contractor', 'other') THEN
    RAISE EXCEPTION 'Unsupported employment type';
  END IF;
  IF _country !~ '^[A-Z]{2}$' OR _currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Payroll country/currency codes are invalid';
  END IF;
  IF _method NOT IN ('bank_transfer', 'cash', 'cheque', 'other') THEN
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;
  IF _schedule IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.payroll_pay_schedules
    WHERE id = _schedule AND company_id = _company_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Pay schedule not found';
  END IF;
  IF _structure IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.payroll_salary_structures
    WHERE id = _structure AND company_id = _company_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Salary structure not found';
  END IF;

  IF _id IS NULL THEN
    IF _number IS NULL THEN
      _number := public.payroll_allocate_employee_number(_company_id);
    ELSIF EXISTS (
      SELECT 1 FROM public.payroll_employees
      WHERE company_id = _company_id AND employee_number = _number
    ) THEN
      RAISE EXCEPTION 'Employee ID already exists in this organisation';
    END IF;

    INSERT INTO public.contacts (
      company_id, name, kind, email, is_active, notes
    ) VALUES (
      _company_id, _display_name, 'employee', _email, _status = 'active', _notes
    )
    RETURNING id INTO _contact_id;

    INSERT INTO public.payroll_employees (
      company_id, contact_id, employee_number, first_name, last_name, email, status,
      hire_date, termination_date, department, designation, employment_type, work_location,
      payroll_country_code, payroll_currency, pay_schedule_id, salary_structure_id,
      payment_method, notes, archived_at, created_by
    ) VALUES (
      _company_id, _contact_id, _number, _first, _last, _email, _status,
      _hire, _term, _department, _designation, _employment, _location,
      _country, _currency, _schedule, _structure, _method, _notes,
      CASE WHEN _status = 'archived' THEN now() ELSE NULL END,
      auth.uid()
    )
    RETURNING * INTO _row;
  ELSE
    SELECT * INTO _row FROM public.payroll_employees
    WHERE id = _id AND company_id = _company_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;

    IF _number IS NOT NULL AND _number <> _row.employee_number AND EXISTS (
      SELECT 1 FROM public.payroll_employees
      WHERE company_id = _company_id AND employee_number = _number AND id <> _id
    ) THEN
      RAISE EXCEPTION 'Employee ID already exists in this organisation';
    END IF;

    UPDATE public.payroll_employees SET
      employee_number = COALESCE(_number, employee_number),
      first_name = _first,
      last_name = _last,
      email = _email,
      status = _status,
      hire_date = _hire,
      termination_date = _term,
      department = _department,
      designation = _designation,
      employment_type = _employment,
      work_location = _location,
      payroll_country_code = _country,
      payroll_currency = _currency,
      pay_schedule_id = _schedule,
      salary_structure_id = _structure,
      payment_method = _method,
      notes = _notes,
      archived_at = CASE
        WHEN _status = 'archived' THEN COALESCE(archived_at, now())
        ELSE NULL
      END,
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;

    UPDATE public.contacts SET
      name = _display_name,
      email = _email,
      notes = _notes,
      is_active = (_status = 'active'),
      archived_at = CASE WHEN _status = 'archived' THEN COALESCE(archived_at, now()) ELSE NULL END,
      updated_at = now()
    WHERE id = _row.contact_id AND company_id = _company_id;
  END IF;

  PERFORM public.record_audit_event(
    _company_id,
    'payroll.employee.saved',
    'payroll_employee',
    _row.id::TEXT,
    jsonb_build_object(
      'employee_number', _row.employee_number,
      'status', _row.status,
      'hire_date', _row.hire_date
    )
  );

  RETURN to_jsonb(_row);
END;
$$;

REVOKE ALL ON FUNCTION public.save_payroll_employee(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_payroll_employee(UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_payroll_employee_payment_details(
  _company_id UUID,
  _employee_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cur public.payroll_employee_payment_details%ROWTYPE;
  _account_name TEXT;
  _bank_name TEXT;
  _account_number TEXT;
  _sort_code TEXT;
  _iban TEXT;
  _bic TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.employees.manage') THEN
    RAISE EXCEPTION 'You do not have permission to manage payroll employees';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.payroll_employees WHERE id = _employee_id AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  SELECT * INTO _cur FROM public.payroll_employee_payment_details WHERE employee_id = _employee_id;

  _account_name := COALESCE(NULLIF(trim(COALESCE(_payload->>'account_name', '')), ''), _cur.account_name);
  _bank_name := COALESCE(NULLIF(trim(COALESCE(_payload->>'bank_name', '')), ''), _cur.bank_name);
  _account_number := CASE
    WHEN _payload ? 'account_number' AND NULLIF(trim(COALESCE(_payload->>'account_number', '')), '') IS NULL THEN NULL
    WHEN NULLIF(trim(COALESCE(_payload->>'account_number', '')), '') IS NOT NULL
      THEN upper(regexp_replace(trim(_payload->>'account_number'), '[\s-]', '', 'g'))
    ELSE _cur.account_number
  END;
  _sort_code := CASE
    WHEN _payload ? 'sort_code' AND NULLIF(trim(COALESCE(_payload->>'sort_code', '')), '') IS NULL THEN NULL
    WHEN NULLIF(trim(COALESCE(_payload->>'sort_code', '')), '') IS NOT NULL THEN
      (
        SELECT substring(digits, 1, 2) || '-' || substring(digits, 3, 2) || '-' || substring(digits, 5, 2)
        FROM (SELECT regexp_replace(trim(_payload->>'sort_code'), '[\s-]', '', 'g') AS digits) s
        WHERE digits ~ '^\d{6}$'
      )
    ELSE _cur.sort_code
  END;
  IF _payload ? 'sort_code'
     AND NULLIF(trim(COALESCE(_payload->>'sort_code', '')), '') IS NOT NULL
     AND _sort_code IS NULL THEN
    RAISE EXCEPTION 'Sort code must be 6 digits';
  END IF;
  _iban := CASE
    WHEN _payload ? 'iban' AND NULLIF(trim(COALESCE(_payload->>'iban', '')), '') IS NULL THEN NULL
    WHEN NULLIF(trim(COALESCE(_payload->>'iban', '')), '') IS NOT NULL
      THEN upper(regexp_replace(trim(_payload->>'iban'), '\s', '', 'g'))
    ELSE _cur.iban
  END;
  _bic := CASE
    WHEN _payload ? 'bic' AND NULLIF(trim(COALESCE(_payload->>'bic', '')), '') IS NULL THEN NULL
    WHEN NULLIF(trim(COALESCE(_payload->>'bic', '')), '') IS NOT NULL
      THEN upper(regexp_replace(trim(_payload->>'bic'), '\s', '', 'g'))
    ELSE _cur.bic
  END;

  INSERT INTO public.payroll_employee_payment_details AS d (
    employee_id, company_id, account_name, bank_name, account_number, sort_code, iban, bic, updated_at
  ) VALUES (
    _employee_id, _company_id, _account_name, _bank_name, _account_number, _sort_code, _iban, _bic, now()
  )
  ON CONFLICT (employee_id) DO UPDATE SET
    account_name = EXCLUDED.account_name,
    bank_name = EXCLUDED.bank_name,
    account_number = EXCLUDED.account_number,
    sort_code = EXCLUDED.sort_code,
    iban = EXCLUDED.iban,
    bic = EXCLUDED.bic,
    updated_at = now()
  RETURNING * INTO _cur;

  PERFORM public.record_audit_event(
    _company_id,
    'payroll.employee.payment_details.saved',
    'payroll_employee',
    _employee_id::TEXT,
    jsonb_build_object(
      'has_account_number', _cur.account_number IS NOT NULL,
      'has_iban', _cur.iban IS NOT NULL
    )
  );

  RETURN jsonb_build_object(
    'account_name', _cur.account_name,
    'bank_name', _cur.bank_name,
    'account_number_masked', public.ops_mask_identifier(_cur.account_number, 4),
    'sort_code_masked', CASE WHEN _cur.sort_code IS NULL THEN NULL ELSE '••-••-' || right(_cur.sort_code, 2) END,
    'iban_masked', public.ops_mask_identifier(_cur.iban, 4),
    'bic', _cur.bic,
    'has_account_number', _cur.account_number IS NOT NULL,
    'has_sort_code', _cur.sort_code IS NOT NULL,
    'has_iban', _cur.iban IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_payroll_employee_payment_details(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_payroll_employee_payment_details(UUID, UUID, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- Salary structure RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_payroll_salary_structures(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _structures JSONB;
  _lines JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.view') THEN
    RAISE EXCEPTION 'You do not have permission to view payroll';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY lower(s.name)), '[]'::jsonb)
  INTO _structures
  FROM public.payroll_salary_structures s
  WHERE s.company_id = _company_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.sort_order, l.component_type_id), '[]'::jsonb)
  INTO _lines
  FROM public.payroll_salary_structure_lines l
  WHERE l.company_id = _company_id;

  RETURN jsonb_build_object('structures', _structures, 'lines', _lines);
END;
$$;

REVOKE ALL ON FUNCTION public.list_payroll_salary_structures(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_payroll_salary_structures(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_payroll_salary_structure(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _name TEXT;
  _description TEXT;
  _active BOOLEAN;
  _lines JSONB;
  _line JSONB;
  _component UUID;
  _row public.payroll_salary_structures%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.employees.manage') THEN
    RAISE EXCEPTION 'You do not have permission to manage payroll employees';
  END IF;

  _id := NULLIF(_payload->>'id', '')::UUID;
  _name := trim(COALESCE(_payload->>'name', ''));
  _description := NULLIF(trim(COALESCE(_payload->>'description', '')), '');
  _active := COALESCE((_payload->>'is_active')::BOOLEAN, true);
  _lines := COALESCE(_payload->'lines', '[]'::jsonb);

  IF char_length(_name) < 1 OR char_length(_name) > 120 THEN
    RAISE EXCEPTION 'Salary structure name is required';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.payroll_salary_structures (company_id, name, description, is_active)
    VALUES (_company_id, _name, _description, _active)
    RETURNING * INTO _row;
  ELSE
    UPDATE public.payroll_salary_structures SET
      name = _name,
      description = _description,
      is_active = _active,
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Salary structure not found'; END IF;
    DELETE FROM public.payroll_salary_structure_lines
    WHERE structure_id = _row.id AND company_id = _company_id;
  END IF;

  FOR _line IN SELECT * FROM jsonb_array_elements(_lines)
  LOOP
    _component := NULLIF(_line->>'component_type_id', '')::UUID;
    IF _component IS NULL THEN
      RAISE EXCEPTION 'Each structure line needs a component type';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.payroll_component_types
      WHERE id = _component AND company_id = _company_id AND is_active
    ) THEN
      RAISE EXCEPTION 'Component type not found for structure line';
    END IF;
    INSERT INTO public.payroll_salary_structure_lines (
      company_id, structure_id, component_type_id, amount_minor, rate_minor,
      percentage_bps, is_recurring, sort_order
    ) VALUES (
      _company_id,
      _row.id,
      _component,
      COALESCE((_line->>'amount_minor')::BIGINT, 0),
      COALESCE((_line->>'rate_minor')::BIGINT, 0),
      COALESCE((_line->>'percentage_bps')::INTEGER, 0),
      COALESCE((_line->>'is_recurring')::BOOLEAN, true),
      COALESCE((_line->>'sort_order')::INTEGER, 100)
    );
  END LOOP;

  PERFORM public.record_audit_event(
    _company_id,
    'payroll.salary_structure.saved',
    'payroll_salary_structure',
    _row.id::TEXT,
    jsonb_build_object('name', _row.name, 'is_active', _row.is_active)
  );

  RETURN to_jsonb(_row);
END;
$$;

REVOKE ALL ON FUNCTION public.save_payroll_salary_structure(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_payroll_salary_structure(UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_payroll_employee_salary(
  _company_id UUID,
  _employee_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _structure_id UUID;
  _effective_from DATE;
  _reason TEXT;
  _version public.payroll_employee_salary_versions%ROWTYPE;
  _line RECORD;
  _custom JSONB;
  _item JSONB;
  _component UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.employees.manage') THEN
    RAISE EXCEPTION 'You do not have permission to manage payroll employees';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.payroll_employees WHERE id = _employee_id AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  _structure_id := NULLIF(_payload->>'structure_id', '')::UUID;
  _effective_from := NULLIF(_payload->>'effective_from', '')::DATE;
  _reason := NULLIF(trim(COALESCE(_payload->>'change_reason', '')), '');
  _custom := COALESCE(_payload->'lines', '[]'::jsonb);

  IF _effective_from IS NULL THEN RAISE EXCEPTION 'Effective from date is required'; END IF;
  IF _structure_id IS NULL AND jsonb_array_length(_custom) = 0 THEN
    RAISE EXCEPTION 'Provide a salary structure or custom salary lines';
  END IF;
  IF _structure_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.payroll_salary_structures
    WHERE id = _structure_id AND company_id = _company_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Salary structure not found';
  END IF;

  PERFORM public.payroll_close_open_salary_version(
    _company_id, _employee_id, (_effective_from - 1)
  );

  INSERT INTO public.payroll_employee_salary_versions (
    company_id, employee_id, structure_id, effective_from, change_reason, created_by
  ) VALUES (
    _company_id, _employee_id, _structure_id, _effective_from, _reason, auth.uid()
  )
  RETURNING * INTO _version;

  IF _structure_id IS NOT NULL THEN
    FOR _line IN
      SELECT * FROM public.payroll_salary_structure_lines
      WHERE structure_id = _structure_id AND company_id = _company_id
    LOOP
      INSERT INTO public.payroll_employee_salary_lines (
        company_id, employee_id, version_id, component_type_id,
        amount_minor, rate_minor, percentage_bps, is_recurring, effective_from
      ) VALUES (
        _company_id, _employee_id, _version.id, _line.component_type_id,
        _line.amount_minor, _line.rate_minor, _line.percentage_bps, _line.is_recurring,
        _effective_from
      );
    END LOOP;
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_custom)
  LOOP
    _component := NULLIF(_item->>'component_type_id', '')::UUID;
    IF _component IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.payroll_employee_salary_lines (
      company_id, employee_id, version_id, component_type_id,
      amount_minor, rate_minor, percentage_bps, is_recurring, effective_from, notes
    ) VALUES (
      _company_id, _employee_id, _version.id, _component,
      COALESCE((_item->>'amount_minor')::BIGINT, 0),
      COALESCE((_item->>'rate_minor')::BIGINT, 0),
      COALESCE((_item->>'percentage_bps')::INTEGER, 0),
      COALESCE((_item->>'is_recurring')::BOOLEAN, true),
      _effective_from,
      NULLIF(trim(COALESCE(_item->>'notes', '')), '')
    )
    ON CONFLICT (version_id, component_type_id) DO UPDATE SET
      amount_minor = EXCLUDED.amount_minor,
      rate_minor = EXCLUDED.rate_minor,
      percentage_bps = EXCLUDED.percentage_bps,
      is_recurring = EXCLUDED.is_recurring,
      notes = EXCLUDED.notes;
  END LOOP;

  UPDATE public.payroll_employees
  SET salary_structure_id = COALESCE(_structure_id, salary_structure_id),
      updated_at = now()
  WHERE id = _employee_id AND company_id = _company_id;

  PERFORM public.record_audit_event(
    _company_id,
    'payroll.employee.salary_assigned',
    'payroll_employee',
    _employee_id::TEXT,
    jsonb_build_object(
      'version_id', _version.id,
      'structure_id', _structure_id,
      'effective_from', _effective_from
    )
  );

  RETURN to_jsonb(_version);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_payroll_employee_salary(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_payroll_employee_salary(UUID, UUID, JSONB) TO authenticated;
