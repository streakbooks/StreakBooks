-- HR-10: Transfers / promotions / offboarding clearance (additive).
-- Approving a transfer updates HR profile + position history.
-- Offboarding does NOT terminate payroll_employees; that is Payroll handoff (HR-11).

ALTER TABLE public.hr_settings
  ADD COLUMN IF NOT EXISTS transfer_prefix TEXT NOT NULL DEFAULT 'XFER-'
    CHECK (char_length(trim(transfer_prefix)) BETWEEN 1 AND 12);
ALTER TABLE public.hr_settings
  ADD COLUMN IF NOT EXISTS next_transfer_number INTEGER NOT NULL DEFAULT 1 CHECK (next_transfer_number >= 1);
ALTER TABLE public.hr_settings
  ADD COLUMN IF NOT EXISTS offboarding_prefix TEXT NOT NULL DEFAULT 'EXIT-'
    CHECK (char_length(trim(offboarding_prefix)) BETWEEN 1 AND 12);
ALTER TABLE public.hr_settings
  ADD COLUMN IF NOT EXISTS next_offboarding_number INTEGER NOT NULL DEFAULT 1 CHECK (next_offboarding_number >= 1);

CREATE TABLE IF NOT EXISTS public.hr_transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_number TEXT NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL DEFAULT 'transfer'
    CHECK (change_type IN (
      'transfer','promotion','demotion','location_change','manager_change','other'
    )),
  effective_on DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','rejected','cancelled','applied')),
  from_department_id UUID REFERENCES public.hr_departments(id) ON DELETE SET NULL,
  from_designation_id UUID REFERENCES public.hr_designations(id) ON DELETE SET NULL,
  from_location_id UUID REFERENCES public.hr_locations(id) ON DELETE SET NULL,
  from_branch_id UUID REFERENCES public.hr_branches(id) ON DELETE SET NULL,
  from_manager_employee_id UUID REFERENCES public.payroll_employees(id) ON DELETE SET NULL,
  to_department_id UUID REFERENCES public.hr_departments(id) ON DELETE SET NULL,
  to_designation_id UUID REFERENCES public.hr_designations(id) ON DELETE SET NULL,
  to_location_id UUID REFERENCES public.hr_locations(id) ON DELETE SET NULL,
  to_branch_id UUID REFERENCES public.hr_branches(id) ON DELETE SET NULL,
  to_manager_employee_id UUID REFERENCES public.payroll_employees(id) ON DELETE SET NULL,
  to_work_arrangement TEXT
    CHECK (to_work_arrangement IS NULL OR to_work_arrangement IN ('onsite','hybrid','remote','field','other')),
  reason TEXT,
  rejection_reason TEXT,
  applied_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_transfer_requests_number_len CHECK (char_length(trim(request_number)) BETWEEN 1 AND 40)
);
CREATE UNIQUE INDEX IF NOT EXISTS hr_transfer_requests_company_number_uidx
  ON public.hr_transfer_requests (company_id, lower(request_number));
CREATE INDEX IF NOT EXISTS hr_transfer_requests_status_idx
  ON public.hr_transfer_requests (company_id, status, effective_on DESC);

CREATE TABLE IF NOT EXISTS public.hr_offboarding_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  case_number TEXT NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','in_progress','completed','cancelled')),
  exit_reason TEXT NOT NULL DEFAULT 'resignation'
    CHECK (exit_reason IN ('resignation','termination','end_of_contract','retirement','other')),
  last_working_day DATE NOT NULL,
  notice_date DATE,
  completed_at TIMESTAMPTZ,
  payroll_handoff_note TEXT,
  ready_for_payroll BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_offboarding_cases_number_len CHECK (char_length(trim(case_number)) BETWEEN 1 AND 40)
);
CREATE UNIQUE INDEX IF NOT EXISTS hr_offboarding_cases_company_number_uidx
  ON public.hr_offboarding_cases (company_id, lower(case_number));
CREATE INDEX IF NOT EXISTS hr_offboarding_cases_status_idx
  ON public.hr_offboarding_cases (company_id, status, last_working_day DESC);

