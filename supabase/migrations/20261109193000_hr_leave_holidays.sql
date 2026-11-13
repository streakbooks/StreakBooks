-- HR-06: Leave Management + Holidays & Calendar (additive, idempotent).
-- Requires foundation + preferably attendance migration for KPI join.
-- Leave balances are DB-enforced on submit/approve/reject/cancel.

-- ---------------------------------------------------------------------------
-- Settings sequences for leave requests
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_settings
  ADD COLUMN IF NOT EXISTS leave_prefix TEXT NOT NULL DEFAULT 'LV-'
    CHECK (char_length(trim(leave_prefix)) BETWEEN 1 AND 12);
ALTER TABLE public.hr_settings
  ADD COLUMN IF NOT EXISTS next_leave_number INTEGER NOT NULL DEFAULT 1 CHECK (next_leave_number >= 1);

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
  _number TEXT;
BEGIN
  PERFORM private.hr_seed_defaults(_company_id);
  IF _kind = 'requisition' THEN
    UPDATE public.hr_settings
    SET next_requisition_number = next_requisition_number + 1, updated_at = now()
    WHERE company_id = _company_id
    RETURNING requisition_prefix, next_requisition_number - 1 INTO _prefix, _next;
  ELSIF _kind = 'application' THEN
    UPDATE public.hr_settings
    SET next_application_number = next_application_number + 1, updated_at = now()
    WHERE company_id = _company_id
    RETURNING application_prefix, next_application_number - 1 INTO _prefix, _next;
  ELSIF _kind = 'offer' THEN
    UPDATE public.hr_settings
    SET next_offer_number = next_offer_number + 1, updated_at = now()
    WHERE company_id = _company_id
    RETURNING offer_prefix, next_offer_number - 1 INTO _prefix, _next;
  ELSIF _kind = 'onboarding' THEN
    UPDATE public.hr_settings
    SET next_onboarding_number = next_onboarding_number + 1, updated_at = now()
    WHERE company_id = _company_id
    RETURNING onboarding_prefix, next_onboarding_number - 1 INTO _prefix, _next;
  ELSIF _kind = 'leave' THEN
    UPDATE public.hr_settings
    SET next_leave_number = next_leave_number + 1, updated_at = now()
    WHERE company_id = _company_id
    RETURNING leave_prefix, next_leave_number - 1 INTO _prefix, _next;
  ELSE
    RAISE EXCEPTION 'Unknown HR document kind %', _kind;
  END IF;
  _number := _prefix || lpad(_next::TEXT, 5, '0');
  RETURN _number;
END;
$$;

-- ---------------------------------------------------------------------------
-- Leave types, balances, requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_paid BOOLEAN NOT NULL DEFAULT true,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  annual_allowance_days NUMERIC(8,2) NOT NULL DEFAULT 0
    CHECK (annual_allowance_days >= 0 AND annual_allowance_days <= 366),
  accrual_method TEXT NOT NULL DEFAULT 'annual'
    CHECK (accrual_method IN ('annual', 'monthly', 'none')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 100000),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_leave_types_code_len CHECK (char_length(trim(code)) BETWEEN 1 AND 40),
  CONSTRAINT hr_leave_types_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_leave_types_company_code_uidx
  ON public.hr_leave_types (company_id, lower(code));

