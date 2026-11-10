-- HR-09: Performance, training, compensation history references (additive).
-- Compensation rows are HR proposals/history only — never mutate finalized payroll.

CREATE TABLE IF NOT EXISTS public.hr_performance_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','open','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_performance_cycles_code_len CHECK (char_length(trim(code)) BETWEEN 1 AND 40),
  CONSTRAINT hr_performance_cycles_range CHECK (ends_on >= starts_on)
);
CREATE UNIQUE INDEX IF NOT EXISTS hr_performance_cycles_company_code_uidx
  ON public.hr_performance_cycles (company_id, lower(code));

CREATE TABLE IF NOT EXISTS public.hr_performance_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES public.hr_performance_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','completed','cancelled')),
  target_value NUMERIC(12,2),
  current_value NUMERIC(12,2),
  weight_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (weight_percent >= 0 AND weight_percent <= 100),
  due_on DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_performance_goals_title_len CHECK (char_length(trim(title)) BETWEEN 1 AND 200)
);
CREATE INDEX IF NOT EXISTS hr_performance_goals_cycle_idx
  ON public.hr_performance_goals (company_id, cycle_id, employee_id);

CREATE TABLE IF NOT EXISTS public.hr_performance_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES public.hr_performance_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  reviewer_employee_id UUID REFERENCES public.payroll_employees(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','acknowledged','cancelled')),
  rating SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  summary TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hr_performance_reviews_cycle_idx
  ON public.hr_performance_reviews (company_id, cycle_id, status);

CREATE TABLE IF NOT EXISTS public.hr_training_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  provider TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_training_courses_code_len CHECK (char_length(trim(code)) BETWEEN 1 AND 40),
  CONSTRAINT hr_training_courses_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 160)
);
CREATE UNIQUE INDEX IF NOT EXISTS hr_training_courses_company_code_uidx
  ON public.hr_training_courses (company_id, lower(code));

CREATE TABLE IF NOT EXISTS public.hr_training_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.hr_training_courses(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','in_progress','completed','cancelled')),
  enrolled_on DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_on DATE,
  certificate_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hr_training_enrollments_emp_idx
  ON public.hr_training_enrollments (company_id, employee_id, status);

CREATE TABLE IF NOT EXISTS public.hr_compensation_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  effective_on DATE NOT NULL,
  change_type TEXT NOT NULL DEFAULT 'adjustment'
    CHECK (change_type IN ('hire','promotion','adjustment','benefit','other')),
  currency_code TEXT NOT NULL DEFAULT 'USD',
  proposed_amount NUMERIC(14,2) NOT NULL CHECK (proposed_amount >= 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','proposed','approved','rejected','applied','cancelled')),
  notes TEXT,
  payroll_handoff_note TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hr_compensation_changes_emp_idx
  ON public.hr_compensation_changes (company_id, employee_id, effective_on DESC);

ALTER TABLE public.hr_performance_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_performance_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_training_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_training_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_compensation_changes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hr_performance_cycles','hr_performance_goals','hr_performance_reviews',
    'hr_training_courses','hr_training_enrollments','hr_compensation_changes'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "HR viewers can read %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "HR viewers can read %s" ON public.%I FOR SELECT TO authenticated USING (
        public.is_company_member(company_id)
        AND (
          public.has_company_permission(company_id, ''hr.view'')
          OR public.has_company_permission(company_id, ''hr.performance.manage'')
          OR public.has_company_permission(company_id, ''hr.employees.sensitive'')
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

-- Performance RPCs
CREATE OR REPLACE FUNCTION public.list_hr_performance_cycles(_company_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  RETURN jsonb_build_object('items', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'code', c.code, 'name', c.name,
      'startsOn', c.starts_on, 'endsOn', c.ends_on, 'status', c.status
    ) ORDER BY c.starts_on DESC)
    FROM public.hr_performance_cycles c WHERE c.company_id = _company_id
  ), '[]'::jsonb));
END; $$;

