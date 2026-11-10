-- HR-07: ESS + Manager Workspace + Approvals inbox (additive).
-- Requires foundation + leave/attendance migrations for pending queues.

CREATE OR REPLACE FUNCTION private.hr_resolve_self_employee(
  _company_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _employee_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT p.employee_id INTO _employee_id
  FROM public.hr_employee_profiles p
  WHERE p.company_id = _company_id
    AND p.linked_user_id = auth.uid()
  LIMIT 1;
  RETURN _employee_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.link_hr_employee_user(
  _company_id UUID,
  _employee_id UUID,
  _user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.hr_employee_profiles%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.employees.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.payroll_employees e
    WHERE e.id = _employee_id AND e.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.hr_employee_profiles p
    WHERE p.company_id = _company_id
      AND p.linked_user_id = _user_id
      AND p.employee_id <> _employee_id
  ) THEN
    RAISE EXCEPTION 'That user is already linked to another employee in this organisation';
  END IF;

  INSERT INTO public.hr_employee_profiles AS p (
    employee_id, company_id, linked_user_id, updated_by
  ) VALUES (
    _employee_id, _company_id, _user_id, auth.uid()
  )
  ON CONFLICT (employee_id) DO UPDATE SET
    linked_user_id = EXCLUDED.linked_user_id,
    version = p.version + 1,
    updated_at = now(),
    updated_by = auth.uid()
  RETURNING * INTO _row;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_employee_profile', _row.employee_id, 'link_user',
    CASE WHEN _user_id IS NULL THEN 'Unlinked employee user' ELSE 'Linked employee user' END,
    jsonb_build_object('linkedUserId', _user_id)
  );

  RETURN jsonb_build_object(
    'employeeId', _row.employee_id,
    'linkedUserId', _row.linked_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_hr_self_context(
  _company_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _employee_id UUID;
  _emp public.payroll_employees%ROWTYPE;
  _profile public.hr_employee_profiles%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.self_service');
  _employee_id := private.hr_resolve_self_employee(_company_id);
  IF _employee_id IS NULL THEN
    RETURN jsonb_build_object(
      'linked', false,
      'employee', NULL,
      'profile', NULL,
      'message', 'Your login is not linked to an employee profile. Ask HR to link your account.'
    );
  END IF;

  SELECT * INTO _emp FROM public.payroll_employees
  WHERE id = _employee_id AND company_id = _company_id;
  SELECT * INTO _profile FROM public.hr_employee_profiles
  WHERE employee_id = _employee_id AND company_id = _company_id;

  RETURN jsonb_build_object(
    'linked', true,
    'employee', jsonb_build_object(
      'id', _emp.id,
      'employeeNumber', _emp.employee_number,
      'firstName', _emp.first_name,
      'lastName', _emp.last_name,
      'email', _emp.email,
      'status', _emp.status,
      'hireDate', _emp.hire_date
    ),
    'profile', CASE WHEN _profile.employee_id IS NULL THEN NULL ELSE jsonb_build_object(
      'preferredName', _profile.preferred_name,
      'personalEmail', _profile.personal_email,
      'personalPhone', _profile.personal_phone,
      'workPhone', _profile.work_phone,
      'managerEmployeeId', _profile.manager_employee_id,
      'departmentId', _profile.department_id,
      'designationId', _profile.designation_id,
      'locationId', _profile.location_id,
      'workArrangement', _profile.work_arrangement,
      'emergencyContactName', _profile.emergency_contact_name,
      'emergencyContactPhone', _profile.emergency_contact_phone,
      'emergencyContactRelation', _profile.emergency_contact_relation
    ) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_hr_self_profile(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _employee_id UUID;
  _row public.hr_employee_profiles%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.self_service');
  PERFORM private.hr_require_enabled(_company_id);
  _employee_id := private.hr_resolve_self_employee(_company_id);
  IF _employee_id IS NULL THEN
    RAISE EXCEPTION 'Your login is not linked to an employee profile';
  END IF;

  UPDATE public.hr_employee_profiles SET
    preferred_name = COALESCE(NULLIF(trim(_payload->>'preferredName'), ''), preferred_name),
    personal_email = NULLIF(trim(_payload->>'personalEmail'), ''),
    personal_phone = NULLIF(trim(_payload->>'personalPhone'), ''),
    work_phone = NULLIF(trim(_payload->>'workPhone'), ''),
    emergency_contact_name = NULLIF(trim(_payload->>'emergencyContactName'), ''),
    emergency_contact_phone = NULLIF(trim(_payload->>'emergencyContactPhone'), ''),
    emergency_contact_relation = NULLIF(trim(_payload->>'emergencyContactRelation'), ''),
    version = version + 1,
    updated_at = now(),
    updated_by = auth.uid()
  WHERE employee_id = _employee_id AND company_id = _company_id
  RETURNING * INTO _row;

  IF _row.employee_id IS NULL THEN
    RAISE EXCEPTION 'Employee profile not found';
  END IF;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_employee_profile', _row.employee_id, 'self_update',
    'Employee self-service profile update',
    '{}'::jsonb
  );

  RETURN jsonb_build_object('employeeId', _row.employee_id, 'ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_hr_self_leave_requests(
  _company_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _employee_id UUID;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.self_service');
  _employee_id := private.hr_resolve_self_employee(_company_id);
  IF _employee_id IS NULL THEN
    RETURN jsonb_build_object('linked', false, 'items', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object(
    'linked', true,
    'employeeId', _employee_id,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'requestNumber', r.request_number,
        'leaveTypeId', r.leave_type_id,
        'leaveTypeCode', t.code,
        'leaveTypeName', t.name,
        'startDate', r.start_date,
        'endDate', r.end_date,
        'days', r.days,
        'status', r.status,
        'reason', r.reason,
        'updatedAt', r.updated_at
      ) ORDER BY r.updated_at DESC)
      FROM public.hr_leave_requests r
      JOIN public.hr_leave_types t ON t.id = r.leave_type_id
      WHERE r.company_id = _company_id AND r.employee_id = _employee_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_hr_self_leave_request(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _employee_id UUID;
  _type UUID := NULLIF(_payload->>'leaveTypeId', '')::UUID;
  _start DATE := NULLIF(_payload->>'startDate', '')::DATE;
  _end DATE := NULLIF(_payload->>'endDate', '')::DATE;
  _days NUMERIC(8,2);
  _status TEXT := COALESCE(NULLIF(_payload->>'status', ''), 'submitted');
  _requires BOOLEAN;
  _bal public.hr_leave_balances%ROWTYPE;
  _available NUMERIC(8,2);
  _row public.hr_leave_requests%ROWTYPE;
  _year INTEGER;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.self_service');
  PERFORM private.hr_require_enabled(_company_id);
  _employee_id := private.hr_resolve_self_employee(_company_id);
  IF _employee_id IS NULL THEN
    RAISE EXCEPTION 'Your login is not linked to an employee profile';
  END IF;
  IF _type IS NULL OR _start IS NULL OR _end IS NULL THEN
    RAISE EXCEPTION 'Leave type and dates are required';
  END IF;
  IF _end < _start THEN
    RAISE EXCEPTION 'End date must be on or after start date';
  END IF;
  IF _status NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION 'Self-service can only create draft or submitted leave';
  END IF;
  _days := COALESCE((_payload->>'days')::NUMERIC, (_end - _start) + 1);
  SELECT requires_approval INTO _requires
  FROM public.hr_leave_types t
  WHERE t.id = _type AND t.company_id = _company_id AND t.is_active;
  IF _requires IS NULL THEN
    RAISE EXCEPTION 'Active leave type not found';
  END IF;

  _year := EXTRACT(YEAR FROM _start)::INTEGER;
  IF _status = 'submitted' THEN
    _bal := private.hr_ensure_leave_balance(_company_id, _employee_id, _type, _year);
    _available := _bal.entitled_days + _bal.carried_days - _bal.used_days - _bal.pending_days;
    IF _available < _days THEN
      RAISE EXCEPTION 'Insufficient leave balance (available %, requested %)', _available, _days;
    END IF;
    UPDATE public.hr_leave_balances
    SET pending_days = pending_days + _days, updated_at = now()
    WHERE id = _bal.id;
  END IF;

  INSERT INTO public.hr_leave_requests (
    company_id, request_number, employee_id, leave_type_id, start_date, end_date,
    days, status, reason, created_by
  ) VALUES (
    _company_id,
    private.hr_allocate_document_number(_company_id, 'leave'),
    _employee_id, _type, _start, _end, _days, _status,
    NULLIF(trim(_payload->>'reason'), ''),
    auth.uid()
  ) RETURNING * INTO _row;

  IF _row.status = 'submitted' AND COALESCE(_requires, true) = false THEN
    _bal := private.hr_ensure_leave_balance(_company_id, _employee_id, _type, _year);
    UPDATE public.hr_leave_balances
    SET pending_days = GREATEST(pending_days - _row.days, 0),
        used_days = used_days + _row.days,
        updated_at = now()
    WHERE id = _bal.id;
    UPDATE public.hr_leave_requests SET
      status = 'approved',
      decided_by = auth.uid(),
      decided_at = now(),
      decision_notes = 'Auto-approved (approval not required)',
      version = version + 1,
      updated_at = now()
    WHERE id = _row.id
    RETURNING * INTO _row;
  END IF;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_leave_request', _row.id, 'self_create',
    format('Self leave %s (%s)', _row.request_number, _row.status),
    jsonb_build_object('status', _row.status)
  );

  RETURN jsonb_build_object(
    'id', _row.id,
    'requestNumber', _row.request_number,
    'status', _row.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.clock_hr_self_attendance(
  _company_id UUID,
  _action TEXT,
  _work_date DATE DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _employee_id UUID;
  _date DATE := COALESCE(_work_date, CURRENT_DATE);
  _row public.hr_attendance_logs%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.self_service');
  PERFORM private.hr_require_enabled(_company_id);
  _employee_id := private.hr_resolve_self_employee(_company_id);
  IF _employee_id IS NULL THEN
    RAISE EXCEPTION 'Your login is not linked to an employee profile';
  END IF;
  IF _action NOT IN ('check_in', 'check_out') THEN
    RAISE EXCEPTION 'Action must be check_in or check_out';
  END IF;

  SELECT * INTO _row
  FROM public.hr_attendance_logs
  WHERE company_id = _company_id
    AND employee_id = _employee_id
    AND work_date = _date
    AND status <> 'cancelled'
  FOR UPDATE;

  IF _action = 'check_in' THEN
    IF _row.id IS NOT NULL AND _row.check_in_at IS NOT NULL THEN
      RAISE EXCEPTION 'Already checked in for %', _date;
    END IF;
    IF _row.id IS NULL THEN
      INSERT INTO public.hr_attendance_logs (
        company_id, employee_id, work_date, check_in_at, source, status, notes, created_by
      ) VALUES (
        _company_id, _employee_id, _date, now(), 'self_service', 'open',
        NULLIF(trim(_notes), ''), auth.uid()
      ) RETURNING * INTO _row;
    ELSE
      UPDATE public.hr_attendance_logs SET
        check_in_at = now(),
        source = 'self_service',
        notes = COALESCE(NULLIF(trim(_notes), ''), notes),
        updated_at = now()
      WHERE id = _row.id
      RETURNING * INTO _row;
    END IF;
  ELSE
    IF _row.id IS NULL OR _row.check_in_at IS NULL THEN
      RAISE EXCEPTION 'Check in before checking out';
    END IF;
    IF _row.check_out_at IS NOT NULL THEN
      RAISE EXCEPTION 'Already checked out for %', _date;
    END IF;
    UPDATE public.hr_attendance_logs SET
      check_out_at = now(),
      status = 'complete',
      notes = COALESCE(NULLIF(trim(_notes), ''), notes),
      updated_at = now()
    WHERE id = _row.id
    RETURNING * INTO _row;
  END IF;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_attendance_log', _row.id, 'self_clock',
    format('Self %s on %s', _action, _date),
    jsonb_build_object('action', _action, 'status', _row.status)
  );

  RETURN jsonb_build_object(
    'id', _row.id,
    'workDate', _row.work_date,
    'checkInAt', _row.check_in_at,
    'checkOutAt', _row.check_out_at,
    'status', _row.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_hr_self_attendance(
  _company_id UUID,
  _from_date DATE DEFAULT NULL,
  _to_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _employee_id UUID;
  _from DATE := COALESCE(_from_date, (CURRENT_DATE - INTERVAL '14 days')::DATE);
  _to DATE := COALESCE(_to_date, CURRENT_DATE);
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.self_service');
  _employee_id := private.hr_resolve_self_employee(_company_id);
  IF _employee_id IS NULL THEN
    RETURN jsonb_build_object('linked', false, 'items', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object(
    'linked', true,
    'employeeId', _employee_id,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id,
        'workDate', l.work_date,
        'checkInAt', l.check_in_at,
        'checkOutAt', l.check_out_at,
        'source', l.source,
        'status', l.status,
        'notes', l.notes
      ) ORDER BY l.work_date DESC)
      FROM public.hr_attendance_logs l
      WHERE l.company_id = _company_id
        AND l.employee_id = _employee_id
        AND l.work_date BETWEEN _from AND _to
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_hr_manager_team(
  _company_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _manager_id UUID;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.manager');
  _manager_id := private.hr_resolve_self_employee(_company_id);
  IF _manager_id IS NULL THEN
    RETURN jsonb_build_object(
      'linked', false,
      'items', '[]'::jsonb,
      'message', 'Manager login is not linked to an employee profile.'
    );
  END IF;

  RETURN jsonb_build_object(
    'linked', true,
    'managerEmployeeId', _manager_id,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id,
        'employeeNumber', e.employee_number,
        'firstName', e.first_name,
        'lastName', e.last_name,
        'status', e.status,
        'departmentName', d.name,
        'designationName', g.name
      ) ORDER BY e.employee_number)
      FROM public.hr_employee_profiles p
      JOIN public.payroll_employees e ON e.id = p.employee_id
      LEFT JOIN public.hr_departments d ON d.id = p.department_id
      LEFT JOIN public.hr_designations g ON g.id = p.designation_id
      WHERE p.company_id = _company_id
        AND p.manager_employee_id = _manager_id
        AND e.status = 'active'
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_hr_approvals_inbox(
  _company_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _manager_id UUID;
  _is_hr_approver BOOLEAN := false;
  _is_attendance_admin BOOLEAN := false;
  _team UUID[];
BEGIN
  -- Accessible to leave approvers, managers, attendance admins, or approvals managers.
  IF public.has_company_permission(_company_id, 'hr.approvals.manage')
     OR public.has_company_permission(_company_id, 'hr.leave.approve')
     OR public.has_company_permission(_company_id, 'hr.manager')
     OR public.has_company_permission(_company_id, 'hr.attendance.manage') THEN
    NULL; -- gate via individual branches below
  ELSE
    RAISE EXCEPTION 'Missing permission to view HR approvals';
  END IF;

  _manager_id := private.hr_resolve_self_employee(_company_id);
  _is_hr_approver := public.has_company_permission(_company_id, 'hr.leave.approve')
                  OR public.has_company_permission(_company_id, 'hr.leave.manage')
                  OR public.has_company_permission(_company_id, 'hr.approvals.manage');
  _is_attendance_admin := public.has_company_permission(_company_id, 'hr.attendance.manage')
                       OR public.has_company_permission(_company_id, 'hr.approvals.manage');

  IF _manager_id IS NOT NULL THEN
    SELECT COALESCE(array_agg(p.employee_id), ARRAY[]::UUID[]) INTO _team
    FROM public.hr_employee_profiles p
    WHERE p.company_id = _company_id AND p.manager_employee_id = _manager_id;
  ELSE
    _team := ARRAY[]::UUID[];
  END IF;

  RETURN jsonb_build_object(
    'leave', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'kind', 'leave',
        'requestNumber', r.request_number,
        'employeeId', r.employee_id,
        'employeeName', trim(both FROM concat_ws(' ', e.first_name, e.last_name)),
        'summary', format('%s · %s to %s (%s days)', t.code, r.start_date, r.end_date, r.days),
        'status', r.status,
        'updatedAt', r.updated_at
      ) ORDER BY r.updated_at DESC)
      FROM public.hr_leave_requests r
      JOIN public.payroll_employees e ON e.id = r.employee_id
      JOIN public.hr_leave_types t ON t.id = r.leave_type_id
      WHERE r.company_id = _company_id
        AND r.status = 'submitted'
        AND (
          _is_hr_approver
          OR (public.has_company_permission(_company_id, 'hr.manager') AND r.employee_id = ANY (_team))
        )
    ), '[]'::jsonb),
    'attendanceCorrections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'kind', 'attendance_correction',
        'employeeId', c.employee_id,
        'employeeName', trim(both FROM concat_ws(' ', e.first_name, e.last_name)),
        'summary', format('Correction for %s', c.work_date),
        'status', c.status,
        'updatedAt', c.updated_at
      ) ORDER BY c.updated_at DESC)
      FROM public.hr_attendance_corrections c
      JOIN public.payroll_employees e ON e.id = c.employee_id
      WHERE c.company_id = _company_id
        AND c.status = 'submitted'
        AND (
          _is_attendance_admin
          OR (public.has_company_permission(_company_id, 'hr.manager') AND c.employee_id = ANY (_team))
        )
    ), '[]'::jsonb)
  );
