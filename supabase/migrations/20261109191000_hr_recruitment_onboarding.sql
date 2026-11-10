-- HR-04: Recruitment + Onboarding (additive, idempotent).
-- Requires 20261109190000_hr_management_foundation.sql
-- Clients SELECT under RLS; writes via SECURITY DEFINER RPCs.

-- ---------------------------------------------------------------------------
-- Recruitment tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_job_requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  requisition_number TEXT NOT NULL,
  title TEXT NOT NULL,
  department_id UUID REFERENCES public.hr_departments(id) ON DELETE SET NULL,
  designation_id UUID REFERENCES public.hr_designations(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.hr_locations(id) ON DELETE SET NULL,
  employment_type TEXT NOT NULL DEFAULT 'salaried'
    CHECK (employment_type IN ('salaried', 'hourly', 'contractor', 'other')),
  headcount INTEGER NOT NULL DEFAULT 1 CHECK (headcount BETWEEN 1 AND 999),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'filled', 'cancelled')),
  hiring_manager_employee_id UUID REFERENCES public.payroll_employees(id) ON DELETE SET NULL,
  description TEXT,
  opened_on DATE,
  target_start_date DATE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_job_requisitions_number_len CHECK (char_length(trim(requisition_number)) BETWEEN 1 AND 40),
  CONSTRAINT hr_job_requisitions_title_len CHECK (char_length(trim(title)) BETWEEN 1 AND 160)
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_job_requisitions_company_number_uidx
  ON public.hr_job_requisitions (company_id, lower(requisition_number));