CREATE OR REPLACE FUNCTION public.upsert_hr_performance_cycle(_company_id UUID, _payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id', '')::UUID;
  _code TEXT := NULLIF(trim(_payload->>'code'), '');
  _name TEXT := NULLIF(trim(_payload->>'name'), '');
  _row public.hr_performance_cycles%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.performance.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _code IS NULL OR _name IS NULL OR NULLIF(_payload->>'startsOn','') IS NULL OR NULLIF(_payload->>'endsOn','') IS NULL THEN
    RAISE EXCEPTION 'Code, name and dates are required';
  END IF;
  IF _id IS NULL THEN
    INSERT INTO public.hr_performance_cycles (company_id, code, name, starts_on, ends_on, status)
    VALUES (_company_id, _code, _name, (_payload->>'startsOn')::DATE, (_payload->>'endsOn')::DATE,
            COALESCE(NULLIF(_payload->>'status',''), 'planned'))
    RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_performance_cycles SET
      code=_code, name=_name,
      starts_on=(_payload->>'startsOn')::DATE, ends_on=(_payload->>'endsOn')::DATE,
      status=COALESCE(NULLIF(_payload->>'status',''), status), updated_at=now()
    WHERE id=_id AND company_id=_company_id RETURNING * INTO _row;
  END IF;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Cycle not found'; END IF;
  PERFORM private.hr_write_audit(_company_id,'hr_performance_cycle',_row.id,
    CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,
    format('Cycle %s', _row.code), jsonb_build_object('status', _row.status));
  RETURN jsonb_build_object('id', _row.id, 'code', _row.code, 'status', _row.status);
END; $$;

CREATE OR REPLACE FUNCTION public.list_hr_performance_goals(_company_id UUID, _cycle_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  RETURN jsonb_build_object('items', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', g.id, 'cycleId', g.cycle_id, 'employeeId', g.employee_id,
      'employeeName', trim(both FROM concat_ws(' ', e.first_name, e.last_name)),
      'title', g.title, 'status', g.status,
      'targetValue', g.target_value, 'currentValue', g.current_value,
      'weightPercent', g.weight_percent, 'dueOn', g.due_on
    ) ORDER BY g.updated_at DESC)
    FROM public.hr_performance_goals g
    JOIN public.payroll_employees e ON e.id = g.employee_id
    WHERE g.company_id = _company_id AND (_cycle_id IS NULL OR g.cycle_id = _cycle_id)
  ), '[]'::jsonb));
END; $$;

