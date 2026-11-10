-- HR-12: Reports, automation rules, employee directory export/import dry-run.

CREATE TABLE IF NOT EXISTS public.hr_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger_kind TEXT NOT NULL
    CHECK (trigger_kind IN (
      'document_expiry_reminder',
      'pending_approval_digest',
      'payroll_handoff_digest'
    )),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT
    CHECK (last_run_status IS NULL OR last_run_status IN ('ok','error','skipped')),
  last_run_summary TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_automation_rules_code_len CHECK (char_length(trim(code)) BETWEEN 1 AND 40),
  CONSTRAINT hr_automation_rules_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 160)
);
CREATE UNIQUE INDEX IF NOT EXISTS hr_automation_rules_company_code_uidx
  ON public.hr_automation_rules (company_id, lower(code));
CREATE INDEX IF NOT EXISTS hr_automation_rules_company_enabled_idx
  ON public.hr_automation_rules (company_id, is_enabled, trigger_kind);

CREATE TABLE IF NOT EXISTS public.hr_automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.hr_automation_rules(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ok','error','skipped')),
  summary TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS hr_automation_runs_company_started_idx
  ON public.hr_automation_runs (company_id, started_at DESC);

ALTER TABLE public.hr_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_automation_runs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['hr_automation_rules','hr_automation_runs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "HR viewers can read %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "HR viewers can read %s" ON public.%I FOR SELECT TO authenticated USING (
        public.is_company_member(company_id)
        AND (
          public.has_company_permission(company_id, ''hr.view'')
          OR public.has_company_permission(company_id, ''hr.settings.edit'')
          OR public.has_company_permission(company_id, ''hr.approvals.manage'')
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

CREATE OR REPLACE FUNCTION private.hr_seed_automation_defaults(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.hr_automation_rules (company_id, code, name, trigger_kind, is_enabled, config)
  VALUES
    (_company_id, 'DOC-EXPIRY', 'Document expiry reminders', 'document_expiry_reminder', true,
      '{"daysAhead":30}'::jsonb),
    (_company_id, 'APPROVALS', 'Pending approval digest', 'pending_approval_digest', true,
      '{}'::jsonb),
    (_company_id, 'PAY-HANDOFF', 'Payroll handoff digest', 'payroll_handoff_digest', true,
      '{}'::jsonb)
  ON CONFLICT DO NOTHING;
  -- unique is on (company_id, lower(code)) — ON CONFLICT needs constraint name
EXCEPTION WHEN unique_violation THEN
  NULL;
END;
$$;

-- Fix seed to use proper conflict target
CREATE OR REPLACE FUNCTION private.hr_seed_automation_defaults(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.hr_automation_rules (company_id, code, name, trigger_kind, is_enabled, config)
  SELECT _company_id, v.code, v.name, v.trigger_kind, true, v.config
  FROM (VALUES
    ('DOC-EXPIRY', 'Document expiry reminders', 'document_expiry_reminder', '{"daysAhead":30}'::jsonb),
    ('APPROVALS', 'Pending approval digest', 'pending_approval_digest', '{}'::jsonb),
    ('PAY-HANDOFF', 'Payroll handoff digest', 'payroll_handoff_digest', '{}'::jsonb)
  ) AS v(code, name, trigger_kind, config)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.hr_automation_rules r
    WHERE r.company_id = _company_id AND lower(r.code) = lower(v.code)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_hr_automation_rules(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT (
    public.has_company_permission(_company_id, 'hr.settings.edit')
    OR public.has_company_permission(_company_id, 'hr.approvals.manage')
  ) THEN
    PERFORM private.hr_require_permission(_company_id, 'hr.settings.edit');
  END IF;
  PERFORM private.hr_seed_automation_defaults(_company_id);
  RETURN jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'code', r.code, 'name', r.name, 'triggerKind', r.trigger_kind,
        'isEnabled', r.is_enabled, 'config', r.config,
        'lastRunAt', r.last_run_at, 'lastRunStatus', r.last_run_status,
        'lastRunSummary', r.last_run_summary, 'updatedAt', r.updated_at
      ) ORDER BY r.code)
      FROM public.hr_automation_rules r WHERE r.company_id = _company_id
    ), '[]'::jsonb),
    'runs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', x.id, 'ruleId', x.rule_id, 'status', x.status,
        'summary', x.summary, 'startedAt', x.started_at, 'finishedAt', x.finished_at
      ) ORDER BY x.started_at DESC)
      FROM (
        SELECT * FROM public.hr_automation_runs
        WHERE company_id = _company_id
        ORDER BY started_at DESC LIMIT 20
      ) x
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hr_automation_rule(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id','')::UUID;
  _code TEXT := NULLIF(trim(_payload->>'code'),'');
  _name TEXT := NULLIF(trim(_payload->>'name'),'');
  _kind TEXT := NULLIF(_payload->>'triggerKind','');
  _row public.hr_automation_rules%ROWTYPE;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.settings.edit');
  PERFORM private.hr_require_enabled(_company_id);
  IF _code IS NULL OR _name IS NULL OR _kind IS NULL THEN
    RAISE EXCEPTION 'Code, name and trigger kind are required';
  END IF;
  IF _kind NOT IN ('document_expiry_reminder','pending_approval_digest','payroll_handoff_digest') THEN
    RAISE EXCEPTION 'Invalid trigger kind';
  END IF;
  IF _id IS NULL THEN
    INSERT INTO public.hr_automation_rules (
      company_id, code, name, trigger_kind, is_enabled, config, created_by
    ) VALUES (
      _company_id, _code, _name, _kind,
      COALESCE((_payload->>'isEnabled')::BOOLEAN, true),
      COALESCE(_payload->'config', '{}'::jsonb),
      auth.uid()
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.hr_automation_rules SET
      code = _code, name = _name, trigger_kind = _kind,
      is_enabled = COALESCE((_payload->>'isEnabled')::BOOLEAN, is_enabled),
      config = COALESCE(_payload->'config', config),
      version = version + 1, updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
  END IF;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Automation rule not found'; END IF;
  RETURN jsonb_build_object(
    'id', _row.id, 'code', _row.code, 'isEnabled', _row.is_enabled, 'triggerKind', _row.trigger_kind
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.run_hr_automations(_company_id UUID, _rule_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _rule public.hr_automation_rules%ROWTYPE;
  _count INTEGER;
  _summary TEXT;
  _status TEXT;
  _ran INTEGER := 0;
  _uid UUID := auth.uid();
  _member RECORD;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.settings.edit');
  PERFORM private.hr_require_enabled(_company_id);
  PERFORM private.hr_seed_automation_defaults(_company_id);

  FOR _rule IN
    SELECT * FROM public.hr_automation_rules
    WHERE company_id = _company_id
      AND is_enabled
      AND (_rule_id IS NULL OR id = _rule_id)
  LOOP
    _status := 'ok';
    _count := 0;
    BEGIN
      IF _rule.trigger_kind = 'document_expiry_reminder' THEN
        SELECT count(*)::INTEGER INTO _count FROM public.hr_employee_documents d
        WHERE d.company_id = _company_id AND d.status = 'active'
          AND d.expires_on IS NOT NULL
          AND d.expires_on BETWEEN CURRENT_DATE AND (
            CURRENT_DATE + make_interval(days => COALESCE((_rule.config->>'daysAhead')::INTEGER, 30))
          );
        _summary := format('Document expiry watch: %s document(s) in window', _count);
      ELSIF _rule.trigger_kind = 'pending_approval_digest' THEN
        SELECT (
          COALESCE((SELECT count(*) FROM public.hr_leave_requests r WHERE r.company_id=_company_id AND r.status='submitted'),0)
          + COALESCE((SELECT count(*) FROM public.hr_attendance_corrections c WHERE c.company_id=_company_id AND c.status='submitted'),0)
        )::INTEGER INTO _count;
        _summary := format('Pending approvals digest: %s item(s)', _count);
      ELSIF _rule.trigger_kind = 'payroll_handoff_digest' THEN
        SELECT (
          COALESCE((SELECT count(*) FROM public.hr_compensation_changes c
            WHERE c.company_id=_company_id AND c.status='approved' AND c.payroll_applied_at IS NULL),0)
          + COALESCE((SELECT count(*) FROM public.hr_offboarding_cases o
            JOIN public.payroll_employees e ON e.id=o.employee_id
            WHERE o.company_id=_company_id AND o.ready_for_payroll AND o.payroll_applied_at IS NULL AND e.status='active'),0)
        )::INTEGER INTO _count;
        _summary := format('Payroll handoff digest: %s item(s)', _count);
      ELSE
        _status := 'skipped';
        _summary := 'Unknown trigger';
      END IF;

      -- Fan out Action Center refresh for active members (idempotent sync)
      FOR _member IN
        SELECT m.user_id FROM public.company_members m
        WHERE m.company_id = _company_id AND m.status = 'active'
      LOOP
        PERFORM private.sync_hr_action_notifications(_company_id, _member.user_id);
      END LOOP;

      INSERT INTO public.hr_automation_runs (
        company_id, rule_id, status, summary, detail, created_by
      ) VALUES (
        _company_id, _rule.id, _status, _summary,
        jsonb_build_object('count', _count, 'triggerKind', _rule.trigger_kind),
        _uid
      );
      UPDATE public.hr_automation_rules SET
        last_run_at = now(), last_run_status = _status, last_run_summary = _summary, updated_at = now()
      WHERE id = _rule.id;
      _ran := _ran + 1;
    EXCEPTION WHEN OTHERS THEN
      _status := 'error';
      _summary := left(SQLERRM, 400);
      INSERT INTO public.hr_automation_runs (
        company_id, rule_id, status, summary, detail, created_by
      ) VALUES (
        _company_id, _rule.id, _status, _summary,
        jsonb_build_object('sqlstate', SQLSTATE), _uid
      );
      UPDATE public.hr_automation_rules SET
        last_run_at = now(), last_run_status = _status, last_run_summary = _summary, updated_at = now()
      WHERE id = _rule.id;
    END;
  END LOOP;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_automation', NULL, 'run',
    format('Ran %s HR automation rule(s)', _ran),
    jsonb_build_object('ran', _ran, 'ruleId', _rule_id)
  );
  RETURN public.list_hr_automation_rules(_company_id);
END;
$$;

-- Reports
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

CREATE OR REPLACE FUNCTION public.export_hr_employee_directory(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT (
    public.has_company_permission(_company_id, 'hr.reports.view')
    OR public.has_company_permission(_company_id, 'hr.employees.manage')
    OR public.has_company_permission(_company_id, 'hr.view')
  ) THEN
    RAISE EXCEPTION 'Missing permission for HR export';
  END IF;
  RETURN jsonb_build_object(
    'generatedAt', now(),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'employeeNumber', e.employee_number,
        'firstName', e.first_name,
        'lastName', e.last_name,
        'email', e.email,
        'status', e.status,
        'hireDate', e.hire_date,
        'terminationDate', e.termination_date,
        'department', coalesce(d.name, e.department),
        'designation', coalesce(des.name, e.designation),
        'location', coalesce(loc.name, e.work_location),
        'managerEmployeeNumber', m.employee_number,
        'workArrangement', p.work_arrangement
      ) ORDER BY e.employee_number)
      FROM public.payroll_employees e
      LEFT JOIN public.hr_employee_profiles p ON p.employee_id = e.id
      LEFT JOIN public.hr_departments d ON d.id = p.department_id
      LEFT JOIN public.hr_designations des ON des.id = p.designation_id
      LEFT JOIN public.hr_locations loc ON loc.id = p.location_id
      LEFT JOIN public.payroll_employees m ON m.id = p.manager_employee_id
      WHERE e.company_id = _company_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_hr_employee_import(
  _company_id UUID,
  _rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _item JSONB;
  _ok INTEGER := 0;
  _warn INTEGER := 0;
  _err INTEGER := 0;
  _issues JSONB := '[]'::jsonb;
  _number TEXT;
  _idx INTEGER := 0;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.employees.manage');
  IF jsonb_typeof(_rows) <> 'array' THEN
    RAISE EXCEPTION 'rows must be a JSON array';
  END IF;
  FOR _item IN SELECT * FROM jsonb_array_elements(_rows)
  LOOP
    _idx := _idx + 1;
    _number := NULLIF(trim(_item->>'employeeNumber'), '');
    IF _number IS NULL OR NULLIF(trim(_item->>'firstName'),'') IS NULL OR NULLIF(trim(_item->>'lastName'),'') IS NULL THEN
      _err := _err + 1;
      _issues := _issues || jsonb_build_array(jsonb_build_object(
        'row', _idx, 'level', 'error', 'message', 'employeeNumber, firstName and lastName are required'
      ));
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.payroll_employees e
      WHERE e.company_id = _company_id AND lower(e.employee_number) = lower(_number)
    ) THEN
      _warn := _warn + 1;
      _issues := _issues || jsonb_build_array(jsonb_build_object(
        'row', _idx, 'level', 'warning', 'message', format('Employee %s already exists — import would update via Payroll, not create a second master', _number)
      ));
    ELSE
      _ok := _ok + 1;
      _issues := _issues || jsonb_build_array(jsonb_build_object(
        'row', _idx, 'level', 'info', 'message', format('New employee %s would be created in Payroll (shared identity)', _number)
      ));
    END IF;
  END LOOP;
  RETURN jsonb_build_object(
    'dryRun', true,
    'accepted', _ok,
    'warnings', _warn,
    'errors', _err,
    'issues', _issues,
    'note', 'Dry-run only. Creating/updating employees remains Payroll-owned (shared identity).'
  );
END;
$$;


CREATE OR REPLACE FUNCTION private.run_hr_automations_system(_company_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _rule public.hr_automation_rules%ROWTYPE;
  _count INTEGER;
  _summary TEXT;
  _status TEXT;
  _ran INTEGER := 0;
  _member RECORD;
BEGIN
  PERFORM private.hr_seed_automation_defaults(_company_id);
  FOR _rule IN
    SELECT * FROM public.hr_automation_rules
    WHERE company_id = _company_id AND is_enabled
  LOOP
    _status := 'ok';
    _count := 0;
    BEGIN
      IF _rule.trigger_kind = 'document_expiry_reminder' THEN
        SELECT count(*)::INTEGER INTO _count FROM public.hr_employee_documents d
        WHERE d.company_id = _company_id AND d.status = 'active'
          AND d.expires_on IS NOT NULL
          AND d.expires_on BETWEEN CURRENT_DATE AND (
            CURRENT_DATE + make_interval(days => COALESCE((_rule.config->>'daysAhead')::INTEGER, 30))
          );
        _summary := format('Document expiry watch: %s document(s) in window', _count);
      ELSIF _rule.trigger_kind = 'pending_approval_digest' THEN
        SELECT (
          COALESCE((SELECT count(*) FROM public.hr_leave_requests r WHERE r.company_id=_company_id AND r.status='submitted'),0)
          + COALESCE((SELECT count(*) FROM public.hr_attendance_corrections c WHERE c.company_id=_company_id AND c.status='submitted'),0)
        )::INTEGER INTO _count;
        _summary := format('Pending approvals digest: %s item(s)', _count);
      ELSIF _rule.trigger_kind = 'payroll_handoff_digest' THEN
        SELECT (
          COALESCE((SELECT count(*) FROM public.hr_compensation_changes c
            WHERE c.company_id=_company_id AND c.status='approved' AND c.payroll_applied_at IS NULL),0)
          + COALESCE((SELECT count(*) FROM public.hr_offboarding_cases o
            JOIN public.payroll_employees e ON e.id=o.employee_id
            WHERE o.company_id=_company_id AND o.ready_for_payroll AND o.payroll_applied_at IS NULL AND e.status='active'),0)
        )::INTEGER INTO _count;
        _summary := format('Payroll handoff digest: %s item(s)', _count);
      ELSE
        _status := 'skipped';
        _summary := 'Unknown trigger';
      END IF;

      FOR _member IN
        SELECT m.user_id FROM public.company_members m
        WHERE m.company_id = _company_id AND m.status = 'active'
      LOOP
        PERFORM private.sync_hr_action_notifications(_company_id, _member.user_id);
      END LOOP;

      INSERT INTO public.hr_automation_runs (company_id, rule_id, status, summary, detail)
      VALUES (_company_id, _rule.id, _status, _summary,
        jsonb_build_object('count', _count, 'triggerKind', _rule.trigger_kind, 'source', 'system'));
      UPDATE public.hr_automation_rules SET
        last_run_at = now(), last_run_status = _status, last_run_summary = _summary, updated_at = now()
      WHERE id = _rule.id;
      _ran := _ran + 1;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.hr_automation_runs (company_id, rule_id, status, summary, detail)
      VALUES (_company_id, _rule.id, 'error', left(SQLERRM, 400), jsonb_build_object('sqlstate', SQLSTATE, 'source', 'system'));
      UPDATE public.hr_automation_rules SET
        last_run_at = now(), last_run_status = 'error', last_run_summary = left(SQLERRM, 400), updated_at = now()
      WHERE id = _rule.id;
    END;
  END LOOP;
  RETURN _ran;
END;
$$;

REVOKE ALL ON FUNCTION private.run_hr_automations_system(UUID) FROM PUBLIC, anon, authenticated;

-- Optional daily cron (best-effort)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule(j.jobid) FROM cron.job j WHERE j.jobname = 'linkbooks-hr-automations-daily';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule(
      'linkbooks-hr-automations-daily',
      '15 6 * * *',
      $job$
      SELECT private.run_hr_automations_system(c.id)
      FROM public.companies c
      JOIN public.hr_settings s ON s.company_id = c.id AND s.enabled IS TRUE
      $job$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'HR automation cron not scheduled: %', SQLERRM;
END $$;

REVOKE ALL ON FUNCTION public.list_hr_automation_rules(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_hr_automation_rule(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.run_hr_automations(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.run_hr_report(UUID, TEXT, DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.export_hr_employee_directory(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.preview_hr_employee_import(UUID, JSONB) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_hr_automation_rules(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hr_automation_rule(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_hr_automations(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_hr_report(UUID, TEXT, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_hr_employee_directory(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_hr_employee_import(UUID, JSONB) TO authenticated;