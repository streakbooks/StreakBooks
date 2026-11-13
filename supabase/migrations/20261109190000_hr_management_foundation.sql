-- HR-01 foundation: permissions, settings, organisation, employee profiles, audit.
-- Canonical workforce identity remains public.payroll_employees (shared with Payroll).
-- Additive and idempotent. Clients SELECT under RLS; writes via SECURITY DEFINER RPCs.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role, permission) VALUES
  ('owner', 'hr.view'),
  ('admin', 'hr.view'),
  ('accountant', 'hr.view'),
  ('bookkeeper', 'hr.view'),
  ('staff', 'hr.view'),
  ('read_only', 'hr.view'),

  ('owner', 'hr.employees.manage'),
  ('admin', 'hr.employees.manage'),
  ('accountant', 'hr.employees.manage'),

  ('owner', 'hr.employees.sensitive'),
  ('admin', 'hr.employees.sensitive'),

  ('owner', 'hr.organization.manage'),
  ('admin', 'hr.organization.manage'),

  ('owner', 'hr.recruitment.manage'),
  ('admin', 'hr.recruitment.manage'),

  ('owner', 'hr.onboarding.manage'),
  ('admin', 'hr.onboarding.manage'),

  ('owner', 'hr.attendance.manage'),
  ('admin', 'hr.attendance.manage'),

  ('owner', 'hr.leave.manage'),
  ('admin', 'hr.leave.manage'),

  ('owner', 'hr.leave.approve'),
  ('admin', 'hr.leave.approve'),
  ('accountant', 'hr.leave.approve'),

  ('owner', 'hr.performance.manage'),
  ('admin', 'hr.performance.manage'),

  ('owner', 'hr.cases.manage'),
  ('admin', 'hr.cases.manage'),

  ('owner', 'hr.approvals.manage'),
  ('admin', 'hr.approvals.manage'),

  ('owner', 'hr.reports.view'),
  ('admin', 'hr.reports.view'),
  ('accountant', 'hr.reports.view'),
  ('read_only', 'hr.reports.view'),

  ('owner', 'hr.export'),
  ('admin', 'hr.export'),
  ('accountant', 'hr.export'),

  ('owner', 'hr.import'),
  ('admin', 'hr.import'),

  ('owner', 'hr.settings.edit'),
  ('admin', 'hr.settings.edit'),

  ('owner', 'hr.audit.view'),
  ('admin', 'hr.audit.view'),

  ('owner', 'hr.self_service'),
  ('admin', 'hr.self_service'),
  ('staff', 'hr.self_service'),

  ('owner', 'hr.manager'),
  ('admin', 'hr.manager'),
  ('accountant', 'hr.manager')
ON CONFLICT (role, permission) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  default_timezone TEXT NOT NULL DEFAULT 'UTC'
    CHECK (char_length(trim(default_timezone)) BETWEEN 1 AND 64),
  week_starts_on SMALLINT NOT NULL DEFAULT 1 CHECK (week_starts_on BETWEEN 0 AND 6),
  require_manager_for_leave BOOLEAN NOT NULL DEFAULT true,
  disclaimer_acknowledged BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Organisation structure
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  country_code TEXT CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  address_line1 TEXT,
  city TEXT,
  region TEXT,
  postal_code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 100000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_locations_code_len CHECK (char_length(trim(code)) BETWEEN 1 AND 40),
  CONSTRAINT hr_locations_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_locations_company_code_uidx
  ON public.hr_locations (company_id, lower(code));