CREATE OR REPLACE FUNCTION public.upsert_hr_performance_goal(_company_id UUID, _payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id','')::UUID;
  _cycle UUID := NULLIF(_payload->>'cycleId','')::UUID;
  _employee UUID := NULLIF(_payload->>'employeeId','')::UUID;
  _title TEXT := NULLIF(trim(_payload->>'title'),'');
  _row public.hr_performance_goals%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.performance.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _cycle IS NULL OR _employee IS NULL OR _title IS NULL THEN
    RAISE EXCEPTION 'Cycle, employee and title are required';
  END IF;
  IF _id IS NULL THEN
    INSERT INTO public.hr_performance_goals (
      company_id, cycle_id, employee_id, title, status, target_value, current_value, weight_percent, due_on, notes
    ) VALUES (
      _company_id, _cycle, _employee, _title,
      COALESCE(NULLIF(_payload->>'status',''),'draft'),
      NULLIF(_payload->>'targetValue','')::NUMERIC,
      NULLIF(_payload->>'currentValue','')::NUMERIC,
      COALESCE(NULLIF(_payload->>'weightPercent','')::NUMERIC, 0),
      NULLIF(_payload->>'dueOn','')::DATE,
      NULLIF(trim(_payload->>'notes'),'')
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_performance_goals SET
      title=_title, status=COALESCE(NULLIF(_payload->>'status',''), status),
      target_value=NULLIF(_payload->>'targetValue','')::NUMERIC,
      current_value=NULLIF(_payload->>'currentValue','')::NUMERIC,
      weight_percent=COALESCE(NULLIF(_payload->>'weightPercent','')::NUMERIC, weight_percent),
      due_on=NULLIF(_payload->>'dueOn','')::DATE,
      notes=NULLIF(trim(_payload->>'notes'),''), updated_at=now()
    WHERE id=_id AND company_id=_company_id RETURNING * INTO _row;
  END IF;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Goal not found'; END IF;
  RETURN jsonb_build_object('id', _row.id, 'title', _row.title, 'status', _row.status);
END; $$;

-- Training
CREATE OR REPLACE FUNCTION public.list_hr_training(_company_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  RETURN jsonb_build_object(
    'courses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'code', c.code, 'name', c.name, 'provider', c.provider, 'isActive', c.is_active
      ) ORDER BY c.name) FROM public.hr_training_courses c WHERE c.company_id=_company_id
    ), '[]'::jsonb),
    'enrollments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'courseId', e.course_id, 'courseCode', c.code, 'courseName', c.name,
        'employeeId', e.employee_id,
        'employeeName', trim(both FROM concat_ws(' ', p.first_name, p.last_name)),
        'status', e.status, 'enrolledOn', e.enrolled_on, 'completedOn', e.completed_on,
        'certificateName', e.certificate_name
      ) ORDER BY e.updated_at DESC)
      FROM public.hr_training_enrollments e
      JOIN public.hr_training_courses c ON c.id = e.course_id
      JOIN public.payroll_employees p ON p.id = e.employee_id
      WHERE e.company_id=_company_id
    ), '[]'::jsonb)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.upsert_hr_training_course(_company_id UUID, _payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id','')::UUID;
  _code TEXT := NULLIF(trim(_payload->>'code'),'');
  _name TEXT := NULLIF(trim(_payload->>'name'),'');
  _row public.hr_training_courses%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.performance.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _code IS NULL OR _name IS NULL THEN RAISE EXCEPTION 'Code and name are required'; END IF;
  IF _id IS NULL THEN
    INSERT INTO public.hr_training_courses (company_id, code, name, provider, is_active)
    VALUES (_company_id, _code, _name, NULLIF(trim(_payload->>'provider'),''), COALESCE((_payload->>'isActive')::BOOLEAN, true))
    RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_training_courses SET code=_code, name=_name,
      provider=NULLIF(trim(_payload->>'provider'),''),
      is_active=COALESCE((_payload->>'isActive')::BOOLEAN, is_active), updated_at=now()
    WHERE id=_id AND company_id=_company_id RETURNING * INTO _row;
  END IF;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Course not found'; END IF;
  RETURN jsonb_build_object('id', _row.id, 'code', _row.code, 'name', _row.name);
END; $$;

CREATE OR REPLACE FUNCTION public.upsert_hr_training_enrollment(_company_id UUID, _payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id','')::UUID;
  _course UUID := NULLIF(_payload->>'courseId','')::UUID;
  _employee UUID := NULLIF(_payload->>'employeeId','')::UUID;
  _status TEXT := COALESCE(NULLIF(_payload->>'status',''),'planned');
  _row public.hr_training_enrollments%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.performance.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _course IS NULL OR _employee IS NULL THEN RAISE EXCEPTION 'Course and employee are required'; END IF;
  IF _id IS NULL THEN
    INSERT INTO public.hr_training_enrollments (
      company_id, course_id, employee_id, status, enrolled_on, completed_on, certificate_name, notes
    ) VALUES (
      _company_id, _course, _employee, _status,
      COALESCE(NULLIF(_payload->>'enrolledOn','')::DATE, CURRENT_DATE),
      NULLIF(_payload->>'completedOn','')::DATE,
      NULLIF(trim(_payload->>'certificateName'),''),
      NULLIF(trim(_payload->>'notes'),'')
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_training_enrollments SET
      status=_status,
      completed_on=CASE WHEN _status='completed' THEN COALESCE(NULLIF(_payload->>'completedOn','')::DATE, CURRENT_DATE) ELSE NULLIF(_payload->>'completedOn','')::DATE END,
      certificate_name=NULLIF(trim(_payload->>'certificateName'),''),
      notes=NULLIF(trim(_payload->>'notes'),''), updated_at=now()
    WHERE id=_id AND company_id=_company_id RETURNING * INTO _row;
  END IF;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Enrollment not found'; END IF;
  RETURN jsonb_build_object('id', _row.id, 'status', _row.status);
END; $$;

-- Compensation (sensitive)
CREATE OR REPLACE FUNCTION public.list_hr_compensation_changes(_company_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.employees.sensitive');
  RETURN jsonb_build_object('items', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'employeeId', c.employee_id,
      'employeeName', trim(both FROM concat_ws(' ', e.first_name, e.last_name)),
      'employeeNumber', e.employee_number,
      'effectiveOn', c.effective_on, 'changeType', c.change_type,
      'currencyCode', c.currency_code, 'proposedAmount', c.proposed_amount,
      'status', c.status, 'notes', c.notes, 'payrollHandoffNote', c.payroll_handoff_note,
      'updatedAt', c.updated_at
    ) ORDER BY c.updated_at DESC)
    FROM public.hr_compensation_changes c
    JOIN public.payroll_employees e ON e.id = c.employee_id
    WHERE c.company_id = _company_id
  ), '[]'::jsonb));
