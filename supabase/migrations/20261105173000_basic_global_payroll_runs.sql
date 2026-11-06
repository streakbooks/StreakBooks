-- Basic Global Payroll Batch 4: pay runs, approvals and payslips.
--
-- Requires 20261105160709 (employees and salary structures).
--
-- Workflow: draft → calculated → reviewed → approved → (posted/paid/complete in Batch 5).
-- Numeric calculation mirrors src/lib/payroll/calculation-engine.ts in the application
-- server layer; calculate_payroll_run persists an authoritative payload from that engine.
--
-- Non-goals (Batch 5): journal posting, bank payments, statutory engines.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_number TEXT NOT NULL,
  pay_schedule_id UUID NOT NULL REFERENCES public.payroll_pay_schedules(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payment_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'calculated', 'reviewed', 'approved',
      'posted', 'paid', 'complete', 'void'
    )),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  gross_minor BIGINT NOT NULL DEFAULT 0,
  deductions_minor BIGINT NOT NULL DEFAULT 0,
  net_minor BIGINT NOT NULL DEFAULT 0,
  employer_minor BIGINT NOT NULL DEFAULT 0,
  employer_cost_minor BIGINT NOT NULL DEFAULT 0,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  calculated_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_runs_period_order CHECK (period_end >= period_start),
  CONSTRAINT payroll_runs_number_len CHECK (char_length(trim(run_number)) BETWEEN 1 AND 40),
  CONSTRAINT payroll_runs_company_number_uniq UNIQUE (company_id, run_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_open_period_uidx
  ON public.payroll_runs (company_id, pay_schedule_id, period_start, period_end)
  WHERE status NOT IN ('void');

CREATE INDEX IF NOT EXISTS payroll_runs_company_status_idx
  ON public.payroll_runs (company_id, status, period_start DESC);

CREATE TABLE IF NOT EXISTS public.payroll_run_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'included'
    CHECK (status IN ('included', 'excluded', 'error')),
  gross_minor BIGINT NOT NULL DEFAULT 0,
  deductions_minor BIGINT NOT NULL DEFAULT 0,
  net_minor BIGINT NOT NULL DEFAULT 0,
  employer_minor BIGINT NOT NULL DEFAULT 0,
  employer_cost_minor BIGINT NOT NULL DEFAULT 0,
  hours_leave_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_run_employees_uniq UNIQUE (run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS payroll_run_employees_run_idx
  ON public.payroll_run_employees (run_id);

CREATE TABLE IF NOT EXISTS public.payroll_run_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_employee_id UUID NOT NULL REFERENCES public.payroll_run_employees(id) ON DELETE CASCADE,
  component_type_id UUID REFERENCES public.payroll_component_types(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('earning', 'deduction', 'employer_contribution')),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  amount_minor BIGINT NOT NULL DEFAULT 0,
  quantity_micro BIGINT,
  rate_minor BIGINT,
  percentage_bps INTEGER,
  is_employer BOOLEAN NOT NULL DEFAULT false,
  is_variable BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_run_lines_code_len CHECK (char_length(trim(code)) BETWEEN 1 AND 40),
  CONSTRAINT payroll_run_lines_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS payroll_run_lines_run_employee_idx
  ON public.payroll_run_lines (run_employee_id, sort_order);

CREATE TABLE IF NOT EXISTS public.payroll_payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  run_employee_id UUID NOT NULL REFERENCES public.payroll_run_employees(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE RESTRICT,
  payslip_number TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  snapshot JSONB NOT NULL,
  branding_name TEXT,
  footer_note TEXT,
  show_employer_costs BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_payslips_number_len CHECK (char_length(trim(payslip_number)) BETWEEN 1 AND 40),
  CONSTRAINT payroll_payslips_run_employee_uniq UNIQUE (run_employee_id),
  CONSTRAINT payroll_payslips_company_number_uniq UNIQUE (company_id, payslip_number)
);

CREATE INDEX IF NOT EXISTS payroll_payslips_run_idx ON public.payroll_payslips (run_id);
CREATE INDEX IF NOT EXISTS payroll_payslips_employee_idx ON public.payroll_payslips (employee_id, issued_at DESC);

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_run_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_run_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_payslips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payroll viewers can read runs" ON public.payroll_runs;
CREATE POLICY "Payroll viewers can read runs" ON public.payroll_runs
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'payroll.view')
  );