CREATE INDEX IF NOT EXISTS hr_locations_company_active_idx
  ON public.hr_locations (company_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS public.hr_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.hr_locations(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 100000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_branches_code_len CHECK (char_length(trim(code)) BETWEEN 1 AND 40),
  CONSTRAINT hr_branches_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_branches_company_code_uidx
  ON public.hr_branches (company_id, lower(code));
CREATE INDEX IF NOT EXISTS hr_branches_company_active_idx
  ON public.hr_branches (company_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS public.hr_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  parent_id UUID,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  cost_centre TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 100000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_departments_code_len CHECK (char_length(trim(code)) BETWEEN 1 AND 40),
  CONSTRAINT hr_departments_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_departments_parent_fk'
  ) THEN
    ALTER TABLE public.hr_departments
      ADD CONSTRAINT hr_departments_parent_fk
      FOREIGN KEY (parent_id) REFERENCES public.hr_departments(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS hr_departments_company_code_uidx
  ON public.hr_departments (company_id, lower(code));
CREATE INDEX IF NOT EXISTS hr_departments_company_active_idx
  ON public.hr_departments (company_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS public.hr_designations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  grade_code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 100000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_designations_code_len CHECK (char_length(trim(code)) BETWEEN 1 AND 40),
  CONSTRAINT hr_designations_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_designations_company_code_uidx
  ON public.hr_designations (company_id, lower(code));
CREATE INDEX IF NOT EXISTS hr_designations_company_active_idx
  ON public.hr_designations (company_id, is_active, sort_order);

-- ---------------------------------------------------------------------------
-- Employee HR profile (1:1 with payroll_employees)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_employee_profiles (
  employee_id UUID PRIMARY KEY REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  preferred_name TEXT,
  legal_middle_name TEXT,
  personal_email TEXT,
  personal_phone TEXT,
  work_phone TEXT,
  manager_employee_id UUID REFERENCES public.payroll_employees(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.hr_departments(id) ON DELETE SET NULL,
  designation_id UUID REFERENCES public.hr_designations(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.hr_locations(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES public.hr_branches(id) ON DELETE SET NULL,
  work_arrangement TEXT NOT NULL DEFAULT 'onsite'
    CHECK (work_arrangement IN ('onsite', 'hybrid', 'remote', 'field', 'other')),
  probation_end_date DATE,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relation TEXT,
  linked_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT hr_employee_profiles_pref_len CHECK (
    preferred_name IS NULL OR char_length(trim(preferred_name)) BETWEEN 1 AND 80
  ),
  CONSTRAINT hr_employee_profiles_manager_not_self CHECK (
    manager_employee_id IS NULL OR manager_employee_id <> employee_id
  )
);

CREATE INDEX IF NOT EXISTS hr_employee_profiles_company_mgr_idx
  ON public.hr_employee_profiles (company_id, manager_employee_id);
CREATE INDEX IF NOT EXISTS hr_employee_profiles_company_dept_idx
  ON public.hr_employee_profiles (company_id, department_id);
CREATE UNIQUE INDEX IF NOT EXISTS hr_employee_profiles_company_user_uidx
  ON public.hr_employee_profiles (company_id, linked_user_id)
  WHERE linked_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.hr_position_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  effective_to DATE,
  change_type TEXT NOT NULL DEFAULT 'assignment'
    CHECK (change_type IN (
      'hire', 'assignment', 'transfer', 'promotion', 'demotion',
      'location_change', 'manager_change', 'other'
    )),
  department_id UUID REFERENCES public.hr_departments(id) ON DELETE SET NULL,
  designation_id UUID REFERENCES public.hr_designations(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.hr_locations(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES public.hr_branches(id) ON DELETE SET NULL,
  manager_employee_id UUID REFERENCES public.payroll_employees(id) ON DELETE SET NULL,
  work_arrangement TEXT,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_position_history_range CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

CREATE INDEX IF NOT EXISTS hr_position_history_emp_idx
  ON public.hr_position_history (employee_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS public.hr_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_audit_events_summary_len CHECK (char_length(trim(summary)) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS hr_audit_events_company_created_idx
  ON public.hr_audit_events (company_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_employee_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_position_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "HR viewers can read settings" ON public.hr_settings;
CREATE POLICY "HR viewers can read settings" ON public.hr_settings
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'hr.view')
  );

DROP POLICY IF EXISTS "HR viewers can read locations" ON public.hr_locations;
CREATE POLICY "HR viewers can read locations" ON public.hr_locations
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'hr.view')
  );

DROP POLICY IF EXISTS "HR viewers can read branches" ON public.hr_branches;
CREATE POLICY "HR viewers can read branches" ON public.hr_branches
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'hr.view')
  );

DROP POLICY IF EXISTS "HR viewers can read departments" ON public.hr_departments;
CREATE POLICY "HR viewers can read departments" ON public.hr_departments
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'hr.view')
  );

DROP POLICY IF EXISTS "HR viewers can read designations" ON public.hr_designations;
CREATE POLICY "HR viewers can read designations" ON public.hr_designations
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'hr.view')
  );

DROP POLICY IF EXISTS "HR viewers can read employee profiles" ON public.hr_employee_profiles;
CREATE POLICY "HR viewers can read employee profiles" ON public.hr_employee_profiles
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      public.has_company_permission(company_id, 'hr.view')
      OR linked_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "HR viewers can read position history" ON public.hr_position_history;
CREATE POLICY "HR viewers can read position history" ON public.hr_position_history
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'hr.view')
  );