END;
$$;

-- Managers can decide team leave when they have hr.manager (in addition to leave.approve path).
CREATE OR REPLACE FUNCTION public.decide_hr_leave_request(
  _company_id UUID,
  _request_id UUID,
  _decision TEXT,
  _decision_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.hr_leave_requests%ROWTYPE;
  _bal public.hr_leave_balances%ROWTYPE;
  _manager_id UUID;
  _allowed BOOLEAN := false;
BEGIN
  IF public.has_company_permission(_company_id, 'hr.leave.approve')
     OR public.has_company_permission(_company_id, 'hr.leave.manage') THEN
    _allowed := true;
  ELSIF public.has_company_permission(_company_id, 'hr.manager') THEN
    _manager_id := private.hr_resolve_self_employee(_company_id);
    SELECT EXISTS (
      SELECT 1 FROM public.hr_employee_profiles p
      WHERE p.company_id = _company_id
        AND p.employee_id = (
          SELECT r.employee_id FROM public.hr_leave_requests r
          WHERE r.id = _request_id AND r.company_id = _company_id
        )
        AND p.manager_employee_id = _manager_id
    ) INTO _allowed;
  END IF;
  IF NOT _allowed THEN
    RAISE EXCEPTION 'Missing permission to approve leave';
  END IF;
  PERFORM private.hr_require_enabled(_company_id);
  IF _decision NOT IN ('approved', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Decision must be approved, rejected, or cancelled';
  END IF;

  SELECT * INTO _row FROM public.hr_leave_requests
  WHERE id = _request_id AND company_id = _company_id FOR UPDATE;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Leave request not found';
  END IF;
  IF _row.status <> 'submitted' THEN
    RAISE EXCEPTION 'Only submitted leave requests can be decided';
  END IF;

  _bal := private.hr_ensure_leave_balance(
    _company_id, _row.employee_id, _row.leave_type_id, EXTRACT(YEAR FROM _row.start_date)::INTEGER
  );

  IF _decision = 'approved' THEN
    UPDATE public.hr_leave_balances
    SET pending_days = GREATEST(pending_days - _row.days, 0),
        used_days = used_days + _row.days,
        updated_at = now()
    WHERE id = _bal.id;
  ELSE
    UPDATE public.hr_leave_balances
    SET pending_days = GREATEST(pending_days - _row.days, 0),
        updated_at = now()
    WHERE id = _bal.id;
  END IF;

  UPDATE public.hr_leave_requests SET
    status = _decision,
    decided_by = auth.uid(),
    decided_at = now(),
    decision_notes = NULLIF(trim(_decision_notes), ''),
    version = version + 1,
    updated_at = now()
  WHERE id = _row.id
  RETURNING * INTO _row;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_leave_request', _row.id, 'decide',
    format('Leave %s %s', _row.request_number, _decision),
    jsonb_build_object('status', _row.status)
  );

  RETURN jsonb_build_object('id', _row.id, 'requestNumber', _row.request_number, 'status', _row.status);
END;
$$;

REVOKE ALL ON FUNCTION public.link_hr_employee_user(UUID, UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_hr_self_context(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_hr_self_profile(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_self_leave_requests(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_hr_self_leave_request(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clock_hr_self_attendance(UUID, TEXT, DATE, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_self_attendance(UUID, DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_manager_team(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_approvals_inbox(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.link_hr_employee_user(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hr_self_context(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_hr_self_profile(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_self_leave_requests(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_hr_self_leave_request(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clock_hr_self_attendance(UUID, TEXT, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_self_attendance(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_manager_team(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_approvals_inbox(UUID) TO authenticated;