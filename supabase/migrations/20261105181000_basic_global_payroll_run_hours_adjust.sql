-- Allow period hours / unit quantity adjustments on pay runs (hourly employment).
-- Requires 20261105173000 (pay runs).

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
  _qty BIGINT;
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
    IF _ct.calculation_method NOT IN ('manual', 'hourly', 'unit') THEN
      RAISE EXCEPTION 'Only manual, hourly, and unit components can be adjusted on a run';
    END IF;
    _qty := NULLIF(_line->>'quantity_micro', '')::BIGINT;
    IF _ct.calculation_method IN ('hourly', 'unit') AND _qty IS NULL THEN
      RAISE EXCEPTION 'Hours or quantity is required for hourly and unit run adjustments';
    END IF;
    INSERT INTO public.payroll_run_lines (
      company_id, run_employee_id, component_type_id, kind, code, name,
      amount_minor, quantity_micro, rate_minor, percentage_bps,
      is_employer, is_variable, sort_order
    ) VALUES (
      _company_id, _run_emp.id, _component, _ct.kind, _ct.code, _ct.name,
      COALESCE((_line->>'amount_minor')::BIGINT, 0),
      _qty,
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
