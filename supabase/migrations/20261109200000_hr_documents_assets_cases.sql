-- HR-08: Employee documents, assets, employee-relations cases (additive).
-- Document rows store metadata; binary storage handoff is HR-11 (Files).
-- Requires foundation migration.

CREATE TABLE IF NOT EXISTS public.hr_employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL
    CHECK (document_type IN ('contract','id','visa','certificate','policy','other')),
  title TEXT NOT NULL,
  document_number TEXT,
  issued_on DATE,
  expires_on DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','expired','superseded','archived')),
  storage_path TEXT,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_employee_documents_title_len CHECK (char_length(trim(title)) BETWEEN 1 AND 160),
  CONSTRAINT hr_employee_documents_expiry CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on)
);

CREATE INDEX IF NOT EXISTS hr_employee_documents_company_emp_idx
  ON public.hr_employee_documents (company_id, employee_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS hr_employee_documents_expiry_idx
  ON public.hr_employee_documents (company_id, expires_on)
  WHERE expires_on IS NOT NULL AND status = 'active';

CREATE TABLE IF NOT EXISTS public.hr_asset_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 100000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_asset_types_code_len CHECK (char_length(trim(code)) BETWEEN 1 AND 40),
  CONSTRAINT hr_asset_types_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_asset_types_company_code_uidx
  ON public.hr_asset_types (company_id, lower(code));

CREATE TABLE IF NOT EXISTS public.hr_asset_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  asset_type_id UUID NOT NULL REFERENCES public.hr_asset_types(id) ON DELETE RESTRICT,
  asset_tag TEXT NOT NULL,
  description TEXT,
  condition_on_issue TEXT NOT NULL DEFAULT 'good'
    CHECK (condition_on_issue IN ('new','good','fair','poor')),
  condition_on_return TEXT
    CHECK (condition_on_return IS NULL OR condition_on_return IN ('new','good','fair','poor','damaged','lost')),
  status TEXT NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned','returned','lost','written_off')),
  assigned_on DATE NOT NULL DEFAULT CURRENT_DATE,
  returned_on DATE,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_asset_assignments_tag_len CHECK (char_length(trim(asset_tag)) BETWEEN 1 AND 80),
  CONSTRAINT hr_asset_assignments_return CHECK (
    returned_on IS NULL OR returned_on >= assigned_on
  )
);

CREATE INDEX IF NOT EXISTS hr_asset_assignments_company_status_idx
  ON public.hr_asset_assignments (company_id, status, assigned_on DESC);
CREATE UNIQUE INDEX IF NOT EXISTS hr_asset_assignments_open_tag_uidx
  ON public.hr_asset_assignments (company_id, lower(asset_tag))
  WHERE status = 'assigned';

