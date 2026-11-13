-- HR-05: Attendance + Shifts & Rosters (additive, idempotent).
-- Requires 20261109190000_hr_management_foundation.sql
-- Clients SELECT under RLS; writes via SECURITY DEFINER RPCs.

-- ---------------------------------------------------------------------------
-- Shift templates & assignments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_shift_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '17:00',
  break_minutes INTEGER NOT NULL DEFAULT 60 CHECK (break_minutes BETWEEN 0 AND 480),
  weekly_off_mask INTEGER NOT NULL DEFAULT 65 CHECK (weekly_off_mask BETWEEN 0 AND 127),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 100000),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_shift_templates_code_len CHECK (char_length(trim(code)) BETWEEN 1 AND 40),
  CONSTRAINT hr_shift_templates_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  CONSTRAINT hr_shift_templates_tz_len CHECK (char_length(trim(timezone)) BETWEEN 1 AND 64)
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_shift_templates_company_code_uidx
  ON public.hr_shift_templates (company_id, lower(code));
CREATE INDEX IF NOT EXISTS hr_shift_templates_company_active_idx
  ON public.hr_shift_templates (company_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS public.hr_shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  shift_template_id UUID NOT NULL REFERENCES public.hr_shift_templates(id) ON DELETE RESTRICT,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_shift_assignments_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS hr_shift_assignments_emp_idx
  ON public.hr_shift_assignments (company_id, employee_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS hr_shift_assignments_shift_idx
  ON public.hr_shift_assignments (company_id, shift_template_id, effective_from DESC);

-- ---------------------------------------------------------------------------
-- Attendance logs & corrections
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'self_service', 'import', 'device', 'system')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'complete', 'exception', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_attendance_logs_checkout_after_checkin CHECK (
    check_out_at IS NULL OR check_in_at IS NULL OR check_out_at >= check_in_at
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_attendance_logs_emp_date_uidx
  ON public.hr_attendance_logs (company_id, employee_id, work_date)
  WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS hr_attendance_logs_company_date_idx
  ON public.hr_attendance_logs (company_id, work_date DESC, status);

CREATE TABLE IF NOT EXISTS public.hr_attendance_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  attendance_log_id UUID REFERENCES public.hr_attendance_logs(id) ON DELETE SET NULL,
  employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  requested_check_in_at TIMESTAMPTZ,
  requested_check_out_at TIMESTAMPTZ,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'approved', 'rejected', 'cancelled')),
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_notes TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_attendance_corrections_reason_len CHECK (char_length(trim(reason)) BETWEEN 1 AND 500),
  CONSTRAINT hr_attendance_corrections_times CHECK (
    requested_check_out_at IS NULL
    OR requested_check_in_at IS NULL
    OR requested_check_out_at >= requested_check_in_at
  )
);