END; $$;

CREATE OR REPLACE FUNCTION public.upsert_hr_compensation_change(_company_id UUID, _payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id','')::UUID;
  _employee UUID := NULLIF(_payload->>'employeeId','')::UUID;
  _amount NUMERIC := NULLIF(_payload->>'proposedAmount','')::NUMERIC;
  _status TEXT := COALESCE(NULLIF(_payload->>'status',''),'draft');
  _row public.hr_compensation_changes%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.employees.sensitive');
  PERFORM private.hr_require_enabled(_company_id);
  IF _employee IS NULL OR _amount IS NULL OR NULLIF(_payload->>'effectiveOn','') IS NULL THEN
    RAISE EXCEPTION 'Employee, amount and effective date are required';
  END IF;
  IF _status = 'applied' THEN
    RAISE EXCEPTION 'HR cannot mark compensation as applied — Payroll applies approved handoffs';
  END IF;
  IF _id IS NULL THEN
    INSERT INTO public.hr_compensation_changes (
      company_id, employee_id, effective_on, change_type, currency_code,
      proposed_amount, status, notes, payroll_handoff_note, created_by
    ) VALUES (
      _company_id, _employee, (_payload->>'effectiveOn')::DATE,
      COALESCE(NULLIF(_payload->>'changeType',''),'adjustment'),
      COALESCE(NULLIF(_payload->>'currencyCode',''),'USD'),
      _amount, _status,
      NULLIF(trim(_payload->>'notes'),''),
      NULLIF(trim(_payload->>'payrollHandoffNote'),''),
      auth.uid()
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_compensation_changes SET
      effective_on=(_payload->>'effectiveOn')::DATE,
      change_type=COALESCE(NULLIF(_payload->>'changeType',''), change_type),
      currency_code=COALESCE(NULLIF(_payload->>'currencyCode',''), currency_code),
      proposed_amount=_amount, status=_status,
      notes=NULLIF(trim(_payload->>'notes'),''),
      payroll_handoff_note=NULLIF(trim(_payload->>'payrollHandoffNote'),''),
      version=version+1, updated_at=now()
    WHERE id=_id AND company_id=_company_id AND status <> 'applied'
    RETURNING * INTO _row;
  END IF;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Compensation change not found or locked'; END IF;
  PERFORM private.hr_write_audit(_company_id,'hr_compensation_change',_row.id,
    CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,
    format('Comp change %s (%s)', _row.employee_id, _row.status),
    jsonb_build_object('status', _row.status, 'amount', _row.proposed_amount));
  RETURN jsonb_build_object('id', _row.id, 'status', _row.status, 'proposedAmount', _row.proposed_amount);
END; $$;

REVOKE ALL ON FUNCTION public.list_hr_performance_cycles(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_performance_cycle(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_performance_goals(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_performance_goal(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_training(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_training_course(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_training_enrollment(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_compensation_changes(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_compensation_change(UUID, JSONB) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_hr_performance_cycles(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_performance_cycle(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_performance_goals(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_performance_goal(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_training(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_training_course(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_training_enrollment(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_compensation_changes(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_compensation_change(UUID, JSONB) TO authenticated;