DROP POLICY IF EXISTS "HR auditors can read audit events" ON public.hr_audit_events;
CREATE POLICY "HR auditors can read audit events" ON public.hr_audit_events
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'hr.audit.view')
  );

-- No direct client writes — RPCs only.
DROP POLICY IF EXISTS "No direct write hr_settings" ON public.hr_settings;
CREATE POLICY "No direct write hr_settings" ON public.hr_settings
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "No direct write hr_locations" ON public.hr_locations;
CREATE POLICY "No direct write hr_locations" ON public.hr_locations
  FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "No direct update hr_locations" ON public.hr_locations;
CREATE POLICY "No direct update hr_locations" ON public.hr_locations
  FOR UPDATE TO authenticated USING (false);
DROP POLICY IF EXISTS "No direct delete hr_locations" ON public.hr_locations;
CREATE POLICY "No direct delete hr_locations" ON public.hr_locations
  FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS "No direct insert hr_branches" ON public.hr_branches;
CREATE POLICY "No direct insert hr_branches" ON public.hr_branches
  FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "No direct update hr_branches" ON public.hr_branches;
CREATE POLICY "No direct update hr_branches" ON public.hr_branches
  FOR UPDATE TO authenticated USING (false);
DROP POLICY IF EXISTS "No direct delete hr_branches" ON public.hr_branches;
CREATE POLICY "No direct delete hr_branches" ON public.hr_branches
  FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS "No direct insert hr_departments" ON public.hr_departments;
CREATE POLICY "No direct insert hr_departments" ON public.hr_departments
  FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "No direct update hr_departments" ON public.hr_departments;
CREATE POLICY "No direct update hr_departments" ON public.hr_departments
  FOR UPDATE TO authenticated USING (false);
DROP POLICY IF EXISTS "No direct delete hr_departments" ON public.hr_departments;
CREATE POLICY "No direct delete hr_departments" ON public.hr_departments
  FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS "No direct insert hr_designations" ON public.hr_designations;
CREATE POLICY "No direct insert hr_designations" ON public.hr_designations
  FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "No direct update hr_designations" ON public.hr_designations;
CREATE POLICY "No direct update hr_designations" ON public.hr_designations
  FOR UPDATE TO authenticated USING (false);
DROP POLICY IF EXISTS "No direct delete hr_designations" ON public.hr_designations;
CREATE POLICY "No direct delete hr_designations" ON public.hr_designations
  FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS "No direct insert hr_employee_profiles" ON public.hr_employee_profiles;
CREATE POLICY "No direct insert hr_employee_profiles" ON public.hr_employee_profiles
  FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "No direct update hr_employee_profiles" ON public.hr_employee_profiles;
CREATE POLICY "No direct update hr_employee_profiles" ON public.hr_employee_profiles
  FOR UPDATE TO authenticated USING (false);
DROP POLICY IF EXISTS "No direct delete hr_employee_profiles" ON public.hr_employee_profiles;
CREATE POLICY "No direct delete hr_employee_profiles" ON public.hr_employee_profiles
  FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS "No direct insert hr_position_history" ON public.hr_position_history;
CREATE POLICY "No direct insert hr_position_history" ON public.hr_position_history
  FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "No direct update hr_position_history" ON public.hr_position_history;
CREATE POLICY "No direct update hr_position_history" ON public.hr_position_history
  FOR UPDATE TO authenticated USING (false);
DROP POLICY IF EXISTS "No direct delete hr_position_history" ON public.hr_position_history;
CREATE POLICY "No direct delete hr_position_history" ON public.hr_position_history
  FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS "No direct insert hr_audit_events" ON public.hr_audit_events;
CREATE POLICY "No direct insert hr_audit_events" ON public.hr_audit_events
  FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "No direct update hr_audit_events" ON public.hr_audit_events;
CREATE POLICY "No direct update hr_audit_events" ON public.hr_audit_events
  FOR UPDATE TO authenticated USING (false);
DROP POLICY IF EXISTS "No direct delete hr_audit_events" ON public.hr_audit_events;
CREATE POLICY "No direct delete hr_audit_events" ON public.hr_audit_events
  FOR DELETE TO authenticated USING (false);