CREATE INDEX IF NOT EXISTS hr_attendance_corrections_status_idx
  ON public.hr_attendance_corrections (company_id, status, work_date DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_shift_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_attendance_corrections ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hr_shift_templates','hr_shift_assignments',
    'hr_attendance_logs','hr_attendance_corrections'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "HR viewers can read %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "HR viewers can read %s" ON public.%I FOR SELECT TO authenticated USING (
        public.is_company_member(company_id)
        AND public.has_company_permission(company_id, ''hr.view'')
      )', t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS "No direct insert %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "No direct insert %s" ON public.%I FOR INSERT TO authenticated WITH CHECK (false)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "No direct update %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "No direct update %s" ON public.%I FOR UPDATE TO authenticated USING (false)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "No direct delete %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "No direct delete %s" ON public.%I FOR DELETE TO authenticated USING (false)', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Shift RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_hr_shift_templates(
  _company_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  RETURN jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'code', s.code,
        'name', s.name,
        'timezone', s.timezone,
        'startTime', s.start_time::TEXT,
        'endTime', s.end_time::TEXT,
        'breakMinutes', s.break_minutes,
        'weeklyOffMask', s.weekly_off_mask,
        'isActive', s.is_active,
        'sortOrder', s.sort_order,
        'notes', s.notes,
        'updatedAt', s.updated_at
      ) ORDER BY s.sort_order, s.name)
      FROM public.hr_shift_templates s
      WHERE s.company_id = _company_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_shift_template(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id', '')::UUID;
  _code TEXT := NULLIF(trim(_payload->>'code'), '');
  _name TEXT := NULLIF(trim(_payload->>'name'), '');
  _row public.hr_shift_templates%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.attendance.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _code IS NULL OR _name IS NULL THEN
    RAISE EXCEPTION 'Shift code and name are required';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.hr_shift_templates (
      company_id, code, name, timezone, start_time, end_time, break_minutes,
      weekly_off_mask, is_active, sort_order, notes
    ) VALUES (
      _company_id, _code, _name,
      COALESCE(NULLIF(trim(_payload->>'timezone'), ''), 'UTC'),
      COALESCE(NULLIF(_payload->>'startTime', '')::TIME, '09:00'::TIME),
      COALESCE(NULLIF(_payload->>'endTime', '')::TIME, '17:00'::TIME),
      COALESCE((_payload->>'breakMinutes')::INTEGER, 60),
      COALESCE((_payload->>'weeklyOffMask')::INTEGER, 65),
      COALESCE((_payload->>'isActive')::BOOLEAN, true),
      COALESCE((_payload->>'sortOrder')::INTEGER, 100),
      NULLIF(trim(_payload->>'notes'), '')
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_shift_templates SET
      code = _code,
      name = _name,
      timezone = COALESCE(NULLIF(trim(_payload->>'timezone'), ''), timezone),
      start_time = COALESCE(NULLIF(_payload->>'startTime', '')::TIME, start_time),
      end_time = COALESCE(NULLIF(_payload->>'endTime', '')::TIME, end_time),
      break_minutes = COALESCE((_payload->>'breakMinutes')::INTEGER, break_minutes),
      weekly_off_mask = COALESCE((_payload->>'weeklyOffMask')::INTEGER, weekly_off_mask),
      is_active = COALESCE((_payload->>'isActive')::BOOLEAN, is_active),
      sort_order = COALESCE((_payload->>'sortOrder')::INTEGER, sort_order),
      notes = NULLIF(trim(_payload->>'notes'), ''),
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
  END IF;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Shift template not found';
  END IF;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_shift_template', _row.id,
    CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,
    format('Shift %s (%s)', _row.code, _row.name),
    jsonb_build_object('code', _row.code, 'isActive', _row.is_active)
  );

  RETURN jsonb_build_object('id', _row.id, 'code', _row.code, 'name', _row.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_hr_shift_assignments(
  _company_id UUID,
  _employee_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  RETURN jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'employeeId', a.employee_id,
        'employeeName', trim(both FROM concat_ws(' ', e.first_name, e.last_name)),
        'employeeNumber', e.employee_number,
        'shiftTemplateId', a.shift_template_id,
        'shiftCode', s.code,
        'shiftName', s.name,
        'effectiveFrom', a.effective_from,
        'effectiveTo', a.effective_to,
        'notes', a.notes,
        'updatedAt', a.updated_at
      ) ORDER BY a.effective_from DESC, e.employee_number)
      FROM public.hr_shift_assignments a
      JOIN public.payroll_employees e ON e.id = a.employee_id
      JOIN public.hr_shift_templates s ON s.id = a.shift_template_id
      WHERE a.company_id = _company_id
        AND (_employee_id IS NULL OR a.employee_id = _employee_id)
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_shift_assignment(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id', '')::UUID;
  _employee UUID := NULLIF(_payload->>'employeeId', '')::UUID;
  _shift UUID := NULLIF(_payload->>'shiftTemplateId', '')::UUID;
  _from DATE := COALESCE(NULLIF(_payload->>'effectiveFrom', '')::DATE, CURRENT_DATE);
  _to DATE := NULLIF(_payload->>'effectiveTo', '')::DATE;
  _row public.hr_shift_assignments%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.attendance.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _employee IS NULL OR _shift IS NULL THEN
    RAISE EXCEPTION 'Employee and shift template are required';
  END IF;
  IF _to IS NOT NULL AND _to < _from THEN
    RAISE EXCEPTION 'Effective to must be on or after effective from';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.payroll_employees e
    WHERE e.id = _employee AND e.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hr_shift_templates s
    WHERE s.id = _shift AND s.company_id = _company_id AND s.is_active
  ) THEN
    RAISE EXCEPTION 'Active shift template not found';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.hr_shift_assignments (
      company_id, employee_id, shift_template_id, effective_from, effective_to, notes, created_by
    ) VALUES (
      _company_id, _employee, _shift, _from, _to,
      NULLIF(trim(_payload->>'notes'), ''),
      auth.uid()
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_shift_assignments SET
      employee_id = _employee,
      shift_template_id = _shift,
      effective_from = _from,
      effective_to = _to,
      notes = NULLIF(trim(_payload->>'notes'), ''),
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
  END IF;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Shift assignment not found';
  END IF;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_shift_assignment', _row.id,
    CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,
    format('Shift assignment for employee %s', _row.employee_id),
    jsonb_build_object('shiftTemplateId', _row.shift_template_id, 'effectiveFrom', _row.effective_from)
  );

  RETURN jsonb_build_object('id', _row.id, 'employeeId', _row.employee_id, 'shiftTemplateId', _row.shift_template_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Attendance RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_hr_attendance_logs(
  _company_id UUID,
  _from_date DATE DEFAULT NULL,
  _to_date DATE DEFAULT NULL,
  _status TEXT DEFAULT NULL,
  _employee_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _from DATE := COALESCE(_from_date, (CURRENT_DATE - INTERVAL '14 days')::DATE);
  _to DATE := COALESCE(_to_date, CURRENT_DATE);
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  RETURN jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id,
        'employeeId', l.employee_id,
        'employeeName', trim(both FROM concat_ws(' ', e.first_name, e.last_name)),
        'employeeNumber', e.employee_number,
        'workDate', l.work_date,
        'checkInAt', l.check_in_at,
        'checkOutAt', l.check_out_at,
        'source', l.source,
        'status', l.status,
        'notes', l.notes,
        'updatedAt', l.updated_at
      ) ORDER BY l.work_date DESC, e.employee_number)
      FROM public.hr_attendance_logs l
      JOIN public.payroll_employees e ON e.id = l.employee_id
      WHERE l.company_id = _company_id
        AND l.work_date BETWEEN _from AND _to
        AND (_employee_id IS NULL OR l.employee_id = _employee_id)
        AND (_status IS NULL OR _status = '' OR _status = 'all' OR l.status = _status)
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_attendance_log(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id', '')::UUID;
  _employee UUID := NULLIF(_payload->>'employeeId', '')::UUID;
  _work_date DATE := COALESCE(NULLIF(_payload->>'workDate', '')::DATE, CURRENT_DATE);
  _check_in TIMESTAMPTZ := NULLIF(_payload->>'checkInAt', '')::TIMESTAMPTZ;
  _check_out TIMESTAMPTZ := NULLIF(_payload->>'checkOutAt', '')::TIMESTAMPTZ;
  _status TEXT := COALESCE(NULLIF(_payload->>'status', ''), 'open');
  _source TEXT := COALESCE(NULLIF(_payload->>'source', ''), 'manual');
  _row public.hr_attendance_logs%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.attendance.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _employee IS NULL THEN
    RAISE EXCEPTION 'Employee is required';
  END IF;
  IF _status NOT IN ('open', 'complete', 'exception', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid attendance status';
  END IF;
  IF _source NOT IN ('manual', 'self_service', 'import', 'device', 'system') THEN
    RAISE EXCEPTION 'Invalid attendance source';
  END IF;
  IF _check_out IS NOT NULL AND _check_in IS NOT NULL AND _check_out < _check_in THEN
    RAISE EXCEPTION 'Check-out must be on or after check-in';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.payroll_employees e
    WHERE e.id = _employee AND e.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  IF _check_in IS NOT NULL AND _check_out IS NOT NULL AND _status = 'open' THEN
    _status := 'complete';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.hr_attendance_logs (
      company_id, employee_id, work_date, check_in_at, check_out_at, source, status, notes, created_by
    ) VALUES (
      _company_id, _employee, _work_date, _check_in, _check_out, _source, _status,
      NULLIF(trim(_payload->>'notes'), ''),
      auth.uid()
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_attendance_logs SET
      employee_id = _employee,
      work_date = _work_date,
      check_in_at = _check_in,
      check_out_at = _check_out,
      source = _source,
      status = _status,
      notes = NULLIF(trim(_payload->>'notes'), ''),
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
  END IF;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Attendance log not found';
  END IF;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_attendance_log', _row.id,
    CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,
    format('Attendance %s on %s (%s)', _row.employee_id, _row.work_date, _row.status),
    jsonb_build_object('status', _row.status, 'workDate', _row.work_date)
  );

  RETURN jsonb_build_object(
    'id', _row.id,
    'employeeId', _row.employee_id,
    'workDate', _row.work_date,
    'status', _row.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_hr_attendance_corrections(
  _company_id UUID,
  _status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  RETURN jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'attendanceLogId', c.attendance_log_id,
        'employeeId', c.employee_id,
        'employeeName', trim(both FROM concat_ws(' ', e.first_name, e.last_name)),
        'employeeNumber', e.employee_number,
        'workDate', c.work_date,
        'requestedCheckInAt', c.requested_check_in_at,
        'requestedCheckOutAt', c.requested_check_out_at,
        'reason', c.reason,
        'status', c.status,
        'decisionNotes', c.decision_notes,
        'decidedAt', c.decided_at,
        'updatedAt', c.updated_at
      ) ORDER BY c.updated_at DESC)
      FROM public.hr_attendance_corrections c
      JOIN public.payroll_employees e ON e.id = c.employee_id
      WHERE c.company_id = _company_id
        AND (_status IS NULL OR _status = '' OR _status = 'all' OR c.status = _status)
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_attendance_correction(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id', '')::UUID;
  _employee UUID := NULLIF(_payload->>'employeeId', '')::UUID;
  _work_date DATE := COALESCE(NULLIF(_payload->>'workDate', '')::DATE, CURRENT_DATE);
  _reason TEXT := NULLIF(trim(_payload->>'reason'), '');
  _row public.hr_attendance_corrections%ROWTYPE;
  _log_id UUID;
BEGIN
  -- Managers/admins can submit on behalf; ESS path lands in HR-07 with stricter scope.
  IF public.has_company_permission(_company_id, 'hr.attendance.manage')
     OR public.has_company_permission(_company_id, 'hr.manager') THEN
    PERFORM private.hr_require_permission(_company_id,
      CASE WHEN public.has_company_permission(_company_id, 'hr.attendance.manage')
        THEN 'hr.attendance.manage' ELSE 'hr.manager' END);
  ELSE
    RAISE EXCEPTION 'Missing permission to submit attendance corrections';
  END IF;
  PERFORM private.hr_require_enabled(_company_id);
  IF _employee IS NULL OR _reason IS NULL THEN
    RAISE EXCEPTION 'Employee and reason are required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.payroll_employees e
    WHERE e.id = _employee AND e.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  SELECT l.id INTO _log_id
  FROM public.hr_attendance_logs l
  WHERE l.company_id = _company_id
    AND l.employee_id = _employee
    AND l.work_date = _work_date
    AND l.status <> 'cancelled'
  LIMIT 1;

  IF _id IS NULL THEN
    INSERT INTO public.hr_attendance_corrections (
      company_id, attendance_log_id, employee_id, work_date,
      requested_check_in_at, requested_check_out_at, reason, status, created_by
    ) VALUES (
      _company_id, _log_id, _employee, _work_date,
      NULLIF(_payload->>'requestedCheckInAt', '')::TIMESTAMPTZ,
      NULLIF(_payload->>'requestedCheckOutAt', '')::TIMESTAMPTZ,
      _reason, 'submitted', auth.uid()
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_attendance_corrections SET
      requested_check_in_at = NULLIF(_payload->>'requestedCheckInAt', '')::TIMESTAMPTZ,
      requested_check_out_at = NULLIF(_payload->>'requestedCheckOutAt', '')::TIMESTAMPTZ,
      reason = _reason,
      version = version + 1,
      updated_at = now()
    WHERE id = _id AND company_id = _company_id AND status = 'submitted'
    RETURNING * INTO _row;
  END IF;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Attendance correction not found or not editable';
  END IF;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_attendance_correction', _row.id,
    CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,
    format('Attendance correction %s (%s)', _row.work_date, _row.status),
    jsonb_build_object('status', _row.status, 'employeeId', _row.employee_id)
  );

  RETURN jsonb_build_object('id', _row.id, 'status', _row.status, 'workDate', _row.work_date);
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_hr_attendance_correction(
  _company_id UUID,
  _correction_id UUID,
  _decision TEXT,
  _decision_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.hr_attendance_corrections%ROWTYPE;
  _log public.hr_attendance_logs%ROWTYPE;
  _status TEXT;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.attendance.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected';
  END IF;

  SELECT * INTO _row
  FROM public.hr_attendance_corrections
  WHERE id = _correction_id AND company_id = _company_id
  FOR UPDATE;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Attendance correction not found';
  END IF;
  IF _row.status <> 'submitted' THEN
    RAISE EXCEPTION 'Only submitted corrections can be decided';
  END IF;

  _status := _decision;
  UPDATE public.hr_attendance_corrections SET
    status = _status,
    decided_by = auth.uid(),
    decided_at = now(),
    decision_notes = NULLIF(trim(_decision_notes), ''),
    version = version + 1,
    updated_at = now()
  WHERE id = _row.id
  RETURNING * INTO _row;

  IF _status = 'approved' THEN
    IF _row.attendance_log_id IS NOT NULL THEN
      UPDATE public.hr_attendance_logs SET
        check_in_at = COALESCE(_row.requested_check_in_at, check_in_at),
        check_out_at = COALESCE(_row.requested_check_out_at, check_out_at),
        status = CASE
          WHEN COALESCE(_row.requested_check_in_at, check_in_at) IS NOT NULL
           AND COALESCE(_row.requested_check_out_at, check_out_at) IS NOT NULL
          THEN 'complete'
          ELSE status
        END,
        updated_at = now()
      WHERE id = _row.attendance_log_id AND company_id = _company_id
      RETURNING * INTO _log;
    ELSE
      INSERT INTO public.hr_attendance_logs (
        company_id, employee_id, work_date, check_in_at, check_out_at,
        source, status, notes, created_by
      ) VALUES (
        _company_id, _row.employee_id, _row.work_date,
        _row.requested_check_in_at, _row.requested_check_out_at,
        'system',
        CASE
          WHEN _row.requested_check_in_at IS NOT NULL AND _row.requested_check_out_at IS NOT NULL
          THEN 'complete' ELSE 'open'
        END,
        'Applied from approved correction',
        auth.uid()
      ) RETURNING * INTO _log;

      UPDATE public.hr_attendance_corrections
      SET attendance_log_id = _log.id
      WHERE id = _row.id;
    END IF;
  END IF;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_attendance_correction', _row.id, 'decide',
    format('Attendance correction %s', _status),
    jsonb_build_object('status', _status)
  );

  RETURN jsonb_build_object('id', _row.id, 'status', _row.status);
END;
$$;

-- Refresh dashboard attendance exception count when foundation KPI RPC exists.
CREATE OR REPLACE FUNCTION public.get_hr_dashboard_kpis(
  _company_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _settings public.hr_settings%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  PERFORM private.hr_seed_defaults(_company_id);
  SELECT * INTO _settings FROM public.hr_settings WHERE company_id = _company_id;

  RETURN jsonb_build_object(
    'enabled', COALESCE(_settings.enabled, false),
    'activeEmployees', (
      SELECT count(*)::INTEGER FROM public.payroll_employees e
      WHERE e.company_id = _company_id AND e.status = 'active'
    ),
    'archivedEmployees', (
      SELECT count(*)::INTEGER FROM public.payroll_employees e
      WHERE e.company_id = _company_id AND e.status = 'archived'
    ),
    'terminatedEmployees', (
      SELECT count(*)::INTEGER FROM public.payroll_employees e
      WHERE e.company_id = _company_id AND e.status = 'terminated'
    ),
    'profilesLinked', (
      SELECT count(*)::INTEGER FROM public.hr_employee_profiles p
      WHERE p.company_id = _company_id
    ),
    'departments', (
      SELECT count(*)::INTEGER FROM public.hr_departments d
      WHERE d.company_id = _company_id AND d.is_active
    ),
    'locations', (
      SELECT count(*)::INTEGER FROM public.hr_locations l
      WHERE l.company_id = _company_id AND l.is_active
    ),
    'pendingApprovals', (
      SELECT (
        (SELECT count(*) FROM public.hr_attendance_corrections c
         WHERE c.company_id = _company_id AND c.status = 'submitted')
        +
        CASE
          WHEN to_regclass('public.hr_leave_requests') IS NOT NULL THEN
            (SELECT count(*) FROM public.hr_leave_requests r
             WHERE r.company_id = _company_id AND r.status = 'submitted')
          ELSE 0
        END
      )::INTEGER
    ),
    'attendanceExceptions', (
      SELECT count(*)::INTEGER FROM public.hr_attendance_logs l
      WHERE l.company_id = _company_id AND l.status = 'exception'
    ),
    'expiringDocuments', 0,
    'openRequisitions', CASE
      WHEN to_regclass('public.hr_job_requisitions') IS NOT NULL THEN
        (SELECT count(*)::INTEGER FROM public.hr_job_requisitions r
         WHERE r.company_id = _company_id AND r.status = 'open')
      ELSE 0
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_hr_shift_templates(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_shift_template(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_shift_assignments(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_shift_assignment(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_attendance_logs(UUID, DATE, DATE, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_attendance_log(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_attendance_corrections(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_attendance_correction(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_hr_attendance_correction(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_hr_shift_templates(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_shift_template(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_shift_assignments(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_shift_assignment(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_attendance_logs(UUID, DATE, DATE, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_attendance_log(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_attendance_corrections(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_attendance_correction(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_hr_attendance_correction(UUID, UUID, TEXT, TEXT) TO authenticated;