CREATE INDEX IF NOT EXISTS hr_job_requisitions_company_status_idx
  ON public.hr_job_requisitions (company_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.hr_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  requisition_id UUID NOT NULL REFERENCES public.hr_job_requisitions(id) ON DELETE CASCADE,
  application_number TEXT NOT NULL,
  candidate_first_name TEXT NOT NULL,
  candidate_last_name TEXT NOT NULL,
  candidate_email TEXT,
  candidate_phone TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'applied'
    CHECK (status IN ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn')),
  stage_notes TEXT,
  applied_on DATE NOT NULL DEFAULT CURRENT_DATE,
  converted_employee_id UUID REFERENCES public.payroll_employees(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_applications_number_len CHECK (char_length(trim(application_number)) BETWEEN 1 AND 40),
  CONSTRAINT hr_applications_name_len CHECK (
    char_length(trim(candidate_first_name)) BETWEEN 1 AND 80
    AND char_length(trim(candidate_last_name)) BETWEEN 1 AND 80
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_applications_company_number_uidx
  ON public.hr_applications (company_id, lower(application_number));
CREATE INDEX IF NOT EXISTS hr_applications_req_status_idx
  ON public.hr_applications (company_id, requisition_id, status);

CREATE TABLE IF NOT EXISTS public.hr_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.hr_applications(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 15 AND 480),
  mode TEXT NOT NULL DEFAULT 'video'
    CHECK (mode IN ('video', 'phone', 'onsite', 'other')),
  interviewer_employee_id UUID REFERENCES public.payroll_employees(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  feedback TEXT,
  rating SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_interviews_app_idx
  ON public.hr_interviews (company_id, application_id, scheduled_at);

CREATE TABLE IF NOT EXISTS public.hr_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.hr_applications(id) ON DELETE CASCADE,
  offer_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'extended', 'accepted', 'declined', 'expired', 'withdrawn')),
  proposed_start_date DATE,
  proposed_designation_id UUID REFERENCES public.hr_designations(id) ON DELETE SET NULL,
  proposed_department_id UUID REFERENCES public.hr_departments(id) ON DELETE SET NULL,
  proposed_location_id UUID REFERENCES public.hr_locations(id) ON DELETE SET NULL,
  notes TEXT,
  extended_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_offers_number_len CHECK (char_length(trim(offer_number)) BETWEEN 1 AND 40)
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_offers_company_number_uidx
  ON public.hr_offers (company_id, lower(offer_number));
CREATE INDEX IF NOT EXISTS hr_offers_app_status_idx
  ON public.hr_offers (company_id, application_id, status);

-- ---------------------------------------------------------------------------
-- Onboarding tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_onboarding_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 100000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_onboarding_templates_code_len CHECK (char_length(trim(code)) BETWEEN 1 AND 40),
  CONSTRAINT hr_onboarding_templates_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_onboarding_templates_company_code_uidx
  ON public.hr_onboarding_templates (company_id, lower(code));

CREATE TABLE IF NOT EXISTS public.hr_onboarding_template_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.hr_onboarding_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  owner_role TEXT NOT NULL DEFAULT 'hr'
    CHECK (owner_role IN ('hr', 'manager', 'employee', 'it', 'other')),
  due_offset_days INTEGER NOT NULL DEFAULT 0 CHECK (due_offset_days BETWEEN -365 AND 365),
  is_required BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 100000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_onboarding_template_tasks_title_len CHECK (char_length(trim(title)) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS hr_onboarding_template_tasks_tpl_idx
  ON public.hr_onboarding_template_tasks (template_id, sort_order);

CREATE TABLE IF NOT EXISTS public.hr_onboarding_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  case_number TEXT NOT NULL,
  employee_id UUID REFERENCES public.payroll_employees(id) ON DELETE SET NULL,
  application_id UUID REFERENCES public.hr_applications(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.hr_onboarding_templates(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  start_date DATE,
  target_join_date DATE,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_onboarding_cases_number_len CHECK (char_length(trim(case_number)) BETWEEN 1 AND 40)
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_onboarding_cases_company_number_uidx
  ON public.hr_onboarding_cases (company_id, lower(case_number));
CREATE INDEX IF NOT EXISTS hr_onboarding_cases_status_idx
  ON public.hr_onboarding_cases (company_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.hr_onboarding_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.hr_onboarding_cases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  owner_role TEXT NOT NULL DEFAULT 'hr'
    CHECK (owner_role IN ('hr', 'manager', 'employee', 'it', 'other')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'blocked', 'skipped')),
  due_on DATE,
  completed_at TIMESTAMPTZ,
  is_required BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 100000),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_onboarding_tasks_title_len CHECK (char_length(trim(title)) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS hr_onboarding_tasks_case_idx
  ON public.hr_onboarding_tasks (case_id, sort_order);

-- ---------------------------------------------------------------------------
-- Sequences helpers on hr_settings
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_settings
  ADD COLUMN IF NOT EXISTS requisition_prefix TEXT NOT NULL DEFAULT 'REQ-'
    CHECK (char_length(trim(requisition_prefix)) BETWEEN 1 AND 12);
ALTER TABLE public.hr_settings
  ADD COLUMN IF NOT EXISTS next_requisition_number INTEGER NOT NULL DEFAULT 1 CHECK (next_requisition_number >= 1);
ALTER TABLE public.hr_settings
  ADD COLUMN IF NOT EXISTS application_prefix TEXT NOT NULL DEFAULT 'APP-'
    CHECK (char_length(trim(application_prefix)) BETWEEN 1 AND 12);
ALTER TABLE public.hr_settings
  ADD COLUMN IF NOT EXISTS next_application_number INTEGER NOT NULL DEFAULT 1 CHECK (next_application_number >= 1);
ALTER TABLE public.hr_settings
  ADD COLUMN IF NOT EXISTS offer_prefix TEXT NOT NULL DEFAULT 'OFR-'
    CHECK (char_length(trim(offer_prefix)) BETWEEN 1 AND 12);
ALTER TABLE public.hr_settings
  ADD COLUMN IF NOT EXISTS next_offer_number INTEGER NOT NULL DEFAULT 1 CHECK (next_offer_number >= 1);
ALTER TABLE public.hr_settings
  ADD COLUMN IF NOT EXISTS onboarding_prefix TEXT NOT NULL DEFAULT 'ONB-'
    CHECK (char_length(trim(onboarding_prefix)) BETWEEN 1 AND 12);
ALTER TABLE public.hr_settings
  ADD COLUMN IF NOT EXISTS next_onboarding_number INTEGER NOT NULL DEFAULT 1 CHECK (next_onboarding_number >= 1);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_job_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_onboarding_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_onboarding_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_onboarding_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_onboarding_tasks ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hr_job_requisitions','hr_applications','hr_interviews','hr_offers',
    'hr_onboarding_templates','hr_onboarding_template_tasks',
    'hr_onboarding_cases','hr_onboarding_tasks'
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
-- Allocate helpers
-- ---------------------------------------------------------------------------
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
  ELSE
    RAISE EXCEPTION 'Unknown HR document kind %', _kind;
  END IF;
  _number := _prefix || lpad(_next::TEXT, 5, '0');
  RETURN _number;
END;
$$;

CREATE OR REPLACE FUNCTION private.hr_require_enabled(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _enabled BOOLEAN;
BEGIN
  PERFORM private.hr_seed_defaults(_company_id);
  SELECT enabled INTO _enabled FROM public.hr_settings WHERE company_id = _company_id;
  IF NOT COALESCE(_enabled, false) THEN
    RAISE EXCEPTION 'HR is disabled for this organisation. Enable it in HR Settings.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Recruitment RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_hr_requisitions(
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
        'id', r.id,
        'requisitionNumber', r.requisition_number,
        'title', r.title,
        'departmentId', r.department_id,
        'designationId', r.designation_id,
        'locationId', r.location_id,
        'employmentType', r.employment_type,
        'headcount', r.headcount,
        'status', r.status,
        'hiringManagerEmployeeId', r.hiring_manager_employee_id,
        'openedOn', r.opened_on,
        'targetStartDate', r.target_start_date,
        'updatedAt', r.updated_at
      ) ORDER BY r.updated_at DESC)
      FROM public.hr_job_requisitions r
      WHERE r.company_id = _company_id
        AND (_status IS NULL OR _status = '' OR _status = 'all' OR r.status = _status)
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_requisition(
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
  _title TEXT := NULLIF(trim(_payload->>'title'), '');
  _status TEXT := COALESCE(NULLIF(_payload->>'status', ''), 'draft');
  _row public.hr_job_requisitions%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.recruitment.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _title IS NULL THEN
    RAISE EXCEPTION 'Title is required';
  END IF;
  IF _status NOT IN ('draft', 'open', 'filled', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid requisition status';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.hr_job_requisitions (
      company_id, requisition_number, title, department_id, designation_id, location_id,
      employment_type, headcount, status, hiring_manager_employee_id, description,
      opened_on, target_start_date, created_by
    ) VALUES (
      _company_id,
      private.hr_allocate_document_number(_company_id, 'requisition'),
      _title,
      NULLIF(_payload->>'departmentId', '')::UUID,
      NULLIF(_payload->>'designationId', '')::UUID,
      NULLIF(_payload->>'locationId', '')::UUID,
      COALESCE(NULLIF(_payload->>'employmentType', ''), 'salaried'),
      COALESCE((_payload->>'headcount')::INTEGER, 1),
      _status,
      NULLIF(_payload->>'hiringManagerEmployeeId', '')::UUID,
      NULLIF(trim(_payload->>'description'), ''),
      CASE WHEN _status = 'open' THEN COALESCE(NULLIF(_payload->>'openedOn', '')::DATE, CURRENT_DATE) ELSE NULLIF(_payload->>'openedOn', '')::DATE END,
      NULLIF(_payload->>'targetStartDate', '')::DATE,
      auth.uid()
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_job_requisitions SET
      title = _title,
      department_id = NULLIF(_payload->>'departmentId', '')::UUID,
      designation_id = NULLIF(_payload->>'designationId', '')::UUID,
      location_id = NULLIF(_payload->>'locationId', '')::UUID,
      employment_type = COALESCE(NULLIF(_payload->>'employmentType', ''), employment_type),
      headcount = COALESCE((_payload->>'headcount')::INTEGER, headcount),
      status = _status,
      hiring_manager_employee_id = NULLIF(_payload->>'hiringManagerEmployeeId', '')::UUID,
      description = NULLIF(trim(_payload->>'description'), ''),
      opened_on = CASE
        WHEN _status = 'open' AND opened_on IS NULL THEN CURRENT_DATE
        ELSE COALESCE(NULLIF(_payload->>'openedOn', '')::DATE, opened_on)
      END,
      target_start_date = NULLIF(_payload->>'targetStartDate', '')::DATE,
      version = version + 1,
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
  END IF;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Requisition not found';
  END IF;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_job_requisition', _row.id,
    CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,
    format('Requisition %s (%s)', _row.requisition_number, _row.status),
    jsonb_build_object('status', _row.status, 'title', _row.title)
  );

  RETURN jsonb_build_object(
    'id', _row.id,
    'requisitionNumber', _row.requisition_number,
    'status', _row.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_hr_applications(
  _company_id UUID,
  _requisition_id UUID DEFAULT NULL,
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
        'id', a.id,
        'requisitionId', a.requisition_id,
        'applicationNumber', a.application_number,
        'candidateFirstName', a.candidate_first_name,
        'candidateLastName', a.candidate_last_name,
        'candidateEmail', a.candidate_email,
        'candidatePhone', a.candidate_phone,
        'source', a.source,
        'status', a.status,
        'appliedOn', a.applied_on,
        'convertedEmployeeId', a.converted_employee_id,
        'requisitionTitle', r.title,
        'updatedAt', a.updated_at
      ) ORDER BY a.updated_at DESC)
      FROM public.hr_applications a
      JOIN public.hr_job_requisitions r ON r.id = a.requisition_id
      WHERE a.company_id = _company_id
        AND (_requisition_id IS NULL OR a.requisition_id = _requisition_id)
        AND (_status IS NULL OR _status = '' OR _status = 'all' OR a.status = _status)
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_application(
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
  _req UUID := NULLIF(_payload->>'requisitionId', '')::UUID;
  _first TEXT := NULLIF(trim(_payload->>'candidateFirstName'), '');
  _last TEXT := NULLIF(trim(_payload->>'candidateLastName'), '');
  _status TEXT := COALESCE(NULLIF(_payload->>'status', ''), 'applied');
  _row public.hr_applications%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.recruitment.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _req IS NULL OR _first IS NULL OR _last IS NULL THEN
    RAISE EXCEPTION 'Requisition and candidate name are required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hr_job_requisitions r
    WHERE r.id = _req AND r.company_id = _company_id AND r.status IN ('open', 'draft')
  ) THEN
    RAISE EXCEPTION 'Requisition not found or not open for applications';
  END IF;
  IF _status NOT IN ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn') THEN
    RAISE EXCEPTION 'Invalid application status';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.hr_applications (
      company_id, requisition_id, application_number, candidate_first_name, candidate_last_name,
      candidate_email, candidate_phone, source, status, stage_notes, applied_on, created_by
    ) VALUES (
      _company_id, _req,
      private.hr_allocate_document_number(_company_id, 'application'),
      _first, _last,
      NULLIF(trim(_payload->>'candidateEmail'), ''),
      NULLIF(trim(_payload->>'candidatePhone'), ''),
      NULLIF(trim(_payload->>'source'), ''),
      _status,
      NULLIF(trim(_payload->>'stageNotes'), ''),
      COALESCE(NULLIF(_payload->>'appliedOn', '')::DATE, CURRENT_DATE),
      auth.uid()
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_applications SET
      candidate_first_name = _first,
      candidate_last_name = _last,
      candidate_email = NULLIF(trim(_payload->>'candidateEmail'), ''),
      candidate_phone = NULLIF(trim(_payload->>'candidatePhone'), ''),
      source = NULLIF(trim(_payload->>'source'), ''),
      status = _status,
      stage_notes = NULLIF(trim(_payload->>'stageNotes'), ''),
      version = version + 1,
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
  END IF;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_application', _row.id,
    CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,
    format('Application %s (%s)', _row.application_number, _row.status),
    jsonb_build_object('status', _row.status)
  );

  RETURN jsonb_build_object('id', _row.id, 'applicationNumber', _row.application_number, 'status', _row.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_interview(
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
  _app UUID := NULLIF(_payload->>'applicationId', '')::UUID;
  _when TIMESTAMPTZ := NULLIF(_payload->>'scheduledAt', '')::TIMESTAMPTZ;
  _row public.hr_interviews%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.recruitment.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _app IS NULL OR _when IS NULL THEN
    RAISE EXCEPTION 'Application and schedule time are required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hr_applications a WHERE a.id = _app AND a.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.hr_interviews (
      company_id, application_id, scheduled_at, duration_minutes, mode,
      interviewer_employee_id, status, feedback, rating, created_by
    ) VALUES (
      _company_id, _app, _when,
      COALESCE((_payload->>'durationMinutes')::INTEGER, 60),
      COALESCE(NULLIF(_payload->>'mode', ''), 'video'),
      NULLIF(_payload->>'interviewerEmployeeId', '')::UUID,
      COALESCE(NULLIF(_payload->>'status', ''), 'scheduled'),
      NULLIF(trim(_payload->>'feedback'), ''),
      NULLIF(_payload->>'rating', '')::SMALLINT,
      auth.uid()
    ) RETURNING * INTO _row;
    UPDATE public.hr_applications
    SET status = CASE WHEN status IN ('applied', 'screening') THEN 'interview' ELSE status END,
        updated_at = now(), version = version + 1
    WHERE id = _app AND company_id = _company_id;
  ELSE
    UPDATE public.hr_interviews SET
      scheduled_at = _when,
      duration_minutes = COALESCE((_payload->>'durationMinutes')::INTEGER, duration_minutes),
      mode = COALESCE(NULLIF(_payload->>'mode', ''), mode),
      interviewer_employee_id = NULLIF(_payload->>'interviewerEmployeeId', '')::UUID,
      status = COALESCE(NULLIF(_payload->>'status', ''), status),
      feedback = NULLIF(trim(_payload->>'feedback'), ''),
      rating = NULLIF(_payload->>'rating', '')::SMALLINT,
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
  END IF;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Interview not found';
  END IF;

  RETURN jsonb_build_object('id', _row.id, 'status', _row.status, 'scheduledAt', _row.scheduled_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_offer(
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
  _app UUID := NULLIF(_payload->>'applicationId', '')::UUID;
  _status TEXT := COALESCE(NULLIF(_payload->>'status', ''), 'draft');
  _row public.hr_offers%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.recruitment.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _app IS NULL THEN
    RAISE EXCEPTION 'Application is required';
  END IF;
  IF _status NOT IN ('draft', 'extended', 'accepted', 'declined', 'expired', 'withdrawn') THEN
    RAISE EXCEPTION 'Invalid offer status';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hr_applications a WHERE a.id = _app AND a.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.hr_offers (
      company_id, application_id, offer_number, status, proposed_start_date,
      proposed_designation_id, proposed_department_id, proposed_location_id, notes,
      extended_at, created_by
    ) VALUES (
      _company_id, _app,
      private.hr_allocate_document_number(_company_id, 'offer'),
      _status,
      NULLIF(_payload->>'proposedStartDate', '')::DATE,
      NULLIF(_payload->>'proposedDesignationId', '')::UUID,
      NULLIF(_payload->>'proposedDepartmentId', '')::UUID,
      NULLIF(_payload->>'proposedLocationId', '')::UUID,
      NULLIF(trim(_payload->>'notes'), ''),
      CASE WHEN _status = 'extended' THEN now() ELSE NULL END,
      auth.uid()
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_offers SET
      status = _status,
      proposed_start_date = NULLIF(_payload->>'proposedStartDate', '')::DATE,
      proposed_designation_id = NULLIF(_payload->>'proposedDesignationId', '')::UUID,
      proposed_department_id = NULLIF(_payload->>'proposedDepartmentId', '')::UUID,
      proposed_location_id = NULLIF(_payload->>'proposedLocationId', '')::UUID,
      notes = NULLIF(trim(_payload->>'notes'), ''),
      extended_at = CASE WHEN _status = 'extended' AND extended_at IS NULL THEN now() ELSE extended_at END,
      responded_at = CASE WHEN _status IN ('accepted', 'declined') THEN COALESCE(responded_at, now()) ELSE responded_at END,
      version = version + 1,
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
  END IF;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;

  IF _status IN ('extended', 'accepted') THEN
    UPDATE public.hr_applications
    SET status = CASE
          WHEN _status = 'accepted' THEN 'offer'
          WHEN status IN ('applied', 'screening', 'interview') THEN 'offer'
          ELSE status
        END,
        updated_at = now(), version = version + 1
    WHERE id = _app AND company_id = _company_id;
  END IF;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_offer', _row.id,
    CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,
    format('Offer %s (%s)', _row.offer_number, _row.status),
    jsonb_build_object('status', _row.status)
  );

  RETURN jsonb_build_object('id', _row.id, 'offerNumber', _row.offer_number, 'status', _row.status);
END;
$$;

-- ---------------------------------------------------------------------------
-- Onboarding RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_hr_onboarding_templates(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  RETURN jsonb_build_object(
    'templates', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id,
        'code', t.code,
        'name', t.name,
        'description', t.description,
        'isActive', t.is_active,
        'sortOrder', t.sort_order,
        'taskCount', (
          SELECT count(*) FROM public.hr_onboarding_template_tasks x WHERE x.template_id = t.id
        )
      ) ORDER BY t.sort_order, t.name)
      FROM public.hr_onboarding_templates t
      WHERE t.company_id = _company_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_onboarding_template(
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
  _row public.hr_onboarding_templates%ROWTYPE;
  _task JSONB;
  _tasks JSONB := COALESCE(_payload->'tasks', '[]'::jsonb);
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.onboarding.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _code IS NULL OR _name IS NULL THEN
    RAISE EXCEPTION 'Code and name are required';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.hr_onboarding_templates (
      company_id, code, name, description, is_active, sort_order
    ) VALUES (
      _company_id, _code, _name,
      NULLIF(trim(_payload->>'description'), ''),
      COALESCE((_payload->>'isActive')::BOOLEAN, true),
      COALESCE((_payload->>'sortOrder')::INTEGER, 100)
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_onboarding_templates SET
      code = _code,
      name = _name,
      description = NULLIF(trim(_payload->>'description'), ''),
      is_active = COALESCE((_payload->>'isActive')::BOOLEAN, is_active),
      sort_order = COALESCE((_payload->>'sortOrder')::INTEGER, sort_order),
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
  END IF;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Onboarding template not found';
  END IF;

  IF jsonb_typeof(_tasks) = 'array' AND jsonb_array_length(_tasks) > 0 THEN
    DELETE FROM public.hr_onboarding_template_tasks
    WHERE template_id = _row.id AND company_id = _company_id;
    FOR _task IN SELECT value FROM jsonb_array_elements(_tasks)
    LOOP
      INSERT INTO public.hr_onboarding_template_tasks (
        company_id, template_id, title, owner_role, due_offset_days, is_required, sort_order
      ) VALUES (
        _company_id, _row.id,
        NULLIF(trim(_task->>'title'), ''),
        COALESCE(NULLIF(_task->>'ownerRole', ''), 'hr'),
        COALESCE((_task->>'dueOffsetDays')::INTEGER, 0),
        COALESCE((_task->>'isRequired')::BOOLEAN, true),
        COALESCE((_task->>'sortOrder')::INTEGER, 100)
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('id', _row.id, 'code', _row.code, 'name', _row.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_hr_onboarding_cases(
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
        'caseNumber', c.case_number,
        'employeeId', c.employee_id,
        'applicationId', c.application_id,
        'templateId', c.template_id,
        'status', c.status,
        'startDate', c.start_date,
        'targetJoinDate', c.target_join_date,
        'completedAt', c.completed_at,
        'employeeName', CASE
          WHEN e.id IS NULL THEN NULL
          ELSE trim(e.first_name || ' ' || e.last_name)
        END,
        'pendingTasks', (
          SELECT count(*) FROM public.hr_onboarding_tasks t
          WHERE t.case_id = c.id AND t.status = 'pending'
        ),
        'updatedAt', c.updated_at
      ) ORDER BY c.updated_at DESC)
      FROM public.hr_onboarding_cases c
      LEFT JOIN public.payroll_employees e ON e.id = c.employee_id
      WHERE c.company_id = _company_id
        AND (_status IS NULL OR _status = '' OR _status = 'all' OR c.status = _status)
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_hr_onboarding_case(
  _company_id UUID,
  _case_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _case public.hr_onboarding_cases%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  SELECT * INTO _case FROM public.hr_onboarding_cases
  WHERE id = _case_id AND company_id = _company_id;
  IF _case.id IS NULL THEN
    RAISE EXCEPTION 'Onboarding case not found';
  END IF;
  RETURN jsonb_build_object(
    'case', jsonb_build_object(
      'id', _case.id,
      'caseNumber', _case.case_number,
      'employeeId', _case.employee_id,
      'applicationId', _case.application_id,
      'templateId', _case.template_id,
      'status', _case.status,
      'startDate', _case.start_date,
      'targetJoinDate', _case.target_join_date,
      'completedAt', _case.completed_at,
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
      FROM public.hr_onboarding_tasks t
      WHERE t.case_id = _case.id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_hr_onboarding_case(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _template_id UUID := NULLIF(_payload->>'templateId', '')::UUID;
  _employee_id UUID := NULLIF(_payload->>'employeeId', '')::UUID;
  _application_id UUID := NULLIF(_payload->>'applicationId', '')::UUID;
  _join DATE := NULLIF(_payload->>'targetJoinDate', '')::DATE;
  _case public.hr_onboarding_cases%ROWTYPE;
  _tpl public.hr_onboarding_templates%ROWTYPE;
  _task public.hr_onboarding_template_tasks%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.onboarding.manage');
  PERFORM private.hr_require_enabled(_company_id);

  IF _employee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.payroll_employees e WHERE e.id = _employee_id AND e.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Employee not found in this organisation';
  END IF;

  IF _template_id IS NOT NULL THEN
    SELECT * INTO _tpl FROM public.hr_onboarding_templates
    WHERE id = _template_id AND company_id = _company_id AND is_active;
    IF _tpl.id IS NULL THEN
      RAISE EXCEPTION 'Onboarding template not found';
    END IF;
  END IF;

  INSERT INTO public.hr_onboarding_cases (
    company_id, case_number, employee_id, application_id, template_id,
    status, start_date, target_join_date, notes, created_by
  ) VALUES (
    _company_id,
    private.hr_allocate_document_number(_company_id, 'onboarding'),
    _employee_id, _application_id, _template_id,
    'planned', CURRENT_DATE, _join,
    NULLIF(trim(_payload->>'notes'), ''),
    auth.uid()
  ) RETURNING * INTO _case;

  IF _template_id IS NOT NULL THEN
    FOR _task IN
      SELECT * FROM public.hr_onboarding_template_tasks
      WHERE template_id = _template_id AND company_id = _company_id
      ORDER BY sort_order
    LOOP
      INSERT INTO public.hr_onboarding_tasks (
        company_id, case_id, title, owner_role, status, due_on, is_required, sort_order
      ) VALUES (
        _company_id, _case.id, _task.title, _task.owner_role, 'pending',
        CASE WHEN _join IS NULL THEN NULL ELSE _join + (_task.due_offset_days || ' days')::INTERVAL END,
        _task.is_required, _task.sort_order
      );
    END LOOP;
  END IF;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_onboarding_case', _case.id, 'create',
    format('Onboarding case %s created', _case.case_number),
    jsonb_build_object('templateId', _template_id, 'employeeId', _employee_id)
  );

  RETURN public.get_hr_onboarding_case(_company_id, _case.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_hr_onboarding_task(
  _company_id UUID,
  _task_id UUID,
  _status TEXT,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _task public.hr_onboarding_tasks%ROWTYPE;
  _pending INTEGER;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.onboarding.manage');
  IF _status NOT IN ('pending', 'done', 'blocked', 'skipped') THEN
    RAISE EXCEPTION 'Invalid onboarding task status';
  END IF;

  UPDATE public.hr_onboarding_tasks SET
    status = _status,
    notes = COALESCE(NULLIF(trim(_notes), ''), notes),
    completed_at = CASE WHEN _status = 'done' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = _task_id AND company_id = _company_id
  RETURNING * INTO _task;

  IF _task.id IS NULL THEN
    RAISE EXCEPTION 'Onboarding task not found';
  END IF;

  SELECT count(*) INTO _pending
  FROM public.hr_onboarding_tasks
  WHERE case_id = _task.case_id AND status = 'pending' AND is_required;

  UPDATE public.hr_onboarding_cases SET
    status = CASE
      WHEN _pending = 0 THEN 'completed'
      WHEN status = 'planned' THEN 'in_progress'
      ELSE status
    END,
    completed_at = CASE WHEN _pending = 0 THEN now() ELSE completed_at END,
    updated_at = now(),
    version = version + 1
  WHERE id = _task.case_id AND company_id = _company_id;

  RETURN public.get_hr_onboarding_case(_company_id, _task.case_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_hr_interviews_and_offers(
  _company_id UUID,
  _application_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  RETURN jsonb_build_object(
    'interviews', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id,
        'applicationId', i.application_id,
        'scheduledAt', i.scheduled_at,
        'durationMinutes', i.duration_minutes,
        'mode', i.mode,
        'interviewerEmployeeId', i.interviewer_employee_id,
        'status', i.status,
        'feedback', i.feedback,
        'rating', i.rating
      ) ORDER BY i.scheduled_at DESC)
      FROM public.hr_interviews i
      WHERE i.company_id = _company_id
        AND (_application_id IS NULL OR i.application_id = _application_id)
    ), '[]'::jsonb),
    'offers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', o.id,
        'applicationId', o.application_id,
        'offerNumber', o.offer_number,
        'status', o.status,
        'proposedStartDate', o.proposed_start_date,
        'proposedDesignationId', o.proposed_designation_id,
        'proposedDepartmentId', o.proposed_department_id,
        'proposedLocationId', o.proposed_location_id,
        'notes', o.notes,
        'extendedAt', o.extended_at,
        'respondedAt', o.responded_at
      ) ORDER BY o.updated_at DESC)
      FROM public.hr_offers o
      WHERE o.company_id = _company_id
        AND (_application_id IS NULL OR o.application_id = _application_id)
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_hr_requisitions(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_requisition(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_applications(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_application(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_interview(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_offer(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_onboarding_templates(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_onboarding_template(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_onboarding_cases(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_hr_onboarding_case(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_hr_onboarding_case(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_hr_onboarding_task(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_interviews_and_offers(UUID, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_hr_requisitions(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_requisition(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_applications(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_application(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_interview(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_offer(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_onboarding_templates(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_onboarding_template(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_onboarding_cases(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hr_onboarding_case(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_hr_onboarding_case(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_hr_onboarding_task(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_interviews_and_offers(UUID, UUID) TO authenticated;