-- ---------------------------------------------------------------------------
-- Private helpers + RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.hr_require_permission(_company_id UUID, _permission TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, _permission) THEN
    RAISE EXCEPTION 'Missing permission %', _permission USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.hr_write_audit(
  _company_id UUID,
  _entity_type TEXT,
  _entity_id UUID,
  _action TEXT,
  _summary TEXT,
  _detail JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.hr_audit_events (
    company_id, actor_user_id, entity_type, entity_id, action, summary, detail
  ) VALUES (
    _company_id, auth.uid(), _entity_type, _entity_id, _action, _summary, COALESCE(_detail, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.hr_seed_defaults(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.hr_settings (company_id)
  VALUES (_company_id)
  ON CONFLICT (company_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_hr_settings(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.hr_settings%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  PERFORM private.hr_seed_defaults(_company_id);
  SELECT * INTO _row FROM public.hr_settings WHERE company_id = _company_id;
  RETURN jsonb_build_object(
    'companyId', _row.company_id,
    'enabled', _row.enabled,
    'defaultTimezone', _row.default_timezone,
    'weekStartsOn', _row.week_starts_on,
    'requireManagerForLeave', _row.require_manager_for_leave,
    'disclaimerAcknowledged', _row.disclaimer_acknowledged,
    'version', _row.version,
    'updatedAt', _row.updated_at,
    'disclaimer', 'LinkBooks HR Management supports configurable workforce processes. It is not advertised as legally compliant employment-law software for every jurisdiction until rule packs are verified.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_settings(
  _company_id UUID,
  _enabled BOOLEAN,
  _default_timezone TEXT DEFAULT NULL,
  _week_starts_on INTEGER DEFAULT NULL,
  _require_manager_for_leave BOOLEAN DEFAULT NULL,
  _disclaimer_acknowledged BOOLEAN DEFAULT NULL,
  _expected_version INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.hr_settings%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.settings.edit');
  PERFORM private.hr_seed_defaults(_company_id);

  UPDATE public.hr_settings
  SET
    enabled = COALESCE(_enabled, enabled),
    default_timezone = COALESCE(NULLIF(trim(_default_timezone), ''), default_timezone),
    week_starts_on = COALESCE(_week_starts_on, week_starts_on),
    require_manager_for_leave = COALESCE(_require_manager_for_leave, require_manager_for_leave),
    disclaimer_acknowledged = COALESCE(_disclaimer_acknowledged, disclaimer_acknowledged),
    version = version + 1,
    updated_at = now(),
    updated_by = auth.uid()
  WHERE company_id = _company_id
    AND (_expected_version IS NULL OR version = _expected_version)
  RETURNING * INTO _row;

  IF _row.company_id IS NULL THEN
    RAISE EXCEPTION 'HR settings were updated by someone else. Refresh and try again.'
      USING ERRCODE = '40001';
  END IF;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_settings', _company_id, 'upsert',
    'Updated HR settings',
    jsonb_build_object('enabled', _row.enabled, 'version', _row.version)
  );

  RETURN public.get_hr_settings(_company_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_hr_org_units(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  RETURN jsonb_build_object(
    'locations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'code', l.code, 'name', l.name, 'timezone', l.timezone,
        'countryCode', l.country_code, 'isActive', l.is_active, 'sortOrder', l.sort_order
      ) ORDER BY l.sort_order, l.name)
      FROM public.hr_locations l WHERE l.company_id = _company_id
    ), '[]'::jsonb),
    'branches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', b.id, 'locationId', b.location_id, 'code', b.code, 'name', b.name,
        'isActive', b.is_active, 'sortOrder', b.sort_order
      ) ORDER BY b.sort_order, b.name)
      FROM public.hr_branches b WHERE b.company_id = _company_id
    ), '[]'::jsonb),
    'departments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'parentId', d.parent_id, 'code', d.code, 'name', d.name,
        'costCentre', d.cost_centre, 'isActive', d.is_active, 'sortOrder', d.sort_order
      ) ORDER BY d.sort_order, d.name)
      FROM public.hr_departments d WHERE d.company_id = _company_id
    ), '[]'::jsonb),
    'designations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'code', g.code, 'name', g.name, 'gradeCode', g.grade_code,
        'isActive', g.is_active, 'sortOrder', g.sort_order
      ) ORDER BY g.sort_order, g.name)
      FROM public.hr_designations g WHERE g.company_id = _company_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_org_unit(
  _company_id UUID,
  _kind TEXT,
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
  _active BOOLEAN := COALESCE((_payload->>'isActive')::BOOLEAN, true);
  _sort INTEGER := COALESCE((_payload->>'sortOrder')::INTEGER, 100);
  _row_id UUID;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.organization.manage');
  IF _code IS NULL OR _name IS NULL THEN
    RAISE EXCEPTION 'Code and name are required';
  END IF;

  IF _kind = 'location' THEN
    IF _id IS NULL THEN
      INSERT INTO public.hr_locations (
        company_id, code, name, timezone, country_code, address_line1, city, region, postal_code, is_active, sort_order
      ) VALUES (
        _company_id, _code, _name,
        COALESCE(NULLIF(trim(_payload->>'timezone'), ''), 'UTC'),
        NULLIF(upper(trim(_payload->>'countryCode')), ''),
        NULLIF(trim(_payload->>'addressLine1'), ''),
        NULLIF(trim(_payload->>'city'), ''),
        NULLIF(trim(_payload->>'region'), ''),
        NULLIF(trim(_payload->>'postalCode'), ''),
        _active, _sort
      ) RETURNING id INTO _row_id;
    ELSE
      UPDATE public.hr_locations SET
        code = _code, name = _name,
        timezone = COALESCE(NULLIF(trim(_payload->>'timezone'), ''), timezone),
        country_code = COALESCE(NULLIF(upper(trim(_payload->>'countryCode')), ''), country_code),
        address_line1 = NULLIF(trim(_payload->>'addressLine1'), ''),
        city = NULLIF(trim(_payload->>'city'), ''),
        region = NULLIF(trim(_payload->>'region'), ''),
        postal_code = NULLIF(trim(_payload->>'postalCode'), ''),
        is_active = _active, sort_order = _sort, updated_at = now()
      WHERE id = _id AND company_id = _company_id
      RETURNING id INTO _row_id;
    END IF;
  ELSIF _kind = 'branch' THEN
    IF _id IS NULL THEN
      INSERT INTO public.hr_branches (company_id, location_id, code, name, is_active, sort_order)
      VALUES (
        _company_id, NULLIF(_payload->>'locationId', '')::UUID, _code, _name, _active, _sort
      ) RETURNING id INTO _row_id;
    ELSE
      UPDATE public.hr_branches SET
        location_id = NULLIF(_payload->>'locationId', '')::UUID,
        code = _code, name = _name, is_active = _active, sort_order = _sort, updated_at = now()
      WHERE id = _id AND company_id = _company_id
      RETURNING id INTO _row_id;
    END IF;
  ELSIF _kind = 'department' THEN
    IF _id IS NULL THEN
      INSERT INTO public.hr_departments (company_id, parent_id, code, name, cost_centre, is_active, sort_order)
      VALUES (
        _company_id, NULLIF(_payload->>'parentId', '')::UUID, _code, _name,
        NULLIF(trim(_payload->>'costCentre'), ''), _active, _sort
      ) RETURNING id INTO _row_id;
    ELSE
      UPDATE public.hr_departments SET
        parent_id = NULLIF(_payload->>'parentId', '')::UUID,
        code = _code, name = _name,
        cost_centre = NULLIF(trim(_payload->>'costCentre'), ''),
        is_active = _active, sort_order = _sort, updated_at = now()
      WHERE id = _id AND company_id = _company_id
      RETURNING id INTO _row_id;
    END IF;
  ELSIF _kind = 'designation' THEN
    IF _id IS NULL THEN
      INSERT INTO public.hr_designations (company_id, code, name, grade_code, is_active, sort_order)
      VALUES (
        _company_id, _code, _name, NULLIF(trim(_payload->>'gradeCode'), ''), _active, _sort
      ) RETURNING id INTO _row_id;
    ELSE
      UPDATE public.hr_designations SET
        code = _code, name = _name,
        grade_code = NULLIF(trim(_payload->>'gradeCode'), ''),
        is_active = _active, sort_order = _sort, updated_at = now()
      WHERE id = _id AND company_id = _company_id
      RETURNING id INTO _row_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported organisation unit kind %', _kind;
  END IF;

  IF _row_id IS NULL THEN
    RAISE EXCEPTION 'Organisation unit not found in this organisation';
  END IF;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_' || _kind, _row_id, CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,
    format('Saved %s %s', _kind, _code),
    jsonb_build_object('id', _row_id, 'code', _code, 'name', _name)
  );

  RETURN jsonb_build_object('id', _row_id, 'kind', _kind);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_hr_dashboard_kpis(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _enabled BOOLEAN;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  PERFORM private.hr_seed_defaults(_company_id);
  SELECT enabled INTO _enabled FROM public.hr_settings WHERE company_id = _company_id;

  RETURN jsonb_build_object(
    'enabled', COALESCE(_enabled, false),
    'activeEmployees', (
      SELECT count(*) FROM public.payroll_employees e
      WHERE e.company_id = _company_id AND e.status = 'active'
    ),
    'archivedEmployees', (
      SELECT count(*) FROM public.payroll_employees e
      WHERE e.company_id = _company_id AND e.status = 'archived'
    ),
    'terminatedEmployees', (
      SELECT count(*) FROM public.payroll_employees e
      WHERE e.company_id = _company_id AND e.status = 'terminated'
    ),
    'profilesLinked', (
      SELECT count(*) FROM public.hr_employee_profiles p
      WHERE p.company_id = _company_id
    ),
    'departments', (
      SELECT count(*) FROM public.hr_departments d
      WHERE d.company_id = _company_id AND d.is_active
    ),
    'locations', (
      SELECT count(*) FROM public.hr_locations l
      WHERE l.company_id = _company_id AND l.is_active
    ),
    'pendingApprovals', 0,
    'attendanceExceptions', 0,
    'expiringDocuments', 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_hr_employees(
  _company_id UUID,
  _status TEXT DEFAULT NULL,
  _search TEXT DEFAULT NULL,
  _limit INTEGER DEFAULT 100,
  _offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _lim INTEGER := LEAST(GREATEST(COALESCE(_limit, 100), 1), 500);
  _off INTEGER := GREATEST(COALESCE(_offset, 0), 0);
  _q TEXT := NULLIF(lower(trim(_search)), '');
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');

  RETURN jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(row_to_json(x)::jsonb)
      FROM (
        SELECT
          e.id,
          e.employee_number AS "employeeNumber",
          e.first_name AS "firstName",
          e.last_name AS "lastName",
          e.email,
          e.status,
          e.hire_date AS "hireDate",
          e.department AS "payrollDepartment",
          e.designation AS "payrollDesignation",
          e.work_location AS "payrollWorkLocation",
          e.employment_type AS "employmentType",
          p.preferred_name AS "preferredName",
          p.manager_employee_id AS "managerEmployeeId",
          p.department_id AS "departmentId",
          p.designation_id AS "designationId",
          p.location_id AS "locationId",
          p.work_arrangement AS "workArrangement",
          d.name AS "departmentName",
          g.name AS "designationName",
          l.name AS "locationName"
        FROM public.payroll_employees e
        LEFT JOIN public.hr_employee_profiles p
          ON p.employee_id = e.id AND p.company_id = e.company_id
        LEFT JOIN public.hr_departments d ON d.id = p.department_id
        LEFT JOIN public.hr_designations g ON g.id = p.designation_id
        LEFT JOIN public.hr_locations l ON l.id = p.location_id
        WHERE e.company_id = _company_id
          AND (_status IS NULL OR _status = '' OR _status = 'all' OR e.status = _status)
          AND (
            _q IS NULL
            OR lower(e.employee_number) LIKE '%' || _q || '%'
            OR lower(e.first_name) LIKE '%' || _q || '%'
            OR lower(e.last_name) LIKE '%' || _q || '%'
            OR lower(COALESCE(e.email, '')) LIKE '%' || _q || '%'
            OR lower(COALESCE(p.preferred_name, '')) LIKE '%' || _q || '%'
          )
        ORDER BY lower(e.last_name), lower(e.first_name)
        LIMIT _lim OFFSET _off
      ) x
    ), '[]'::jsonb),
    'limit', _lim,
    'offset', _off
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_hr_employee(_company_id UUID, _employee_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _emp public.payroll_employees%ROWTYPE;
  _profile public.hr_employee_profiles%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');

  SELECT * INTO _emp
  FROM public.payroll_employees
  WHERE id = _employee_id AND company_id = _company_id;
  IF _emp.id IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  SELECT * INTO _profile
  FROM public.hr_employee_profiles
  WHERE employee_id = _employee_id AND company_id = _company_id;

  RETURN jsonb_build_object(
    'employee', jsonb_build_object(
      'id', _emp.id,
      'employeeNumber', _emp.employee_number,
      'firstName', _emp.first_name,
      'lastName', _emp.last_name,
      'email', _emp.email,
      'status', _emp.status,
      'hireDate', _emp.hire_date,
      'terminationDate', _emp.termination_date,
      'employmentType', _emp.employment_type,
      'payrollDepartment', _emp.department,
      'payrollDesignation', _emp.designation,
      'payrollWorkLocation', _emp.work_location,
      'payrollCountryCode', _emp.payroll_country_code,
      'payrollCurrency', _emp.payroll_currency
    ),
    'profile', CASE WHEN _profile.employee_id IS NULL THEN NULL ELSE jsonb_build_object(
      'preferredName', _profile.preferred_name,
      'legalMiddleName', _profile.legal_middle_name,
      'personalEmail', _profile.personal_email,
      'personalPhone', _profile.personal_phone,
      'workPhone', _profile.work_phone,
      'managerEmployeeId', _profile.manager_employee_id,
      'departmentId', _profile.department_id,
      'designationId', _profile.designation_id,
      'locationId', _profile.location_id,
      'branchId', _profile.branch_id,
      'workArrangement', _profile.work_arrangement,
      'probationEndDate', _profile.probation_end_date,
      'emergencyContactName', _profile.emergency_contact_name,
      'emergencyContactPhone', _profile.emergency_contact_phone,
      'emergencyContactRelation', _profile.emergency_contact_relation,
      'linkedUserId', _profile.linked_user_id,
      'notes', _profile.notes,
      'version', _profile.version
    ) END,
    'positionHistory', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', h.id,
        'effectiveFrom', h.effective_from,
        'effectiveTo', h.effective_to,
        'changeType', h.change_type,
        'departmentId', h.department_id,
        'designationId', h.designation_id,
        'locationId', h.location_id,
        'managerEmployeeId', h.manager_employee_id,
        'reason', h.reason
      ) ORDER BY h.effective_from DESC)
      FROM public.hr_position_history h
      WHERE h.company_id = _company_id AND h.employee_id = _employee_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_employee_profile(
  _company_id UUID,
  _employee_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _expected INTEGER := NULLIF(_payload->>'version', '')::INTEGER;
  _manager UUID := NULLIF(_payload->>'managerEmployeeId', '')::UUID;
  _dept UUID := NULLIF(_payload->>'departmentId', '')::UUID;
  _desig UUID := NULLIF(_payload->>'designationId', '')::UUID;
  _loc UUID := NULLIF(_payload->>'locationId', '')::UUID;
  _branch UUID := NULLIF(_payload->>'branchId', '')::UUID;
  _row public.hr_employee_profiles%ROWTYPE;
  _exists BOOLEAN;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.employees.manage');

  SELECT EXISTS(
    SELECT 1 FROM public.payroll_employees e
    WHERE e.id = _employee_id AND e.company_id = _company_id
  ) INTO _exists;
  IF NOT _exists THEN
    RAISE EXCEPTION 'Employee not found in this organisation';
  END IF;

  IF _manager IS NOT NULL THEN
    IF _manager = _employee_id THEN
      RAISE EXCEPTION 'Manager cannot be the same employee';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.payroll_employees e
      WHERE e.id = _manager AND e.company_id = _company_id
    ) THEN
      RAISE EXCEPTION 'Manager must belong to this organisation';
    END IF;
  END IF;

  IF _dept IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hr_departments d WHERE d.id = _dept AND d.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Department not found';
  END IF;
  IF _desig IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hr_designations g WHERE g.id = _desig AND g.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Designation not found';
  END IF;
  IF _loc IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hr_locations l WHERE l.id = _loc AND l.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Location not found';
  END IF;
  IF _branch IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hr_branches b WHERE b.id = _branch AND b.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Branch not found';
  END IF;

  INSERT INTO public.hr_employee_profiles AS p (
    employee_id, company_id, preferred_name, legal_middle_name, personal_email, personal_phone,
    work_phone, manager_employee_id, department_id, designation_id, location_id, branch_id,
    work_arrangement, probation_end_date, emergency_contact_name, emergency_contact_phone,
    emergency_contact_relation, notes, updated_by
  ) VALUES (
    _employee_id, _company_id,
    NULLIF(trim(_payload->>'preferredName'), ''),
    NULLIF(trim(_payload->>'legalMiddleName'), ''),
    NULLIF(trim(_payload->>'personalEmail'), ''),
    NULLIF(trim(_payload->>'personalPhone'), ''),
    NULLIF(trim(_payload->>'workPhone'), ''),
    _manager, _dept, _desig, _loc, _branch,
    COALESCE(NULLIF(_payload->>'workArrangement', ''), 'onsite'),
    NULLIF(_payload->>'probationEndDate', '')::DATE,
    NULLIF(trim(_payload->>'emergencyContactName'), ''),
    NULLIF(trim(_payload->>'emergencyContactPhone'), ''),
    NULLIF(trim(_payload->>'emergencyContactRelation'), ''),
    NULLIF(trim(_payload->>'notes'), ''),
    auth.uid()
  )
  ON CONFLICT (employee_id) DO UPDATE SET
    preferred_name = EXCLUDED.preferred_name,
    legal_middle_name = EXCLUDED.legal_middle_name,
    personal_email = EXCLUDED.personal_email,
    personal_phone = EXCLUDED.personal_phone,
    work_phone = EXCLUDED.work_phone,
    manager_employee_id = EXCLUDED.manager_employee_id,
    department_id = EXCLUDED.department_id,
    designation_id = EXCLUDED.designation_id,
    location_id = EXCLUDED.location_id,
    branch_id = EXCLUDED.branch_id,
    work_arrangement = EXCLUDED.work_arrangement,
    probation_end_date = EXCLUDED.probation_end_date,
    emergency_contact_name = EXCLUDED.emergency_contact_name,
    emergency_contact_phone = EXCLUDED.emergency_contact_phone,
    emergency_contact_relation = EXCLUDED.emergency_contact_relation,
    notes = EXCLUDED.notes,
    version = p.version + 1,
    updated_at = now(),
    updated_by = auth.uid()
  WHERE (_expected IS NULL OR p.version = _expected)
  RETURNING * INTO _row;

  IF _row.employee_id IS NULL THEN
    RAISE EXCEPTION 'HR profile was updated by someone else. Refresh and try again.'
      USING ERRCODE = '40001';
  END IF;

  -- Close open history and open a new effective-dated row when org facts change.
  UPDATE public.hr_position_history
  SET effective_to = CURRENT_DATE - 1
  WHERE company_id = _company_id
    AND employee_id = _employee_id
    AND effective_to IS NULL
    AND effective_from < CURRENT_DATE;

  INSERT INTO public.hr_position_history (
    company_id, employee_id, effective_from, change_type,
    department_id, designation_id, location_id, branch_id, manager_employee_id,
    work_arrangement, reason, created_by
  ) VALUES (
    _company_id, _employee_id, CURRENT_DATE, 'assignment',
    _dept, _desig, _loc, _branch, _manager,
    _row.work_arrangement, 'Profile update', auth.uid()
  );

  PERFORM private.hr_write_audit(
    _company_id, 'hr_employee_profile', _employee_id, 'upsert',
    'Updated HR employee profile',
    jsonb_build_object('employeeId', _employee_id, 'version', _row.version)
  );

  RETURN public.get_hr_employee(_company_id, _employee_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_hr_audit_events(
  _company_id UUID,
  _limit INTEGER DEFAULT 100,
  _offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _lim INTEGER := LEAST(GREATEST(COALESCE(_limit, 100), 1), 500);
  _off INTEGER := GREATEST(COALESCE(_offset, 0), 0);
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.audit.view');
  RETURN jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'actorUserId', a.actor_user_id,
        'entityType', a.entity_type,
        'entityId', a.entity_id,
        'action', a.action,
        'summary', a.summary,
        'detail', a.detail,
        'createdAt', a.created_at
      ) ORDER BY a.created_at DESC)
      FROM (
        SELECT * FROM public.hr_audit_events
        WHERE company_id = _company_id
        ORDER BY created_at DESC
        LIMIT _lim OFFSET _off
      ) a
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_hr_settings(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_settings(UUID, BOOLEAN, TEXT, INTEGER, BOOLEAN, BOOLEAN, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_org_units(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_org_unit(UUID, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_hr_dashboard_kpis(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_employees(UUID, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_hr_employee(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_employee_profile(UUID, UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_audit_events(UUID, INTEGER, INTEGER) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_hr_settings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_settings(UUID, BOOLEAN, TEXT, INTEGER, BOOLEAN, BOOLEAN, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_org_units(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_org_unit(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hr_dashboard_kpis(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_employees(UUID, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hr_employee(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_employee_profile(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_audit_events(UUID, INTEGER, INTEGER) TO authenticated;