CREATE TABLE IF NOT EXISTS public.hr_leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES public.hr_leave_types(id) ON DELETE CASCADE,
  balance_year INTEGER NOT NULL CHECK (balance_year BETWEEN 2000 AND 2100),
  entitled_days NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (entitled_days >= 0),
  used_days NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (used_days >= 0),
  pending_days NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (pending_days >= 0),
  carried_days NUMERIC(8,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_leave_balances_available CHECK (
    (entitled_days + carried_days - used_days - pending_days) >= -0.001
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_leave_balances_emp_type_year_uidx
  ON public.hr_leave_balances (company_id, employee_id, leave_type_id, balance_year);

CREATE TABLE IF NOT EXISTS public.hr_leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_number TEXT NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES public.hr_leave_types(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days NUMERIC(8,2) NOT NULL CHECK (days > 0 AND days <= 366),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled')),
  reason TEXT,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_notes TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_leave_requests_number_len CHECK (char_length(trim(request_number)) BETWEEN 1 AND 40),
  CONSTRAINT hr_leave_requests_range CHECK (end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_leave_requests_company_number_uidx
  ON public.hr_leave_requests (company_id, lower(request_number));
CREATE INDEX IF NOT EXISTS hr_leave_requests_status_idx
  ON public.hr_leave_requests (company_id, status, start_date DESC);
CREATE INDEX IF NOT EXISTS hr_leave_requests_emp_idx
  ON public.hr_leave_requests (company_id, employee_id, start_date DESC);

-- ---------------------------------------------------------------------------
-- Holiday calendars
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_holiday_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  location_id UUID REFERENCES public.hr_locations(id) ON DELETE SET NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_holiday_calendars_code_len CHECK (char_length(trim(code)) BETWEEN 1 AND 40),
  CONSTRAINT hr_holiday_calendars_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_holiday_calendars_company_code_uidx
  ON public.hr_holiday_calendars (company_id, lower(code));

CREATE TABLE IF NOT EXISTS public.hr_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  calendar_id UUID NOT NULL REFERENCES public.hr_holiday_calendars(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  name TEXT NOT NULL,
  is_optional BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_holidays_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 160)
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_holidays_calendar_date_name_uidx
  ON public.hr_holidays (calendar_id, holiday_date, lower(name));
CREATE INDEX IF NOT EXISTS hr_holidays_company_date_idx
  ON public.hr_holidays (company_id, holiday_date);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_holiday_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_holidays ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hr_leave_types','hr_leave_balances','hr_leave_requests',
    'hr_holiday_calendars','hr_holidays'
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
-- Balance helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.hr_ensure_leave_balance(
  _company_id UUID,
  _employee_id UUID,
  _leave_type_id UUID,
  _year INTEGER
)
RETURNS public.hr_leave_balances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.hr_leave_balances%ROWTYPE;
  _allowance NUMERIC(8,2);
BEGIN
  SELECT * INTO _row
  FROM public.hr_leave_balances
  WHERE company_id = _company_id
    AND employee_id = _employee_id
    AND leave_type_id = _leave_type_id
    AND balance_year = _year
  FOR UPDATE;

  IF _row.id IS NOT NULL THEN
    RETURN _row;
  END IF;

  SELECT annual_allowance_days INTO _allowance
  FROM public.hr_leave_types
  WHERE id = _leave_type_id AND company_id = _company_id;

  INSERT INTO public.hr_leave_balances (
    company_id, employee_id, leave_type_id, balance_year, entitled_days
  ) VALUES (
    _company_id, _employee_id, _leave_type_id, _year, COALESCE(_allowance, 0)
  )
  ON CONFLICT (company_id, employee_id, leave_type_id, balance_year) DO NOTHING
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    SELECT * INTO _row
    FROM public.hr_leave_balances
    WHERE company_id = _company_id
      AND employee_id = _employee_id
      AND leave_type_id = _leave_type_id
      AND balance_year = _year
    FOR UPDATE;
  END IF;

  RETURN _row;
END;
$$;

-- ---------------------------------------------------------------------------
-- Leave type / balance RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_hr_leave_types(
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
        'id', t.id,
        'code', t.code,
        'name', t.name,
        'isPaid', t.is_paid,
        'requiresApproval', t.requires_approval,
        'annualAllowanceDays', t.annual_allowance_days,
        'accrualMethod', t.accrual_method,
        'isActive', t.is_active,
        'sortOrder', t.sort_order,
        'notes', t.notes,
        'updatedAt', t.updated_at
      ) ORDER BY t.sort_order, t.name)
      FROM public.hr_leave_types t
      WHERE t.company_id = _company_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_leave_type(
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
  _row public.hr_leave_types%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.leave.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _code IS NULL OR _name IS NULL THEN
    RAISE EXCEPTION 'Leave type code and name are required';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.hr_leave_types (
      company_id, code, name, is_paid, requires_approval, annual_allowance_days,
      accrual_method, is_active, sort_order, notes
    ) VALUES (
      _company_id, _code, _name,
      COALESCE((_payload->>'isPaid')::BOOLEAN, true),
      COALESCE((_payload->>'requiresApproval')::BOOLEAN, true),
      COALESCE((_payload->>'annualAllowanceDays')::NUMERIC, 0),
      COALESCE(NULLIF(_payload->>'accrualMethod', ''), 'annual'),
      COALESCE((_payload->>'isActive')::BOOLEAN, true),
      COALESCE((_payload->>'sortOrder')::INTEGER, 100),
      NULLIF(trim(_payload->>'notes'), '')
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_leave_types SET
      code = _code,
      name = _name,
      is_paid = COALESCE((_payload->>'isPaid')::BOOLEAN, is_paid),
      requires_approval = COALESCE((_payload->>'requiresApproval')::BOOLEAN, requires_approval),
      annual_allowance_days = COALESCE((_payload->>'annualAllowanceDays')::NUMERIC, annual_allowance_days),
      accrual_method = COALESCE(NULLIF(_payload->>'accrualMethod', ''), accrual_method),
      is_active = COALESCE((_payload->>'isActive')::BOOLEAN, is_active),
      sort_order = COALESCE((_payload->>'sortOrder')::INTEGER, sort_order),
      notes = NULLIF(trim(_payload->>'notes'), ''),
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
  END IF;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Leave type not found';
  END IF;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_leave_type', _row.id,
    CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,
    format('Leave type %s', _row.code),
    jsonb_build_object('code', _row.code, 'allowance', _row.annual_allowance_days)
  );

  RETURN jsonb_build_object('id', _row.id, 'code', _row.code, 'name', _row.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_hr_leave_balances(
  _company_id UUID,
  _year INTEGER DEFAULT NULL,
  _employee_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _y INTEGER := COALESCE(_year, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  RETURN jsonb_build_object(
    'year', _y,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', b.id,
        'employeeId', b.employee_id,
        'employeeName', trim(both FROM concat_ws(' ', e.first_name, e.last_name)),
        'employeeNumber', e.employee_number,
        'leaveTypeId', b.leave_type_id,
        'leaveTypeCode', t.code,
        'leaveTypeName', t.name,
        'balanceYear', b.balance_year,
        'entitledDays', b.entitled_days,
        'usedDays', b.used_days,
        'pendingDays', b.pending_days,
        'carriedDays', b.carried_days,
        'availableDays', (b.entitled_days + b.carried_days - b.used_days - b.pending_days),
        'updatedAt', b.updated_at
      ) ORDER BY e.employee_number, t.sort_order)
      FROM public.hr_leave_balances b
      JOIN public.payroll_employees e ON e.id = b.employee_id
      JOIN public.hr_leave_types t ON t.id = b.leave_type_id
      WHERE b.company_id = _company_id
        AND b.balance_year = _y
        AND (_employee_id IS NULL OR b.employee_id = _employee_id)
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_hr_leave_balance(
  _company_id UUID,
  _employee_id UUID,
  _leave_type_id UUID,
  _year INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _y INTEGER := COALESCE(_year, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);
  _row public.hr_leave_balances%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.leave.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.payroll_employees e
    WHERE e.id = _employee_id AND e.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hr_leave_types t
    WHERE t.id = _leave_type_id AND t.company_id = _company_id AND t.is_active
  ) THEN
    RAISE EXCEPTION 'Active leave type not found';
  END IF;

  _row := private.hr_ensure_leave_balance(_company_id, _employee_id, _leave_type_id, _y);

  RETURN jsonb_build_object(
    'id', _row.id,
    'employeeId', _row.employee_id,
    'leaveTypeId', _row.leave_type_id,
    'balanceYear', _row.balance_year,
    'entitledDays', _row.entitled_days,
    'availableDays', (_row.entitled_days + _row.carried_days - _row.used_days - _row.pending_days)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Leave request workflow (draft → submitted → approved/rejected → cancelled)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_hr_leave_requests(
  _company_id UUID,
  _status TEXT DEFAULT NULL,
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
        'id', r.id,
        'requestNumber', r.request_number,
        'employeeId', r.employee_id,
        'employeeName', trim(both FROM concat_ws(' ', e.first_name, e.last_name)),
        'employeeNumber', e.employee_number,
        'leaveTypeId', r.leave_type_id,
        'leaveTypeCode', t.code,
        'leaveTypeName', t.name,
        'startDate', r.start_date,
        'endDate', r.end_date,
        'days', r.days,
        'status', r.status,
        'reason', r.reason,
        'decisionNotes', r.decision_notes,
        'decidedAt', r.decided_at,
        'updatedAt', r.updated_at
      ) ORDER BY r.updated_at DESC)
      FROM public.hr_leave_requests r
      JOIN public.payroll_employees e ON e.id = r.employee_id
      JOIN public.hr_leave_types t ON t.id = r.leave_type_id
      WHERE r.company_id = _company_id
        AND (_employee_id IS NULL OR r.employee_id = _employee_id)
        AND (_status IS NULL OR _status = '' OR _status = 'all' OR r.status = _status)
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_leave_request(
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
  _type UUID := NULLIF(_payload->>'leaveTypeId', '')::UUID;
  _start DATE := NULLIF(_payload->>'startDate', '')::DATE;
  _end DATE := NULLIF(_payload->>'endDate', '')::DATE;
  _days NUMERIC(8,2) := COALESCE((_payload->>'days')::NUMERIC, NULL);
  _status TEXT := COALESCE(NULLIF(_payload->>'status', ''), 'draft');
  _prev TEXT;
  _row public.hr_leave_requests%ROWTYPE;
  _bal public.hr_leave_balances%ROWTYPE;
  _year INTEGER;
  _requires BOOLEAN;
  _available NUMERIC(8,2);
BEGIN
  -- Admin create/edit path; ESS self-submit lands in HR-07 with employee scope.
  IF public.has_company_permission(_company_id, 'hr.leave.manage') THEN
    PERFORM private.hr_require_permission(_company_id, 'hr.leave.manage');
  ELSIF public.has_company_permission(_company_id, 'hr.manager') THEN
    PERFORM private.hr_require_permission(_company_id, 'hr.manager');
  ELSE
    RAISE EXCEPTION 'Missing permission to manage leave requests';
  END IF;
  PERFORM private.hr_require_enabled(_company_id);

  IF _employee IS NULL OR _type IS NULL OR _start IS NULL OR _end IS NULL THEN
    RAISE EXCEPTION 'Employee, leave type, and date range are required';
  END IF;
  IF _end < _start THEN
    RAISE EXCEPTION 'End date must be on or after start date';
  END IF;
  IF _days IS NULL THEN
    _days := (_end - _start) + 1;
  END IF;
  IF _days <= 0 THEN
    RAISE EXCEPTION 'Leave days must be greater than zero';
  END IF;
  IF _status NOT IN ('draft', 'submitted', 'cancelled') THEN
    RAISE EXCEPTION 'Use decide RPC for approve/reject; upsert allows draft/submitted/cancelled';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.payroll_employees e
    WHERE e.id = _employee AND e.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  SELECT requires_approval INTO _requires
  FROM public.hr_leave_types t
  WHERE t.id = _type AND t.company_id = _company_id AND t.is_active;
  IF _requires IS NULL THEN
    RAISE EXCEPTION 'Active leave type not found';
  END IF;

  _year := EXTRACT(YEAR FROM _start)::INTEGER;

  IF _id IS NULL THEN
    IF _status = 'submitted' THEN
      _bal := private.hr_ensure_leave_balance(_company_id, _employee, _type, _year);
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
      _employee, _type, _start, _end, _days, _status,
      NULLIF(trim(_payload->>'reason'), ''),
      auth.uid()
    ) RETURNING * INTO _row;
  ELSE
    SELECT * INTO _row FROM public.hr_leave_requests
    WHERE id = _id AND company_id = _company_id FOR UPDATE;
    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Leave request not found';
    END IF;
    IF _row.status NOT IN ('draft', 'submitted') THEN
      RAISE EXCEPTION 'Only draft or submitted requests can be edited';
    END IF;
    _prev := _row.status;

    -- Release previous pending if leaving submitted
    IF _prev = 'submitted' AND _status IN ('draft', 'cancelled') THEN
      _bal := private.hr_ensure_leave_balance(_company_id, _row.employee_id, _row.leave_type_id, EXTRACT(YEAR FROM _row.start_date)::INTEGER);
      UPDATE public.hr_leave_balances
      SET pending_days = GREATEST(pending_days - _row.days, 0), updated_at = now()
      WHERE id = _bal.id;
    END IF;

    -- Reserve new pending if entering submitted
    IF _status = 'submitted' AND _prev <> 'submitted' THEN
      _bal := private.hr_ensure_leave_balance(_company_id, _employee, _type, _year);
      _available := _bal.entitled_days + _bal.carried_days - _bal.used_days - _bal.pending_days;
      IF _available < _days THEN
        RAISE EXCEPTION 'Insufficient leave balance (available %, requested %)', _available, _days;
      END IF;
      UPDATE public.hr_leave_balances
      SET pending_days = pending_days + _days, updated_at = now()
      WHERE id = _bal.id;
    ELSIF _status = 'submitted' AND _prev = 'submitted' THEN
      -- Adjust pending for day changes
      _bal := private.hr_ensure_leave_balance(_company_id, _employee, _type, _year);
      _available := _bal.entitled_days + _bal.carried_days - _bal.used_days - _bal.pending_days + _row.days;
      IF _available < _days THEN
        RAISE EXCEPTION 'Insufficient leave balance (available %, requested %)', _available, _days;
      END IF;
      UPDATE public.hr_leave_balances
      SET pending_days = pending_days - _row.days + _days, updated_at = now()
      WHERE id = _bal.id;
    END IF;

    UPDATE public.hr_leave_requests SET
      employee_id = _employee,
      leave_type_id = _type,
      start_date = _start,
      end_date = _end,
      days = _days,
      status = _status,
      reason = NULLIF(trim(_payload->>'reason'), ''),
      version = version + 1,
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
  END IF;

  -- Auto-approve types that do not require approval when submitted
  IF _row.status = 'submitted' AND COALESCE(_requires, true) = false THEN
    _bal := private.hr_ensure_leave_balance(_company_id, _row.employee_id, _row.leave_type_id, EXTRACT(YEAR FROM _row.start_date)::INTEGER);
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
    _company_id, 'hr_leave_request', _row.id,
    CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,
    format('Leave %s (%s)', _row.request_number, _row.status),
    jsonb_build_object('status', _row.status, 'days', _row.days)
  );

  RETURN jsonb_build_object(
    'id', _row.id,
    'requestNumber', _row.request_number,
    'status', _row.status,
    'days', _row.days
  );
END;
$$;

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
BEGIN
  IF public.has_company_permission(_company_id, 'hr.leave.approve') THEN
    PERFORM private.hr_require_permission(_company_id, 'hr.leave.approve');
  ELSIF public.has_company_permission(_company_id, 'hr.leave.manage') THEN
    PERFORM private.hr_require_permission(_company_id, 'hr.leave.manage');
  ELSE
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

-- ---------------------------------------------------------------------------
-- Holidays
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_hr_holiday_calendars(
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
    'calendars', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'code', c.code,
        'name', c.name,
        'locationId', c.location_id,
        'isDefault', c.is_default,
        'isActive', c.is_active,
        'notes', c.notes,
        'holidayCount', (
          SELECT count(*)::INTEGER FROM public.hr_holidays h WHERE h.calendar_id = c.id
        ),
        'updatedAt', c.updated_at
      ) ORDER BY c.is_default DESC, c.name)
      FROM public.hr_holiday_calendars c
      WHERE c.company_id = _company_id
    ), '[]'::jsonb),
    'holidays', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', h.id,
        'calendarId', h.calendar_id,
        'calendarCode', c.code,
        'holidayDate', h.holiday_date,
        'name', h.name,
        'isOptional', h.is_optional,
        'notes', h.notes,
        'updatedAt', h.updated_at
      ) ORDER BY h.holiday_date, h.name)
      FROM public.hr_holidays h
      JOIN public.hr_holiday_calendars c ON c.id = h.calendar_id
      WHERE h.company_id = _company_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_holiday_calendar(
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
  _row public.hr_holiday_calendars%ROWTYPE;
  _is_default BOOLEAN := COALESCE((_payload->>'isDefault')::BOOLEAN, false);
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.leave.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _code IS NULL OR _name IS NULL THEN
    RAISE EXCEPTION 'Calendar code and name are required';
  END IF;

  IF _is_default THEN
    UPDATE public.hr_holiday_calendars
    SET is_default = false, updated_at = now()
    WHERE company_id = _company_id AND is_default;
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.hr_holiday_calendars (
      company_id, code, name, location_id, is_default, is_active, notes
    ) VALUES (
      _company_id, _code, _name,
      NULLIF(_payload->>'locationId', '')::UUID,
      _is_default,
      COALESCE((_payload->>'isActive')::BOOLEAN, true),
      NULLIF(trim(_payload->>'notes'), '')
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_holiday_calendars SET
      code = _code,
      name = _name,
      location_id = NULLIF(_payload->>'locationId', '')::UUID,
      is_default = _is_default,
      is_active = COALESCE((_payload->>'isActive')::BOOLEAN, is_active),
      notes = NULLIF(trim(_payload->>'notes'), ''),
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
  END IF;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Holiday calendar not found';
  END IF;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_holiday_calendar', _row.id,
    CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,
    format('Holiday calendar %s', _row.code),
    jsonb_build_object('code', _row.code, 'isDefault', _row.is_default)
  );

  RETURN jsonb_build_object('id', _row.id, 'code', _row.code, 'name', _row.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_holiday(
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
  _calendar UUID := NULLIF(_payload->>'calendarId', '')::UUID;
  _date DATE := NULLIF(_payload->>'holidayDate', '')::DATE;
  _name TEXT := NULLIF(trim(_payload->>'name'), '');
  _row public.hr_holidays%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.leave.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _calendar IS NULL OR _date IS NULL OR _name IS NULL THEN
    RAISE EXCEPTION 'Calendar, date, and name are required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hr_holiday_calendars c
    WHERE c.id = _calendar AND c.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Holiday calendar not found';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.hr_holidays (
      company_id, calendar_id, holiday_date, name, is_optional, notes
    ) VALUES (
      _company_id, _calendar, _date, _name,
      COALESCE((_payload->>'isOptional')::BOOLEAN, false),
      NULLIF(trim(_payload->>'notes'), '')
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_holidays SET
      calendar_id = _calendar,
      holiday_date = _date,
      name = _name,
      is_optional = COALESCE((_payload->>'isOptional')::BOOLEAN, is_optional),
      notes = NULLIF(trim(_payload->>'notes'), ''),
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
  END IF;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Holiday not found';
  END IF;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_holiday', _row.id,
    CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,
    format('Holiday %s on %s', _row.name, _row.holiday_date),
    jsonb_build_object('holidayDate', _row.holiday_date)
  );

  RETURN jsonb_build_object('id', _row.id, 'name', _row.name, 'holidayDate', _row.holiday_date);
END;
$$;

-- Refresh KPIs now that leave tables exist
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
  _att_pending INTEGER := 0;
  _leave_pending INTEGER := 0;
  _att_exc INTEGER := 0;
  _open_req INTEGER := 0;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  PERFORM private.hr_seed_defaults(_company_id);
  SELECT * INTO _settings FROM public.hr_settings WHERE company_id = _company_id;

  IF to_regclass('public.hr_attendance_corrections') IS NOT NULL THEN
    SELECT count(*)::INTEGER INTO _att_pending
    FROM public.hr_attendance_corrections c
    WHERE c.company_id = _company_id AND c.status = 'submitted';
  END IF;
  SELECT count(*)::INTEGER INTO _leave_pending
  FROM public.hr_leave_requests r
  WHERE r.company_id = _company_id AND r.status = 'submitted';
  IF to_regclass('public.hr_attendance_logs') IS NOT NULL THEN
    SELECT count(*)::INTEGER INTO _att_exc
    FROM public.hr_attendance_logs l
    WHERE l.company_id = _company_id AND l.status = 'exception';
  END IF;
  IF to_regclass('public.hr_job_requisitions') IS NOT NULL THEN
    SELECT count(*)::INTEGER INTO _open_req
    FROM public.hr_job_requisitions r
    WHERE r.company_id = _company_id AND r.status = 'open';
  END IF;

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
    'pendingApprovals', (_att_pending + _leave_pending),
    'attendanceExceptions', _att_exc,
    'expiringDocuments', 0,
    'openRequisitions', _open_req
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_hr_leave_types(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_leave_type(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_leave_balances(UUID, INTEGER, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ensure_hr_leave_balance(UUID, UUID, UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_leave_requests(UUID, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_leave_request(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_hr_leave_request(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_holiday_calendars(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_holiday_calendar(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_holiday(UUID, JSONB) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_hr_leave_types(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_leave_type(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_leave_balances(UUID, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_hr_leave_balance(UUID, UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_leave_requests(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_leave_request(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_hr_leave_request(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_holiday_calendars(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_holiday_calendar(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_holiday(UUID, JSONB) TO authenticated;