CREATE TABLE IF NOT EXISTS public.hr_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  case_number TEXT NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  case_type TEXT NOT NULL
    CHECK (case_type IN ('grievance','disciplinary','investigation','other')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_review','resolved','closed','cancelled')),
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low','medium','high','critical')),
  opened_on DATE NOT NULL DEFAULT CURRENT_DATE,
  closed_on DATE,
  summary TEXT,
  resolution_notes TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_cases_number_len CHECK (char_length(trim(case_number)) BETWEEN 1 AND 40),
  CONSTRAINT hr_cases_title_len CHECK (char_length(trim(title)) BETWEEN 1 AND 200),
  CONSTRAINT hr_cases_closed CHECK (closed_on IS NULL OR closed_on >= opened_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_cases_company_number_uidx
  ON public.hr_cases (company_id, lower(case_number));
CREATE INDEX IF NOT EXISTS hr_cases_status_idx
  ON public.hr_cases (company_id, status, updated_at DESC);

ALTER TABLE public.hr_settings
  ADD COLUMN IF NOT EXISTS case_prefix TEXT NOT NULL DEFAULT 'CASE-'
    CHECK (char_length(trim(case_prefix)) BETWEEN 1 AND 12);
ALTER TABLE public.hr_settings
  ADD COLUMN IF NOT EXISTS next_case_number INTEGER NOT NULL DEFAULT 1 CHECK (next_case_number >= 1);

-- RLS
ALTER TABLE public.hr_employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_asset_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_asset_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_cases ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hr_employee_documents','hr_asset_types','hr_asset_assignments','hr_cases'
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
  ELSE
    RAISE EXCEPTION 'Unknown HR document kind %', _kind;
  END IF;
  RETURN _prefix || lpad(_next::TEXT, 5, '0');
END;
$$;

-- Documents
CREATE OR REPLACE FUNCTION public.list_hr_employee_documents(
  _company_id UUID,
  _employee_id UUID DEFAULT NULL,
  _status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  RETURN jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id,
        'employeeId', d.employee_id,
        'employeeName', trim(both FROM concat_ws(' ', e.first_name, e.last_name)),
        'employeeNumber', e.employee_number,
        'documentType', d.document_type,
        'title', d.title,
        'documentNumber', d.document_number,
        'issuedOn', d.issued_on,
        'expiresOn', d.expires_on,
        'status', d.status,
        'storagePath', d.storage_path,
        'notes', d.notes,
        'updatedAt', d.updated_at
      ) ORDER BY d.updated_at DESC)
      FROM public.hr_employee_documents d
      JOIN public.payroll_employees e ON e.id = d.employee_id
      WHERE d.company_id = _company_id
        AND (_employee_id IS NULL OR d.employee_id = _employee_id)
        AND (_status IS NULL OR _status = '' OR _status = 'all' OR d.status = _status)
    ), '[]'::jsonb),
    'expiringSoon', (
      SELECT count(*)::INTEGER FROM public.hr_employee_documents d
      WHERE d.company_id = _company_id
        AND d.status = 'active'
        AND d.expires_on IS NOT NULL
        AND d.expires_on BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_employee_document(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id', '')::UUID;
  _employee UUID := NULLIF(_payload->>'employeeId', '')::UUID;
  _title TEXT := NULLIF(trim(_payload->>'title'), '');
  _type TEXT := COALESCE(NULLIF(_payload->>'documentType', ''), 'other');
  _status TEXT := COALESCE(NULLIF(_payload->>'status', ''), 'active');
  _row public.hr_employee_documents%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.employees.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _employee IS NULL OR _title IS NULL THEN
    RAISE EXCEPTION 'Employee and title are required';
  END IF;
  IF _type NOT IN ('contract','id','visa','certificate','policy','other') THEN
    RAISE EXCEPTION 'Invalid document type';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payroll_employees e WHERE e.id = _employee AND e.company_id = _company_id) THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.hr_employee_documents (
      company_id, employee_id, document_type, title, document_number,
      issued_on, expires_on, status, storage_path, notes, created_by
    ) VALUES (
      _company_id, _employee, _type, _title,
      NULLIF(trim(_payload->>'documentNumber'), ''),
      NULLIF(_payload->>'issuedOn', '')::DATE,
      NULLIF(_payload->>'expiresOn', '')::DATE,
      _status,
      NULLIF(trim(_payload->>'storagePath'), ''),
      NULLIF(trim(_payload->>'notes'), ''),
      auth.uid()
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_employee_documents SET
      document_type = _type,
      title = _title,
      document_number = NULLIF(trim(_payload->>'documentNumber'), ''),
      issued_on = NULLIF(_payload->>'issuedOn', '')::DATE,
      expires_on = NULLIF(_payload->>'expiresOn', '')::DATE,
      status = _status,
      storage_path = NULLIF(trim(_payload->>'storagePath'), ''),
      notes = NULLIF(trim(_payload->>'notes'), ''),
      version = version + 1,
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
  END IF;

  IF _row.id IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_employee_document', _row.id,
    CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,
    format('Document %s (%s)', _row.title, _row.status),
    jsonb_build_object('status', _row.status, 'documentType', _row.document_type)
  );

  RETURN jsonb_build_object('id', _row.id, 'title', _row.title, 'status', _row.status);
END;
$$;

-- Assets
CREATE OR REPLACE FUNCTION public.list_hr_asset_types(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  RETURN jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'code', t.code, 'name', t.name,
        'isActive', t.is_active, 'sortOrder', t.sort_order
      ) ORDER BY t.sort_order, t.name)
      FROM public.hr_asset_types t WHERE t.company_id = _company_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_asset_type(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id', '')::UUID;
  _code TEXT := NULLIF(trim(_payload->>'code'), '');
  _name TEXT := NULLIF(trim(_payload->>'name'), '');
  _row public.hr_asset_types%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.employees.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _code IS NULL OR _name IS NULL THEN RAISE EXCEPTION 'Code and name are required'; END IF;
  IF _id IS NULL THEN
    INSERT INTO public.hr_asset_types (company_id, code, name, is_active, sort_order)
    VALUES (_company_id, _code, _name, COALESCE((_payload->>'isActive')::BOOLEAN, true),
            COALESCE((_payload->>'sortOrder')::INTEGER, 100))
    RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_asset_types SET
      code = _code, name = _name,
      is_active = COALESCE((_payload->>'isActive')::BOOLEAN, is_active),
      sort_order = COALESCE((_payload->>'sortOrder')::INTEGER, sort_order),
      updated_at = now()
    WHERE id = _id AND company_id = _company_id RETURNING * INTO _row;
  END IF;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Asset type not found'; END IF;
  PERFORM private.hr_write_audit(_company_id, 'hr_asset_type', _row.id,
    CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,
    format('Asset type %s', _row.code), jsonb_build_object('code', _row.code));
  RETURN jsonb_build_object('id', _row.id, 'code', _row.code, 'name', _row.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_hr_asset_assignments(
  _company_id UUID, _status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
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
        'assetTypeId', a.asset_type_id,
        'assetTypeCode', t.code,
        'assetTypeName', t.name,
        'assetTag', a.asset_tag,
        'description', a.description,
        'conditionOnIssue', a.condition_on_issue,
        'conditionOnReturn', a.condition_on_return,
        'status', a.status,
        'assignedOn', a.assigned_on,
        'returnedOn', a.returned_on,
        'notes', a.notes,
        'updatedAt', a.updated_at
      ) ORDER BY a.updated_at DESC)
      FROM public.hr_asset_assignments a
      JOIN public.payroll_employees e ON e.id = a.employee_id
      JOIN public.hr_asset_types t ON t.id = a.asset_type_id
      WHERE a.company_id = _company_id
        AND (_status IS NULL OR _status = '' OR _status = 'all' OR a.status = _status)
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_asset_assignment(
  _company_id UUID, _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id', '')::UUID;
  _employee UUID := NULLIF(_payload->>'employeeId', '')::UUID;
  _type UUID := NULLIF(_payload->>'assetTypeId', '')::UUID;
  _tag TEXT := NULLIF(trim(_payload->>'assetTag'), '');
  _status TEXT := COALESCE(NULLIF(_payload->>'status', ''), 'assigned');
  _row public.hr_asset_assignments%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.employees.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _employee IS NULL OR _type IS NULL OR _tag IS NULL THEN
    RAISE EXCEPTION 'Employee, asset type and tag are required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payroll_employees e WHERE e.id = _employee AND e.company_id = _company_id) THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hr_asset_types t WHERE t.id = _type AND t.company_id = _company_id AND t.is_active) THEN
    RAISE EXCEPTION 'Active asset type not found';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.hr_asset_assignments (
      company_id, employee_id, asset_type_id, asset_tag, description,
      condition_on_issue, status, assigned_on, notes, created_by
    ) VALUES (
      _company_id, _employee, _type, _tag,
      NULLIF(trim(_payload->>'description'), ''),
      COALESCE(NULLIF(_payload->>'conditionOnIssue', ''), 'good'),
      _status,
      COALESCE(NULLIF(_payload->>'assignedOn', '')::DATE, CURRENT_DATE),
      NULLIF(trim(_payload->>'notes'), ''),
      auth.uid()
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_asset_assignments SET
      employee_id = _employee,
      asset_type_id = _type,
      asset_tag = _tag,
      description = NULLIF(trim(_payload->>'description'), ''),
      condition_on_issue = COALESCE(NULLIF(_payload->>'conditionOnIssue', ''), condition_on_issue),
      condition_on_return = NULLIF(_payload->>'conditionOnReturn', ''),
      status = _status,
      assigned_on = COALESCE(NULLIF(_payload->>'assignedOn', '')::DATE, assigned_on),
      returned_on = CASE WHEN _status = 'returned' THEN COALESCE(NULLIF(_payload->>'returnedOn', '')::DATE, CURRENT_DATE) ELSE NULLIF(_payload->>'returnedOn', '')::DATE END,
      notes = NULLIF(trim(_payload->>'notes'), ''),
      version = version + 1,
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
  END IF;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Asset assignment not found'; END IF;
  PERFORM private.hr_write_audit(_company_id, 'hr_asset_assignment', _row.id,
    CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,
    format('Asset %s (%s)', _row.asset_tag, _row.status),
    jsonb_build_object('status', _row.status));
  RETURN jsonb_build_object('id', _row.id, 'assetTag', _row.asset_tag, 'status', _row.status);
END;
$$;

-- Cases
CREATE OR REPLACE FUNCTION public.list_hr_cases(
  _company_id UUID, _status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  RETURN jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'caseNumber', c.case_number,
        'employeeId', c.employee_id,
        'employeeName', trim(both FROM concat_ws(' ', e.first_name, e.last_name)),
        'employeeNumber', e.employee_number,
        'caseType', c.case_type,
        'title', c.title,
        'status', c.status,
        'severity', c.severity,
        'openedOn', c.opened_on,
        'closedOn', c.closed_on,
        'summary', c.summary,
        'updatedAt', c.updated_at
      ) ORDER BY c.updated_at DESC)
      FROM public.hr_cases c
      JOIN public.payroll_employees e ON e.id = c.employee_id
      WHERE c.company_id = _company_id
        AND (_status IS NULL OR _status = '' OR _status = 'all' OR c.status = _status)
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_case(
  _company_id UUID, _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id', '')::UUID;
  _employee UUID := NULLIF(_payload->>'employeeId', '')::UUID;
  _title TEXT := NULLIF(trim(_payload->>'title'), '');
  _type TEXT := COALESCE(NULLIF(_payload->>'caseType', ''), 'other');
  _status TEXT := COALESCE(NULLIF(_payload->>'status', ''), 'open');
  _severity TEXT := COALESCE(NULLIF(_payload->>'severity', ''), 'medium');
  _row public.hr_cases%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.cases.manage');
  PERFORM private.hr_require_enabled(_company_id);
  IF _employee IS NULL OR _title IS NULL THEN
    RAISE EXCEPTION 'Employee and title are required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payroll_employees e WHERE e.id = _employee AND e.company_id = _company_id) THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.hr_cases (
      company_id, case_number, employee_id, case_type, title, status, severity,
      opened_on, summary, created_by
    ) VALUES (
      _company_id, private.hr_allocate_document_number(_company_id, 'case'),
      _employee, _type, _title, _status, _severity,
      COALESCE(NULLIF(_payload->>'openedOn', '')::DATE, CURRENT_DATE),
      NULLIF(trim(_payload->>'summary'), ''),
      auth.uid()
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_cases SET
      employee_id = _employee,
      case_type = _type,
      title = _title,
      status = _status,
      severity = _severity,
      opened_on = COALESCE(NULLIF(_payload->>'openedOn', '')::DATE, opened_on),
      closed_on = CASE WHEN _status IN ('resolved','closed','cancelled')
        THEN COALESCE(NULLIF(_payload->>'closedOn', '')::DATE, CURRENT_DATE) ELSE NULL END,
      summary = NULLIF(trim(_payload->>'summary'), ''),
      resolution_notes = NULLIF(trim(_payload->>'resolutionNotes'), ''),
      version = version + 1,
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
  END IF;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Case not found'; END IF;
  PERFORM private.hr_write_audit(_company_id, 'hr_case', _row.id,
    CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,
    format('Case %s (%s)', _row.case_number, _row.status),
    jsonb_build_object('status', _row.status, 'severity', _row.severity));
  RETURN jsonb_build_object('id', _row.id, 'caseNumber', _row.case_number, 'status', _row.status);
END;
$$;

-- Refresh KPI expiring documents
CREATE OR REPLACE FUNCTION public.get_hr_dashboard_kpis(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _settings public.hr_settings%ROWTYPE;
  _att_pending INTEGER := 0;
  _leave_pending INTEGER := 0;
  _att_exc INTEGER := 0;
  _open_req INTEGER := 0;
  _expiring INTEGER := 0;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  PERFORM private.hr_seed_defaults(_company_id);
  SELECT * INTO _settings FROM public.hr_settings WHERE company_id = _company_id;

  IF to_regclass('public.hr_attendance_corrections') IS NOT NULL THEN
    SELECT count(*)::INTEGER INTO _att_pending FROM public.hr_attendance_corrections c
    WHERE c.company_id = _company_id AND c.status = 'submitted';
  END IF;
  IF to_regclass('public.hr_leave_requests') IS NOT NULL THEN
    SELECT count(*)::INTEGER INTO _leave_pending FROM public.hr_leave_requests r
    WHERE r.company_id = _company_id AND r.status = 'submitted';
  END IF;
  IF to_regclass('public.hr_attendance_logs') IS NOT NULL THEN
    SELECT count(*)::INTEGER INTO _att_exc FROM public.hr_attendance_logs l
    WHERE l.company_id = _company_id AND l.status = 'exception';
  END IF;
  IF to_regclass('public.hr_job_requisitions') IS NOT NULL THEN
    SELECT count(*)::INTEGER INTO _open_req FROM public.hr_job_requisitions r
    WHERE r.company_id = _company_id AND r.status = 'open';
  END IF;
  IF to_regclass('public.hr_employee_documents') IS NOT NULL THEN
    SELECT count(*)::INTEGER INTO _expiring FROM public.hr_employee_documents d
    WHERE d.company_id = _company_id AND d.status = 'active'
      AND d.expires_on IS NOT NULL
      AND d.expires_on BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days');
  END IF;

  RETURN jsonb_build_object(
    'enabled', COALESCE(_settings.enabled, false),
    'activeEmployees', (SELECT count(*)::INTEGER FROM public.payroll_employees e WHERE e.company_id = _company_id AND e.status = 'active'),
    'archivedEmployees', (SELECT count(*)::INTEGER FROM public.payroll_employees e WHERE e.company_id = _company_id AND e.status = 'archived'),
    'terminatedEmployees', (SELECT count(*)::INTEGER FROM public.payroll_employees e WHERE e.company_id = _company_id AND e.status = 'terminated'),
    'profilesLinked', (SELECT count(*)::INTEGER FROM public.hr_employee_profiles p WHERE p.company_id = _company_id),
    'departments', (SELECT count(*)::INTEGER FROM public.hr_departments d WHERE d.company_id = _company_id AND d.is_active),
    'locations', (SELECT count(*)::INTEGER FROM public.hr_locations l WHERE l.company_id = _company_id AND l.is_active),
    'pendingApprovals', (_att_pending + _leave_pending),
    'attendanceExceptions', _att_exc,
    'expiringDocuments', _expiring,
    'openRequisitions', _open_req
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_hr_employee_documents(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_employee_document(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_asset_types(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_asset_type(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_asset_assignments(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_asset_assignment(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hr_cases(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_case(UUID, JSONB) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_hr_employee_documents(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_employee_document(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_asset_types(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_asset_type(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_asset_assignments(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_asset_assignment(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_cases(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_case(UUID, JSONB) TO authenticated;