DROP POLICY IF EXISTS "Payroll viewers can read run employees" ON public.payroll_run_employees;
CREATE POLICY "Payroll viewers can read run employees" ON public.payroll_run_employees
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'payroll.view')
  );

DROP POLICY IF EXISTS "Payroll viewers can read run lines" ON public.payroll_run_lines;
CREATE POLICY "Payroll viewers can read run lines" ON public.payroll_run_lines
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'payroll.view')
  );

DROP POLICY IF EXISTS "Payroll viewers can read payslips" ON public.payroll_payslips;
CREATE POLICY "Payroll viewers can read payslips" ON public.payroll_payslips
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'payroll.view')
  );

REVOKE ALL ON
  public.payroll_runs,
  public.payroll_run_employees,
  public.payroll_run_lines,
  public.payroll_payslips
FROM PUBLIC, anon;

GRANT SELECT ON
  public.payroll_runs,
  public.payroll_run_employees,
  public.payroll_run_lines,
  public.payroll_payslips
TO authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payroll_run_assert_mutable(_run_id UUID)
RETURNS public.payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run public.payroll_runs;
BEGIN
  SELECT * INTO _run FROM public.payroll_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run not found'; END IF;
  IF _run.status IN ('approved', 'posted', 'paid', 'complete', 'void') THEN
    RAISE EXCEPTION 'This payroll run can no longer be changed (status: %)', _run.status;
  END IF;
  RETURN _run;
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_run_assert_mutable(UUID) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.payroll_run_employee_active_in_period(
  _hire DATE,
  _term DATE,
  _period_start DATE,
  _period_end DATE
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _hire <= _period_end AND (_term IS NULL OR _term >= _period_start);
$$;

CREATE OR REPLACE FUNCTION public.payroll_build_payslip_snapshot(
  _run public.payroll_runs,
  _run_emp public.payroll_run_employees,
  _employee public.payroll_employees,
  _company_name TEXT,
  _branding_name TEXT,
  _footer_note TEXT,
  _show_employer BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lines JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'kind', l.kind,
      'code', l.code,
      'name', l.name,
      'amountMinor', l.amount_minor,
      'isEmployer', l.is_employer,
      'sortOrder', l.sort_order
    ) ORDER BY l.sort_order, l.code
  ), '[]'::jsonb)
  INTO _lines
  FROM public.payroll_run_lines l
  WHERE l.run_employee_id = _run_emp.id;

  RETURN jsonb_build_object(
    'version', 1,
    'employee', jsonb_build_object(
      'id', _employee.id,
      'employeeNumber', _employee.employee_number,
      'displayName', trim(_employee.first_name || ' ' || _employee.last_name),
      'department', _employee.department,
      'designation', _employee.designation
    ),
    'period', jsonb_build_object(
      'start', _run.period_start,
      'end', _run.period_end,
      'paymentDate', _run.payment_date
    ),
    'run', jsonb_build_object('id', _run.id, 'runNumber', _run.run_number),
    'totals', jsonb_build_object(
      'grossEarningsMinor', _run_emp.gross_minor,
      'employeeDeductionsMinor', _run_emp.deductions_minor,
      'netPayMinor', _run_emp.net_minor,
      'employerContributionsMinor', _run_emp.employer_minor,
      'totalEmployerCostMinor', _run_emp.employer_cost_minor
    ),
    'lines', _lines,
    'branding', jsonb_build_object(
      'companyName', _company_name,
      'brandingName', _branding_name,
      'footerNote', _footer_note,
      'showEmployerCosts', _show_employer,
      'currency', _run.currency
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_build_payslip_snapshot(
  public.payroll_runs, public.payroll_run_employees, public.payroll_employees,
  TEXT, TEXT, TEXT, BOOLEAN
) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_payroll_run(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _schedule_id UUID;
  _period_start DATE;
  _period_end DATE;
  _payment_date DATE;
  _run public.payroll_runs;
  _settings public.payroll_settings;
  _emp RECORD;
  _count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.run.prepare') THEN
    RAISE EXCEPTION 'You do not have permission to prepare payroll runs';
  END IF;

  _schedule_id := NULLIF(_payload->>'pay_schedule_id', '')::UUID;
  _period_start := NULLIF(_payload->>'period_start', '')::DATE;
  _period_end := NULLIF(_payload->>'period_end', '')::DATE;
  _payment_date := NULLIF(_payload->>'payment_date', '')::DATE;

  IF _schedule_id IS NULL OR _period_start IS NULL OR _period_end IS NULL OR _payment_date IS NULL THEN
    RAISE EXCEPTION 'Pay schedule, period dates and payment date are required';
  END IF;
  IF _period_end < _period_start THEN
    RAISE EXCEPTION 'Period end must be on or after period start';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.payroll_pay_schedules
    WHERE id = _schedule_id AND company_id = _company_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Pay schedule not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payroll_runs
    WHERE company_id = _company_id
      AND pay_schedule_id = _schedule_id
      AND period_start = _period_start
      AND period_end = _period_end
      AND status <> 'void'
  ) THEN
    RAISE EXCEPTION 'An open payroll run already exists for this schedule and period';
  END IF;

  SELECT * INTO _settings FROM public.payroll_settings WHERE company_id = _company_id;
  IF NOT FOUND OR NOT _settings.enabled THEN
    RAISE EXCEPTION 'Enable payroll settings before creating a run';
  END IF;

  INSERT INTO public.payroll_runs (
    company_id, run_number, pay_schedule_id, period_start, period_end, payment_date,
    status, currency, requires_approval, created_by
  ) VALUES (
    _company_id,
    public.allocate_document_number(_company_id, 'payroll_run'),
    _schedule_id, _period_start, _period_end, _payment_date,
    'draft', _settings.payroll_currency, _settings.requires_approval, auth.uid()
  )
  RETURNING * INTO _run;

  FOR _emp IN
    SELECT e.*
    FROM public.payroll_employees e
    WHERE e.company_id = _company_id
      AND e.status = 'active'
      AND e.pay_schedule_id = _schedule_id
      AND public.payroll_run_employee_active_in_period(
        e.hire_date, e.termination_date, _period_start, _period_end
      )
  LOOP
    INSERT INTO public.payroll_run_employees (
      company_id, run_id, employee_id, status
    ) VALUES (
      _company_id, _run.id, _emp.id, 'included'
    );
    _count := _count + 1;
  END LOOP;

  IF _count = 0 THEN
    RAISE EXCEPTION 'No active employees on this schedule for the selected period';
  END IF;

  PERFORM public.record_audit_event(
    _company_id,
    'payroll.run.created',
    'payroll_run',
    _run.id::TEXT,
    jsonb_build_object(
      'run_number', _run.run_number,
      'period_start', _run.period_start,
      'period_end', _run.period_end,
      'employee_count', _count
    )
  );

  RETURN to_jsonb(_run);
END;
$$;

REVOKE ALL ON FUNCTION public.create_payroll_run(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_payroll_run(UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.calculate_payroll_run(
  _company_id UUID,
  _run_id UUID,
  _calculation JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run public.payroll_runs;
  _emp JSONB;
  _line JSONB;
  _run_emp_id UUID;
  _emp_id UUID;
  _gross BIGINT;
  _ded BIGINT;
  _net BIGINT;
  _er BIGINT;
  _erc BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.run.prepare') THEN
    RAISE EXCEPTION 'You do not have permission to calculate payroll runs';
  END IF;

  _run := public.payroll_run_assert_mutable(_run_id);
  IF _run.company_id <> _company_id THEN RAISE EXCEPTION 'Payroll run not found'; END IF;
  IF _calculation IS NULL OR jsonb_typeof(_calculation) <> 'object' THEN
    RAISE EXCEPTION 'Calculation payload is required';
  END IF;

  _gross := COALESCE((_calculation->>'grossMinor')::BIGINT, 0);
  _ded := COALESCE((_calculation->>'deductionsMinor')::BIGINT, 0);
  _net := COALESCE((_calculation->>'netMinor')::BIGINT, 0);
  _er := COALESCE((_calculation->>'employerMinor')::BIGINT, 0);
  _erc := COALESCE((_calculation->>'employerCostMinor')::BIGINT, 0);

  DELETE FROM public.payroll_run_lines l
  USING public.payroll_run_employees re
  WHERE l.run_employee_id = re.id AND re.run_id = _run_id AND re.company_id = _company_id
    AND NOT l.is_variable;

  FOR _emp IN SELECT * FROM jsonb_array_elements(COALESCE(_calculation->'employees', '[]'::jsonb))
  LOOP
    _emp_id := NULLIF(_emp->>'employeeId', '')::UUID;
    IF _emp_id IS NULL THEN CONTINUE; END IF;

    SELECT id INTO _run_emp_id
    FROM public.payroll_run_employees
    WHERE run_id = _run_id AND employee_id = _emp_id AND company_id = _company_id
    FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    UPDATE public.payroll_run_employees SET
      gross_minor = COALESCE((_emp->>'grossMinor')::BIGINT, 0),
      deductions_minor = COALESCE((_emp->>'deductionsMinor')::BIGINT, 0),
      net_minor = COALESCE((_emp->>'netMinor')::BIGINT, 0),
      employer_minor = COALESCE((_emp->>'employerMinor')::BIGINT, 0),
      employer_cost_minor = COALESCE((_emp->>'employerCostMinor')::BIGINT, 0),
      hours_leave_snapshot = _emp->'hoursLeaveSnapshot',
      updated_at = now()
    WHERE id = _run_emp_id;

    DELETE FROM public.payroll_run_lines
    WHERE run_employee_id = _run_emp_id AND NOT is_variable;

    FOR _line IN SELECT * FROM jsonb_array_elements(COALESCE(_emp->'lines', '[]'::jsonb))
    LOOP
      IF COALESCE((_line->>'isVariable')::BOOLEAN, false) THEN CONTINUE; END IF;
      INSERT INTO public.payroll_run_lines (
        company_id, run_employee_id, component_type_id, kind, code, name,
        amount_minor, quantity_micro, rate_minor, percentage_bps,
        is_employer, is_variable, sort_order
      ) VALUES (
        _company_id,
        _run_emp_id,
        NULLIF(_line->>'componentTypeId', '')::UUID,
        COALESCE(_line->>'kind', 'earning'),
        COALESCE(_line->>'code', 'LINE'),
        COALESCE(_line->>'name', 'Line'),
        COALESCE((_line->>'amountMinor')::BIGINT, 0),
        NULLIF(_line->>'quantityMicro', '')::BIGINT,
        NULLIF(_line->>'rateMinor', '')::BIGINT,
        NULLIF(_line->>'percentageBps', '')::INTEGER,
        COALESCE((_line->>'isEmployer')::BOOLEAN, false),
        false,
        COALESCE((_line->>'sortOrder')::INTEGER, 100)
      );
    END LOOP;
  END LOOP;

  UPDATE public.payroll_runs SET
    status = 'calculated',
    currency = COALESCE(NULLIF(_calculation->>'currency', ''), currency),
    gross_minor = _gross,
    deductions_minor = _ded,
    net_minor = _net,
    employer_minor = _er,
    employer_cost_minor = _erc,
    calculated_at = now(),
    reviewed_at = NULL,
    version = version + 1,
    updated_at = now()
  WHERE id = _run_id
  RETURNING * INTO _run;

  PERFORM public.record_audit_event(
    _company_id,
    'payroll.run.calculated',
    'payroll_run',
    _run.id::TEXT,
    jsonb_build_object('run_number', _run.run_number, 'net_minor', _run.net_minor)
  );

  RETURN to_jsonb(_run);
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_payroll_run(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_payroll_run(UUID, UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.recalculate_payroll_run(
  _company_id UUID,
  _run_id UUID,
  _calculation JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.calculate_payroll_run(_company_id, _run_id, _calculation);
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_payroll_run(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_payroll_run(UUID, UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.adjust_payroll_run_employee(
  _company_id UUID,
  _run_id UUID,
  _employee_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run public.payroll_runs;
  _run_emp public.payroll_run_employees;
  _line JSONB;
  _component UUID;
  _ct public.payroll_component_types;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.run.prepare') THEN
    RAISE EXCEPTION 'You do not have permission to adjust payroll runs';
  END IF;

  _run := public.payroll_run_assert_mutable(_run_id);
  IF _run.company_id <> _company_id THEN RAISE EXCEPTION 'Payroll run not found'; END IF;

  SELECT * INTO _run_emp FROM public.payroll_run_employees
  WHERE run_id = _run_id AND employee_id = _employee_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee not on this payroll run'; END IF;

  DELETE FROM public.payroll_run_lines
  WHERE run_employee_id = _run_emp.id AND is_variable;

  FOR _line IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'lines', '[]'::jsonb))
  LOOP
    _component := NULLIF(_line->>'component_type_id', '')::UUID;
    IF _component IS NULL THEN CONTINUE; END IF;
    SELECT * INTO _ct FROM public.payroll_component_types
    WHERE id = _component AND company_id = _company_id AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Component type not found'; END IF;
    IF _ct.calculation_method <> 'manual' THEN
      RAISE EXCEPTION 'Only manual (variable) components can be adjusted on a run';
    END IF;
    INSERT INTO public.payroll_run_lines (
      company_id, run_employee_id, component_type_id, kind, code, name,
      amount_minor, quantity_micro, rate_minor, percentage_bps,
      is_employer, is_variable, sort_order
    ) VALUES (
      _company_id, _run_emp.id, _component, _ct.kind, _ct.code, _ct.name,
      COALESCE((_line->>'amount_minor')::BIGINT, 0),
      NULLIF(_line->>'quantity_micro', '')::BIGINT,
      NULLIF(_line->>'rate_minor', '')::BIGINT,
      NULLIF(_line->>'percentage_bps', '')::INTEGER,
      _ct.kind = 'employer_contribution',
      true,
      _ct.sort_order
    );
  END LOOP;

  IF _run.status IN ('calculated', 'reviewed') THEN
    UPDATE public.payroll_runs SET status = 'draft', updated_at = now() WHERE id = _run_id;
  END IF;

  PERFORM public.record_audit_event(
    _company_id,
    'payroll.run.employee_adjusted',
    'payroll_run',
    _run_id::TEXT,
    jsonb_build_object('employee_id', _employee_id)
  );

  RETURN to_jsonb(_run_emp);
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_payroll_run_employee(UUID, UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_payroll_run_employee(UUID, UUID, UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_payroll_run_reviewed(_company_id UUID, _run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run public.payroll_runs;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.run.prepare') THEN
    RAISE EXCEPTION 'You do not have permission to review payroll runs';
  END IF;

  SELECT * INTO _run FROM public.payroll_runs
  WHERE id = _run_id AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run not found'; END IF;
  IF _run.status <> 'calculated' THEN
    RAISE EXCEPTION 'Only calculated runs can be marked reviewed';
  END IF;

  UPDATE public.payroll_runs SET
    status = 'reviewed',
    reviewed_at = now(),
    updated_at = now()
  WHERE id = _run_id
  RETURNING * INTO _run;

  PERFORM public.record_audit_event(
    _company_id, 'payroll.run.reviewed', 'payroll_run', _run.id::TEXT,
    jsonb_build_object('run_number', _run.run_number)
  );

  RETURN to_jsonb(_run);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_payroll_run_reviewed(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_payroll_run_reviewed(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_payroll_run(_company_id UUID, _run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run public.payroll_runs;
  _settings public.payroll_settings;
  _company_name TEXT;
  _re RECORD;
  _emp public.payroll_employees;
  _snapshot JSONB;
  _payslip_number TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.run.approve') THEN
    RAISE EXCEPTION 'You do not have permission to approve payroll runs';
  END IF;

  SELECT * INTO _run FROM public.payroll_runs
  WHERE id = _run_id AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run not found'; END IF;

  IF _run.requires_approval THEN
    IF _run.status NOT IN ('calculated', 'reviewed') THEN
      RAISE EXCEPTION 'Run must be calculated (and reviewed when required) before approval';
    END IF;
  ELSE
    IF _run.status NOT IN ('calculated', 'reviewed', 'draft') THEN
      RAISE EXCEPTION 'Run cannot be approved from status %', _run.status;
    END IF;
    IF _run.status = 'draft' AND _run.calculated_at IS NULL THEN
      RAISE EXCEPTION 'Calculate the run before approval';
    END IF;
  END IF;

  SELECT * INTO _settings FROM public.payroll_settings WHERE company_id = _company_id;
  SELECT name INTO _company_name FROM public.companies WHERE id = _company_id;

  FOR _re IN
    SELECT re.* FROM public.payroll_run_employees re
    WHERE re.run_id = _run_id AND re.company_id = _company_id AND re.status = 'included'
  LOOP
    IF EXISTS (SELECT 1 FROM public.payroll_payslips WHERE run_employee_id = _re.id) THEN
      CONTINUE;
    END IF;
    SELECT * INTO _emp FROM public.payroll_employees WHERE id = _re.employee_id;
    _snapshot := public.payroll_build_payslip_snapshot(
      _run, _re, _emp, _company_name,
      _settings.payslip_branding_name, _settings.payslip_footer_note,
      _settings.payslip_show_employer_costs
    );
    _payslip_number := public.allocate_document_number(_company_id, 'payslip');
    INSERT INTO public.payroll_payslips (
      company_id, run_id, run_employee_id, employee_id, payslip_number,
      snapshot, branding_name, footer_note, show_employer_costs
    ) VALUES (
      _company_id, _run_id, _re.id, _re.employee_id, _payslip_number,
      _snapshot, _settings.payslip_branding_name, _settings.payslip_footer_note,
      _settings.payslip_show_employer_costs
    );
  END LOOP;

  UPDATE public.payroll_runs SET
    status = 'approved',
    approved_by = auth.uid(),
    approved_at = now(),
    updated_at = now()
  WHERE id = _run_id
  RETURNING * INTO _run;

  PERFORM public.record_audit_event(
    _company_id, 'payroll.run.approved', 'payroll_run', _run.id::TEXT,
    jsonb_build_object('run_number', _run.run_number)
  );

  RETURN to_jsonb(_run);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_payroll_run(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_payroll_run(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_payroll_run(_company_id UUID, _run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.run.post') THEN
    RAISE EXCEPTION 'You do not have permission to post payroll runs';
  END IF;
  RAISE EXCEPTION 'Posting payroll journals is planned for Basic Global Payroll Batch 5.';
END;
$$;

REVOKE ALL ON FUNCTION public.post_payroll_run(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_payroll_run(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_payroll_run(_company_id UUID, _run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run public.payroll_runs;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.run.prepare') THEN
    RAISE EXCEPTION 'You do not have permission to void payroll runs';
  END IF;

  SELECT * INTO _run FROM public.payroll_runs
  WHERE id = _run_id AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run not found'; END IF;
  IF _run.status IN ('approved', 'posted', 'paid', 'complete') THEN
    RAISE EXCEPTION 'Approved or later runs cannot be voided';
  END IF;

  UPDATE public.payroll_runs SET status = 'void', updated_at = now()
  WHERE id = _run_id RETURNING * INTO _run;

  PERFORM public.record_audit_event(
    _company_id, 'payroll.run.voided', 'payroll_run', _run.id::TEXT,
    jsonb_build_object('run_number', _run.run_number)
  );

  RETURN to_jsonb(_run);
END;
$$;

REVOKE ALL ON FUNCTION public.void_payroll_run(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_payroll_run(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_payroll_runs(_company_id UUID, _status TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _runs JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.view') THEN
    RAISE EXCEPTION 'You do not have permission to view payroll';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.period_start DESC, r.created_at DESC), '[]'::jsonb)
  INTO _runs
  FROM public.payroll_runs r
  WHERE r.company_id = _company_id
    AND (_status IS NULL OR r.status = _status);

  RETURN jsonb_build_object('runs', _runs);
END;
$$;

REVOKE ALL ON FUNCTION public.list_payroll_runs(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_payroll_runs(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_payroll_run_page(_company_id UUID, _run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run JSONB;
  _employees JSONB;
  _lines JSONB;
  _schedule JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.view') THEN
    RAISE EXCEPTION 'You do not have permission to view payroll';
  END IF;

  SELECT to_jsonb(r) INTO _run
  FROM public.payroll_runs r
  WHERE r.id = _run_id AND r.company_id = _company_id;
  IF _run IS NULL THEN RAISE EXCEPTION 'Payroll run not found'; END IF;

  SELECT to_jsonb(s) INTO _schedule
  FROM public.payroll_pay_schedules s
  JOIN public.payroll_runs r ON r.pay_schedule_id = s.id
  WHERE r.id = _run_id AND s.company_id = _company_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'run_employee', to_jsonb(re),
      'employee', to_jsonb(e)
    ) ORDER BY e.employee_number
  ), '[]'::jsonb)
  INTO _employees
  FROM public.payroll_run_employees re
  JOIN public.payroll_employees e ON e.id = re.employee_id
  WHERE re.run_id = _run_id AND re.company_id = _company_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.sort_order, l.code), '[]'::jsonb)
  INTO _lines
  FROM public.payroll_run_lines l
  JOIN public.payroll_run_employees re ON re.id = l.run_employee_id
  WHERE re.run_id = _run_id AND l.company_id = _company_id;

  RETURN jsonb_build_object(
    'run', _run,
    'schedule', _schedule,
    'employees', _employees,
    'lines', _lines
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_payroll_run_page(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payroll_run_page(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_payroll_payslips(
  _company_id UUID,
  _run_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _payslips JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.view') THEN
    RAISE EXCEPTION 'You do not have permission to view payroll';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'payslip', to_jsonb(p),
      'employee', to_jsonb(e),
      'run', to_jsonb(r)
    ) ORDER BY p.issued_at DESC
  ), '[]'::jsonb)
  INTO _payslips
  FROM public.payroll_payslips p
  JOIN public.payroll_employees e ON e.id = p.employee_id
  JOIN public.payroll_runs r ON r.id = p.run_id
  WHERE p.company_id = _company_id
    AND (_run_id IS NULL OR p.run_id = _run_id);

  RETURN jsonb_build_object('payslips', _payslips);
END;
$$;

REVOKE ALL ON FUNCTION public.list_payroll_payslips(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_payroll_payslips(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_payroll_payslip(_company_id UUID, _payslip_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _payslip JSONB;
  _employee JSONB;
  _run JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.view') THEN
    RAISE EXCEPTION 'You do not have permission to view payroll';
  END IF;

  SELECT to_jsonb(p) INTO _payslip
  FROM public.payroll_payslips p
  WHERE p.id = _payslip_id AND p.company_id = _company_id;
  IF _payslip IS NULL THEN RAISE EXCEPTION 'Payslip not found'; END IF;

  SELECT to_jsonb(e) INTO _employee
  FROM public.payroll_employees e
  JOIN public.payroll_payslips p ON p.employee_id = e.id
  WHERE p.id = _payslip_id;

  SELECT to_jsonb(r) INTO _run
  FROM public.payroll_runs r
  JOIN public.payroll_payslips p ON p.run_id = r.id
  WHERE p.id = _payslip_id;

  RETURN jsonb_build_object('payslip', _payslip, 'employee', _employee, 'run', _run);
END;
$$;

REVOKE ALL ON FUNCTION public.get_payroll_payslip(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payroll_payslip(UUID, UUID) TO authenticated;