CREATE TABLE IF NOT EXISTS public.hr_offboarding_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.hr_offboarding_cases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  owner_role TEXT NOT NULL DEFAULT 'hr'
    CHECK (owner_role IN ('hr','manager','it','finance','employee','other')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','done','blocked','skipped')),
  due_on DATE,
  completed_at TIMESTAMPTZ,
  is_required BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_offboarding_tasks_title_len CHECK (char_length(trim(title)) BETWEEN 1 AND 200)
);
CREATE INDEX IF NOT EXISTS hr_offboarding_tasks_case_idx
  ON public.hr_offboarding_tasks (case_id, sort_order);

ALTER TABLE public.hr_transfer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_offboarding_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_offboarding_tasks ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hr_transfer_requests','hr_offboarding_cases','hr_offboarding_tasks'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "HR viewers can read %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "HR viewers can read %s" ON public.%I FOR SELECT TO authenticated USING (
        public.is_company_member(company_id)
        AND (
          public.has_company_permission(company_id, ''hr.view'')
          OR public.has_company_permission(company_id, ''hr.employees.manage'')
        )
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

CREATE OR REPLACE FUNCTION private.hr_allocate_document_number(
  _company_id UUID,
  _kind TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _prefix TEXT;
  _next INTEGER;
BEGIN
  PERFORM private.hr_seed_defaults(_company_id);
  IF _kind = 'requisition' THEN
    UPDATE public.hr_settings SET next_requisition_number = next_requisition_number + 1, updated_at = now()
    WHERE company_id = _company_id RETURNING requisition_prefix, next_requisition_number - 1 INTO _prefix, _next;
  ELSIF _kind = 'application' THEN
    UPDATE public.hr_settings SET next_application_number = next_application_number + 1, updated_at = now()
    WHERE company_id = _company_id RETURNING application_prefix, next_application_number - 1 INTO _prefix, _next;
  ELSIF _kind = 'offer' THEN
    UPDATE public.hr_settings SET next_offer_number = next_offer_number + 1, updated_at = now()
    WHERE company_id = _company_id RETURNING offer_prefix, next_offer_number - 1 INTO _prefix, _next;
  ELSIF _kind = 'onboarding' THEN
    UPDATE public.hr_settings SET next_onboarding_number = next_onboarding_number + 1, updated_at = now()
    WHERE company_id = _company_id RETURNING onboarding_prefix, next_onboarding_number - 1 INTO _prefix, _next;
  ELSIF _kind = 'leave' THEN
    UPDATE public.hr_settings SET next_leave_number = next_leave_number + 1, updated_at = now()
    WHERE company_id = _company_id RETURNING leave_prefix, next_leave_number - 1 INTO _prefix, _next;
  ELSIF _kind = 'case' THEN
    UPDATE public.hr_settings SET next_case_number = next_case_number + 1, updated_at = now()
    WHERE company_id = _company_id RETURNING case_prefix, next_case_number - 1 INTO _prefix, _next;
  ELSIF _kind = 'transfer' THEN
    UPDATE public.hr_settings SET next_transfer_number = next_transfer_number + 1, updated_at = now()
    WHERE company_id = _company_id RETURNING transfer_prefix, next_transfer_number - 1 INTO _prefix, _next;
  ELSIF _kind = 'offboarding' THEN
    UPDATE public.hr_settings SET next_offboarding_number = next_offboarding_number + 1, updated_at = now()
    WHERE company_id = _company_id RETURNING offboarding_prefix, next_offboarding_number - 1 INTO _prefix, _next;
  ELSE
    RAISE EXCEPTION 'Unknown HR document kind %', _kind;
  END IF;
  RETURN _prefix || lpad(_next::TEXT, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.list_hr_transfer_requests(
  _company_id UUID,
  _status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  RETURN jsonb_build_object('items', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id,
      'requestNumber', r.request_number,
      'employeeId', r.employee_id,
      'employeeName', trim(both FROM concat_ws(' ', e.first_name, e.last_name)),
      'employeeNumber', e.employee_number,
      'changeType', r.change_type,
      'effectiveOn', r.effective_on,
      'status', r.status,
      'toDepartmentId', r.to_department_id,
      'toDepartmentName', d.name,
      'toDesignationId', r.to_designation_id,
      'toDesignationName', des.name,
      'toLocationId', r.to_location_id,
      'toLocationName', loc.name,
      'toManagerEmployeeId', r.to_manager_employee_id,
      'toManagerName', CASE
        WHEN m.id IS NULL THEN NULL
        ELSE trim(both FROM concat_ws(' ', m.first_name, m.last_name))
      END,
      'toWorkArrangement', r.to_work_arrangement,
      'reason', r.reason,
      'appliedAt', r.applied_at,
      'updatedAt', r.updated_at
    ) ORDER BY r.updated_at DESC)
    FROM public.hr_transfer_requests r
    JOIN public.payroll_employees e ON e.id = r.employee_id
    LEFT JOIN public.hr_departments d ON d.id = r.to_department_id
    LEFT JOIN public.hr_designations des ON des.id = r.to_designation_id
    LEFT JOIN public.hr_locations loc ON loc.id = r.to_location_id
    LEFT JOIN public.payroll_employees m ON m.id = r.to_manager_employee_id
    WHERE r.company_id = _company_id
      AND (_status IS NULL OR _status = '' OR _status = 'all' OR r.status = _status)
  ), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_transfer_request(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id', '')::UUID;
  _employee UUID := NULLIF(_payload->>'employeeId', '')::UUID;
  _change TEXT := COALESCE(NULLIF(_payload->>'changeType', ''), 'transfer');
  _status TEXT := COALESCE(NULLIF(_payload->>'status', ''), 'draft');
  _effective DATE := NULLIF(_payload->>'effectiveOn', '')::DATE;
  _profile public.hr_employee_profiles%ROWTYPE;
  _row public.hr_transfer_requests%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.employees.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _employee IS NULL OR _effective IS NULL THEN
    RAISE EXCEPTION 'Employee and effective date are required';
  END IF;
  IF _change NOT IN ('transfer','promotion','demotion','location_change','manager_change','other') THEN
    RAISE EXCEPTION 'Invalid change type';
  END IF;
  IF _status NOT IN ('draft','submitted','approved','rejected','cancelled') THEN
    RAISE EXCEPTION 'Invalid transfer status for upsert';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payroll_employees e WHERE e.id = _employee AND e.company_id = _company_id) THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF _status IN ('approved','applied') THEN
    RAISE EXCEPTION 'Use decide_hr_transfer_request to approve or apply transfers';
  END IF;

  SELECT * INTO _profile FROM public.hr_employee_profiles
  WHERE employee_id = _employee AND company_id = _company_id;

  IF _id IS NULL THEN
    INSERT INTO public.hr_transfer_requests (
      company_id, request_number, employee_id, change_type, effective_on, status,
      from_department_id, from_designation_id, from_location_id, from_branch_id, from_manager_employee_id,
      to_department_id, to_designation_id, to_location_id, to_branch_id, to_manager_employee_id,
      to_work_arrangement, reason, created_by
    ) VALUES (
      _company_id,
      private.hr_allocate_document_number(_company_id, 'transfer'),
      _employee, _change, _effective, _status,
      _profile.department_id, _profile.designation_id, _profile.location_id, _profile.branch_id, _profile.manager_employee_id,
      NULLIF(_payload->>'toDepartmentId', '')::UUID,
      NULLIF(_payload->>'toDesignationId', '')::UUID,
      NULLIF(_payload->>'toLocationId', '')::UUID,
      NULLIF(_payload->>'toBranchId', '')::UUID,
      NULLIF(_payload->>'toManagerEmployeeId', '')::UUID,
      NULLIF(_payload->>'toWorkArrangement', ''),
      NULLIF(trim(_payload->>'reason'), ''),
      auth.uid()
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_transfer_requests SET
      change_type = _change,
      effective_on = _effective,
      status = _status,
      to_department_id = NULLIF(_payload->>'toDepartmentId', '')::UUID,
      to_designation_id = NULLIF(_payload->>'toDesignationId', '')::UUID,
      to_location_id = NULLIF(_payload->>'toLocationId', '')::UUID,
      to_branch_id = NULLIF(_payload->>'toBranchId', '')::UUID,
      to_manager_employee_id = NULLIF(_payload->>'toManagerEmployeeId', '')::UUID,
      to_work_arrangement = NULLIF(_payload->>'toWorkArrangement', ''),
      reason = NULLIF(trim(_payload->>'reason'), ''),
      rejection_reason = CASE WHEN _status = 'rejected' THEN NULLIF(trim(_payload->>'rejectionReason'), '') ELSE rejection_reason END,
      version = version + 1,
      updated_at = now()
    WHERE id = _id AND company_id = _company_id AND status IN ('draft','submitted','rejected')
    RETURNING * INTO _row;
  END IF;

  IF _row.id IS NULL THEN RAISE EXCEPTION 'Transfer request not found or locked'; END IF;
  PERFORM private.hr_write_audit(
    _company_id, 'hr_transfer_request', _row.id,
    CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,
    format('Transfer %s (%s)', _row.request_number, _row.status),
    jsonb_build_object('status', _row.status, 'changeType', _row.change_type)
  );
  RETURN jsonb_build_object(
    'id', _row.id, 'requestNumber', _row.request_number, 'status', _row.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_hr_transfer_request(
  _company_id UUID,
  _request_id UUID,
  _decision TEXT,
  _rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _row public.hr_transfer_requests%ROWTYPE;
  _profile public.hr_employee_profiles%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.employees.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _decision NOT IN ('approve','reject','cancel') THEN
    RAISE EXCEPTION 'Decision must be approve, reject or cancel';
  END IF;

  SELECT * INTO _row FROM public.hr_transfer_requests
  WHERE id = _request_id AND company_id = _company_id
  FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Transfer request not found'; END IF;
  IF _row.status NOT IN ('draft','submitted') THEN
    RAISE EXCEPTION 'Transfer request is not decidable in status %', _row.status;
  END IF;

  IF _decision = 'reject' THEN
    UPDATE public.hr_transfer_requests SET
      status = 'rejected',
      rejection_reason = COALESCE(NULLIF(trim(_rejection_reason), ''), 'Rejected'),
      version = version + 1, updated_at = now()
    WHERE id = _row.id RETURNING * INTO _row;
  ELSIF _decision = 'cancel' THEN
    UPDATE public.hr_transfer_requests SET
      status = 'cancelled', version = version + 1, updated_at = now()
    WHERE id = _row.id RETURNING * INTO _row;
  ELSE
    -- approve + apply to HR profile / position history (same transaction)
    SELECT * INTO _profile FROM public.hr_employee_profiles
    WHERE employee_id = _row.employee_id AND company_id = _company_id
    FOR UPDATE;
    IF _profile.employee_id IS NULL THEN
      INSERT INTO public.hr_employee_profiles (employee_id, company_id, updated_by)
      VALUES (_row.employee_id, _company_id, auth.uid())
      RETURNING * INTO _profile;
    END IF;

    UPDATE public.hr_position_history SET
      effective_to = GREATEST(_row.effective_on - 1, effective_from)
    WHERE company_id = _company_id
      AND employee_id = _row.employee_id
      AND effective_to IS NULL;

    UPDATE public.hr_employee_profiles SET
      department_id = COALESCE(_row.to_department_id, department_id),
      designation_id = COALESCE(_row.to_designation_id, designation_id),
      location_id = COALESCE(_row.to_location_id, location_id),
      branch_id = COALESCE(_row.to_branch_id, branch_id),
      manager_employee_id = COALESCE(_row.to_manager_employee_id, manager_employee_id),
      work_arrangement = COALESCE(_row.to_work_arrangement, work_arrangement),
      version = version + 1,
      updated_at = now(),
      updated_by = auth.uid()
    WHERE employee_id = _row.employee_id AND company_id = _company_id
    RETURNING * INTO _profile;

    INSERT INTO public.hr_position_history (
      company_id, employee_id, effective_from, change_type,
      department_id, designation_id, location_id, branch_id, manager_employee_id,
      work_arrangement, reason, created_by
    ) VALUES (
      _company_id, _row.employee_id, _row.effective_on, _row.change_type,
      _profile.department_id, _profile.designation_id, _profile.location_id, _profile.branch_id,
      _profile.manager_employee_id, _profile.work_arrangement, _row.reason, auth.uid()
    );

    UPDATE public.hr_transfer_requests SET
      status = 'applied',
      applied_at = now(),
      version = version + 1,
      updated_at = now()
    WHERE id = _row.id RETURNING * INTO _row;
  END IF;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_transfer_request', _row.id, _decision,
    format('Transfer %s %s', _row.request_number, _row.status),
    jsonb_build_object('status', _row.status, 'decision', _decision)
  );
  RETURN jsonb_build_object(
    'id', _row.id, 'requestNumber', _row.request_number, 'status', _row.status, 'appliedAt', _row.applied_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_hr_offboarding_cases(
  _company_id UUID,
  _status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  RETURN jsonb_build_object('items', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id,
      'caseNumber', c.case_number,
      'employeeId', c.employee_id,
      'employeeName', trim(both FROM concat_ws(' ', e.first_name, e.last_name)),
      'employeeNumber', e.employee_number,
      'status', c.status,
      'exitReason', c.exit_reason,
      'lastWorkingDay', c.last_working_day,
      'noticeDate', c.notice_date,
      'completedAt', c.completed_at,
      'readyForPayroll', c.ready_for_payroll,
      'payrollHandoffNote', c.payroll_handoff_note,
      'pendingTasks', (
        SELECT count(*)::INTEGER FROM public.hr_offboarding_tasks t
        WHERE t.case_id = c.id AND t.status = 'pending' AND t.is_required
      ),
      'updatedAt', c.updated_at
    ) ORDER BY c.updated_at DESC)
    FROM public.hr_offboarding_cases c
    JOIN public.payroll_employees e ON e.id = c.employee_id
    WHERE c.company_id = _company_id
      AND (_status IS NULL OR _status = '' OR _status = 'all' OR c.status = _status)
  ), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_hr_offboarding_case(
  _company_id UUID,
  _case_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _case public.hr_offboarding_cases%ROWTYPE;
  _emp public.payroll_employees%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  SELECT * INTO _case FROM public.hr_offboarding_cases
  WHERE id = _case_id AND company_id = _company_id;
  IF _case.id IS NULL THEN RAISE EXCEPTION 'Offboarding case not found'; END IF;
  SELECT * INTO _emp FROM public.payroll_employees WHERE id = _case.employee_id;
  RETURN jsonb_build_object(
    'case', jsonb_build_object(
      'id', _case.id,
      'caseNumber', _case.case_number,
      'employeeId', _case.employee_id,
      'employeeName', trim(both FROM concat_ws(' ', _emp.first_name, _emp.last_name)),
      'employeeNumber', _emp.employee_number,
      'status', _case.status,
      'exitReason', _case.exit_reason,
      'lastWorkingDay', _case.last_working_day,
      'noticeDate', _case.notice_date,
      'completedAt', _case.completed_at,
      'readyForPayroll', _case.ready_for_payroll,
      'payrollHandoffNote', _case.payroll_handoff_note,
      'notes', _case.notes,
      'version', _case.version
    ),
    'tasks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'ownerRole', t.owner_role,
        'status', t.status,
        'dueOn', t.due_on,
        'completedAt', t.completed_at,
        'isRequired', t.is_required,
        'sortOrder', t.sort_order,
        'notes', t.notes
      ) ORDER BY t.sort_order, t.title)
      FROM public.hr_offboarding_tasks t
      WHERE t.case_id = _case.id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_hr_offboarding_case(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _employee UUID := NULLIF(_payload->>'employeeId', '')::UUID;
  _last DATE := NULLIF(_payload->>'lastWorkingDay', '')::DATE;
  _reason TEXT := COALESCE(NULLIF(_payload->>'exitReason', ''), 'resignation');
  _case public.hr_offboarding_cases%ROWTYPE;
  _titles TEXT[] := ARRAY[
    'Collect company assets',
    'Revoke system access',
    'Exit interview',
    'Final payslip handoff to Payroll',
    'Knowledge transfer complete'
  ];
  _i INTEGER;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.employees.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _employee IS NULL OR _last IS NULL THEN
    RAISE EXCEPTION 'Employee and last working day are required';
  END IF;
  IF _reason NOT IN ('resignation','termination','end_of_contract','retirement','other') THEN
    RAISE EXCEPTION 'Invalid exit reason';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payroll_employees e WHERE e.id = _employee AND e.company_id = _company_id) THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.hr_offboarding_cases c
    WHERE c.company_id = _company_id AND c.employee_id = _employee AND c.status IN ('planned','in_progress')
  ) THEN
    RAISE EXCEPTION 'An open offboarding case already exists for this employee';
  END IF;

  INSERT INTO public.hr_offboarding_cases (
    company_id, case_number, employee_id, status, exit_reason, last_working_day,
    notice_date, payroll_handoff_note, notes, created_by
  ) VALUES (
    _company_id,
    private.hr_allocate_document_number(_company_id, 'offboarding'),
    _employee, 'planned', _reason, _last,
    NULLIF(_payload->>'noticeDate', '')::DATE,
    COALESCE(NULLIF(trim(_payload->>'payrollHandoffNote'), ''),
      'Clearance in progress — Payroll must terminate after HR marks ready_for_payroll.'),
    NULLIF(trim(_payload->>'notes'), ''),
    auth.uid()
  ) RETURNING * INTO _case;

  FOR _i IN 1..array_length(_titles, 1) LOOP
    INSERT INTO public.hr_offboarding_tasks (
      company_id, case_id, title, owner_role, status, due_on, is_required, sort_order
    ) VALUES (
      _company_id, _case.id, _titles[_i],
      CASE WHEN _i = 2 THEN 'it' WHEN _i = 4 THEN 'finance' ELSE 'hr' END,
      'pending', _last, true, _i * 10
    );
  END LOOP;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_offboarding_case', _case.id, 'create',
    format('Offboarding %s created', _case.case_number),
    jsonb_build_object('employeeId', _employee, 'lastWorkingDay', _last)
  );
  RETURN public.get_hr_offboarding_case(_company_id, _case.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_hr_offboarding_task(
  _company_id UUID,
  _task_id UUID,
  _status TEXT,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _task public.hr_offboarding_tasks%ROWTYPE;
  _pending INTEGER;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.employees.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _status NOT IN ('pending','done','blocked','skipped') THEN
    RAISE EXCEPTION 'Invalid offboarding task status';
  END IF;

  UPDATE public.hr_offboarding_tasks SET
    status = _status,
    notes = COALESCE(NULLIF(trim(_notes), ''), notes),
    completed_at = CASE WHEN _status = 'done' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = _task_id AND company_id = _company_id
  RETURNING * INTO _task;
  IF _task.id IS NULL THEN RAISE EXCEPTION 'Offboarding task not found'; END IF;

  SELECT count(*) INTO _pending
  FROM public.hr_offboarding_tasks
  WHERE case_id = _task.case_id AND status = 'pending' AND is_required;

  UPDATE public.hr_offboarding_cases SET
    status = CASE
      WHEN _pending = 0 THEN 'completed'
      WHEN status = 'planned' THEN 'in_progress'
      ELSE status
    END,
    completed_at = CASE WHEN _pending = 0 THEN now() ELSE completed_at END,
    ready_for_payroll = (_pending = 0),
    payroll_handoff_note = CASE
      WHEN _pending = 0 THEN COALESCE(
        payroll_handoff_note,
        'Clearance complete — ready for Payroll termination / final settlement.'
      )
      ELSE payroll_handoff_note
    END,
    version = version + 1,
    updated_at = now()
  WHERE id = _task.case_id AND company_id = _company_id;

  RETURN public.get_hr_offboarding_case(_company_id, _task.case_id);
END;
$$;

REVOKE ALL ON FUNCTION public.list_hr_transfer_requests(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_transfer_request(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_hr_transfer_request(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_offboarding_cases(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_hr_offboarding_case(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_hr_offboarding_case(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_hr_offboarding_task(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_hr_transfer_requests(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_transfer_request(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_hr_transfer_request(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_offboarding_cases(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hr_offboarding_case(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_hr_offboarding_case(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_hr_offboarding_task(UUID, UUID, TEXT, TEXT) TO authenticated;