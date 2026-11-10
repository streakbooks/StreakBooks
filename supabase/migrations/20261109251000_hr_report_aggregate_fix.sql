-- HR-12 follow-up: fix nested aggregate in run_hr_report (headcount + leave_usage).

CREATE OR REPLACE FUNCTION public.run_hr_report(
  _company_id UUID,
  _report_id TEXT,
  _date_from DATE DEFAULT NULL,
  _date_to DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _from DATE := COALESCE(_date_from, date_trunc('year', CURRENT_DATE)::DATE);
  _to DATE := COALESCE(_date_to, CURRENT_DATE);
  _columns JSONB;
  _rows JSONB;
BEGIN
  IF NOT (
    public.has_company_permission(_company_id, 'hr.reports.view')
    OR public.has_company_permission(_company_id, 'hr.view')
  ) THEN
    RAISE EXCEPTION 'Missing permission: hr.reports.view';
  END IF;
  IF _to < _from THEN RAISE EXCEPTION 'date_to must be on or after date_from'; END IF;

  IF _report_id = 'headcount_by_department' THEN
    _columns := '[{"key":"department","label":"Department"},{"key":"activeCount","label":"Active"},{"key":"terminatedCount","label":"Terminated"}]'::jsonb;
    _rows := COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'department', x.department,
        'activeCount', x.active_count,
        'terminatedCount', x.terminated_count
      ) ORDER BY x.department)
      FROM (
        SELECT coalesce(d.name, '(Unassigned)') AS department,
          count(*) FILTER (WHERE e.status = 'active')::INTEGER AS active_count,
          count(*) FILTER (WHERE e.status = 'terminated')::INTEGER AS terminated_count
        FROM public.payroll_employees e
        LEFT JOIN public.hr_employee_profiles p ON p.employee_id = e.id
        LEFT JOIN public.hr_departments d ON d.id = p.department_id
        WHERE e.company_id = _company_id
        GROUP BY coalesce(d.name, '(Unassigned)')
      ) x
    ), '[]'::jsonb);
  ELSIF _report_id = 'leave_usage' THEN
    _columns := '[{"key":"leaveType","label":"Leave type"},{"key":"approvedDays","label":"Approved days"},{"key":"requests","label":"Requests"}]'::jsonb;
    IF to_regclass('public.hr_leave_requests') IS NULL THEN
      _rows := '[]'::jsonb;
    ELSE
      _rows := COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'leaveType', x.leave_type,
          'approvedDays', x.approved_days,
          'requests', x.requests
        ) ORDER BY x.leave_type)
        FROM (
          SELECT coalesce(t.name, 'Unknown') AS leave_type,
            coalesce(sum(r.days), 0) AS approved_days,
            count(*)::INTEGER AS requests
          FROM public.hr_leave_requests r
          LEFT JOIN public.hr_leave_types t ON t.id = r.leave_type_id
          WHERE r.company_id = _company_id AND r.status = 'approved'
            AND r.start_date <= _to AND r.end_date >= _from
          GROUP BY coalesce(t.name, 'Unknown')
        ) x
      ), '[]'::jsonb);
    END IF;
  ELSIF _report_id = 'attendance_exceptions' THEN
    _columns := '[{"key":"workDate","label":"Date"},{"key":"employeeNumber","label":"Employee #"},{"key":"employeeName","label":"Employee"},{"key":"status","label":"Status"}]'::jsonb;
    IF to_regclass('public.hr_attendance_logs') IS NULL THEN
      _rows := '[]'::jsonb;
    ELSE
      _rows := COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'workDate', l.work_date,
          'employeeNumber', e.employee_number,
          'employeeName', trim(both FROM concat_ws(' ', e.first_name, e.last_name)),
          'status', l.status
        ) ORDER BY l.work_date DESC)
        FROM public.hr_attendance_logs l
        JOIN public.payroll_employees e ON e.id = l.employee_id
        WHERE l.company_id = _company_id AND l.status = 'exception'
          AND l.work_date BETWEEN _from AND _to
      ), '[]'::jsonb);
    END IF;
  ELSIF _report_id = 'document_expiry' THEN
    _columns := '[{"key":"employeeNumber","label":"Employee #"},{"key":"employeeName","label":"Employee"},{"key":"title","label":"Document"},{"key":"expiresOn","label":"Expires"},{"key":"status","label":"Status"}]'::jsonb;
    IF to_regclass('public.hr_employee_documents') IS NULL THEN
      _rows := '[]'::jsonb;
    ELSE
      _rows := COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'employeeNumber', e.employee_number,
          'employeeName', trim(both FROM concat_ws(' ', e.first_name, e.last_name)),
          'title', d.title,
          'expiresOn', d.expires_on,
          'status', d.status
        ) ORDER BY d.expires_on NULLS LAST)
        FROM public.hr_employee_documents d
        JOIN public.payroll_employees e ON e.id = d.employee_id
        WHERE d.company_id = _company_id AND d.status = 'active'
          AND d.expires_on IS NOT NULL
          AND d.expires_on BETWEEN _from AND (_to + INTERVAL '30 days')
      ), '[]'::jsonb);
    END IF;
  ELSIF _report_id = 'turnover' THEN
    _columns := '[{"key":"metric","label":"Metric"},{"key":"value","label":"Value"}]'::jsonb;
    _rows := jsonb_build_array(
      jsonb_build_object('metric','Active headcount (end)', 'value',
        (SELECT count(*) FROM public.payroll_employees e WHERE e.company_id=_company_id AND e.status='active')),
      jsonb_build_object('metric','Terminated in period', 'value',
        (SELECT count(*) FROM public.payroll_employees e
         WHERE e.company_id=_company_id AND e.status='terminated'
           AND e.termination_date BETWEEN _from AND _to)),
      jsonb_build_object('metric','Hired in period', 'value',
        (SELECT count(*) FROM public.payroll_employees e
         WHERE e.company_id=_company_id AND e.hire_date BETWEEN _from AND _to))
    );
  ELSE
    RAISE EXCEPTION 'Unknown HR report %', _report_id;
  END IF;

  RETURN jsonb_build_object(
    'reportId', _report_id,
    'dateFrom', _from,
    'dateTo', _to,
    'columns', _columns,
    'rows', COALESCE(_rows, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_hr_report(UUID, TEXT, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_hr_report(UUID, TEXT, DATE, DATE) TO authenticated;