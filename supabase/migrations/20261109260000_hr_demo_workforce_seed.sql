-- HR demo workforce seed (is_demo companies only). Idempotent.
-- Does not change accounting/reporting engines; only HR org + profiles for sample UX.

CREATE OR REPLACE FUNCTION private.hr_seed_demo_workforce(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _is_demo BOOLEAN := false;
  _loc UUID;
  _dept RECORD;
  _des RECORD;
  _emp RECORD;
  _mgr UUID;
  _dept_id UUID;
  _des_id UUID;
  _cal UUID;
  _profiles INTEGER := 0;
  _code TEXT;
BEGIN
  SELECT COALESCE(is_demo, false) INTO _is_demo
  FROM public.companies WHERE id = _company_id;
  IF NOT _is_demo THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_demo');
  END IF;

  PERFORM private.hr_seed_defaults(_company_id);
  UPDATE public.hr_settings SET enabled = true, updated_at = now()
  WHERE company_id = _company_id AND enabled IS DISTINCT FROM true;

  -- Location
  SELECT id INTO _loc FROM public.hr_locations
  WHERE company_id = _company_id AND lower(code) = 'lon' LIMIT 1;
  IF _loc IS NULL THEN
    INSERT INTO public.hr_locations (company_id, code, name, timezone, is_active, sort_order)
    VALUES (_company_id, 'LON', 'London', 'Europe/London', true, 10)
    RETURNING id INTO _loc;
  END IF;

  -- Departments from payroll strings
  FOR _dept IN
    SELECT DISTINCT NULLIF(trim(e.department), '') AS name
    FROM public.payroll_employees e
    WHERE e.company_id = _company_id AND NULLIF(trim(e.department), '') IS NOT NULL
  LOOP
    _code := upper(left(regexp_replace(_dept.name, '[^A-Za-z0-9]+', '', 'g'), 12));
    IF _code IS NULL OR _code = '' THEN _code := 'DEPT'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.hr_departments d
      WHERE d.company_id = _company_id AND lower(d.code) = lower(_code)
    ) AND NOT EXISTS (
      SELECT 1 FROM public.hr_departments d
      WHERE d.company_id = _company_id AND lower(d.name) = lower(_dept.name)
    ) THEN
      INSERT INTO public.hr_departments (company_id, code, name, is_active, sort_order)
      VALUES (_company_id, _code, _dept.name, true, 100);
    END IF;
  END LOOP;

  -- Designations from payroll strings
  FOR _des IN
    SELECT DISTINCT NULLIF(trim(e.designation), '') AS name
    FROM public.payroll_employees e
    WHERE e.company_id = _company_id AND NULLIF(trim(e.designation), '') IS NOT NULL
  LOOP
    _code := upper(left(regexp_replace(_des.name, '[^A-Za-z0-9]+', '', 'g'), 12));
    IF _code IS NULL OR _code = '' THEN _code := 'ROLE'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.hr_designations d
      WHERE d.company_id = _company_id AND lower(d.code) = lower(_code)
    ) AND NOT EXISTS (
      SELECT 1 FROM public.hr_designations d
      WHERE d.company_id = _company_id AND lower(d.name) = lower(_des.name)
    ) THEN
      INSERT INTO public.hr_designations (company_id, code, name, is_active, sort_order)
      VALUES (_company_id, _code, _des.name, true, 100);
    END IF;
  END LOOP;

  -- Prefer Operations Lead / first active as default manager
  SELECT e.id INTO _mgr
  FROM public.payroll_employees e
  WHERE e.company_id = _company_id AND e.status = 'active'
  ORDER BY CASE WHEN e.designation ILIKE '%lead%' OR e.designation ILIKE '%manager%' THEN 0 ELSE 1 END,
           e.employee_number
  LIMIT 1;

  FOR _emp IN
    SELECT e.* FROM public.payroll_employees e
    WHERE e.company_id = _company_id
    ORDER BY e.employee_number
  LOOP
    SELECT d.id INTO _dept_id FROM public.hr_departments d
    WHERE d.company_id = _company_id
      AND (
        lower(d.name) = lower(coalesce(_emp.department, ''))
        OR lower(d.code) = lower(left(regexp_replace(coalesce(_emp.department,''), '[^A-Za-z0-9]+', '', 'g'), 12))
      )
    LIMIT 1;

    SELECT d.id INTO _des_id FROM public.hr_designations d
    WHERE d.company_id = _company_id
      AND (
        lower(d.name) = lower(coalesce(_emp.designation, ''))
        OR lower(d.code) = lower(left(regexp_replace(coalesce(_emp.designation,''), '[^A-Za-z0-9]+', '', 'g'), 12))
      )
    LIMIT 1;

    INSERT INTO public.hr_employee_profiles (
      employee_id, company_id, manager_employee_id, department_id, designation_id,
      location_id, work_arrangement, updated_by
    ) VALUES (
      _emp.id, _company_id,
      CASE WHEN _mgr IS DISTINCT FROM _emp.id THEN _mgr ELSE NULL END,
      _dept_id, _des_id, _loc, 'onsite', NULL
    )
    ON CONFLICT (employee_id) DO UPDATE SET
      department_id = COALESCE(public.hr_employee_profiles.department_id, EXCLUDED.department_id),
      designation_id = COALESCE(public.hr_employee_profiles.designation_id, EXCLUDED.designation_id),
      location_id = COALESCE(public.hr_employee_profiles.location_id, EXCLUDED.location_id),
      manager_employee_id = COALESCE(public.hr_employee_profiles.manager_employee_id, EXCLUDED.manager_employee_id),
      updated_at = now();

    _profiles := _profiles + 1;

    -- Position history open row if none
    IF NOT EXISTS (
      SELECT 1 FROM public.hr_position_history h
      WHERE h.company_id = _company_id AND h.employee_id = _emp.id AND h.effective_to IS NULL
    ) THEN
      INSERT INTO public.hr_position_history (
        company_id, employee_id, effective_from, change_type,
        department_id, designation_id, location_id, manager_employee_id, work_arrangement, reason
      ) VALUES (
        _company_id, _emp.id, COALESCE(_emp.hire_date, CURRENT_DATE), 'hire',
        _dept_id, _des_id, _loc,
        CASE WHEN _mgr IS DISTINCT FROM _emp.id THEN _mgr ELSE NULL END,
        'onsite', 'Demo HR seed'
      );
    END IF;
  END LOOP;

  -- Leave type
  IF to_regclass('public.hr_leave_types') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.hr_leave_types t WHERE t.company_id = _company_id AND lower(t.code) = 'al') THEN
      INSERT INTO public.hr_leave_types (
        company_id, code, name, is_paid, accrual_method, annual_allowance_days, is_active, sort_order
      ) VALUES (
        _company_id, 'AL', 'Annual Leave', true, 'annual', 25, true, 10
      );
    END IF;
  END IF;

  -- Holiday calendar
  IF to_regclass('public.hr_holiday_calendars') IS NOT NULL THEN
    SELECT id INTO _cal FROM public.hr_holiday_calendars
    WHERE company_id = _company_id AND lower(code) = 'uk' LIMIT 1;
    IF _cal IS NULL THEN
      INSERT INTO public.hr_holiday_calendars (company_id, code, name, location_id, is_default, is_active)
      VALUES (_company_id, 'UK', 'United Kingdom', _loc, true, true)
      RETURNING id INTO _cal;
    END IF;
    IF to_regclass('public.hr_holidays') IS NOT NULL AND _cal IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.hr_holidays h
        WHERE h.company_id = _company_id AND h.calendar_id = _cal AND h.holiday_date = DATE '2026-01-01'
      ) THEN
        INSERT INTO public.hr_holidays (company_id, calendar_id, holiday_date, name, is_optional)
        VALUES (_company_id, _cal, '2026-01-01', 'New Year''s Day', false);
      END IF;
    END IF;
  END IF;

  -- Asset type sample
  IF to_regclass('public.hr_asset_types') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.hr_asset_types a WHERE a.company_id = _company_id AND lower(a.code) = 'laptop') THEN
      INSERT INTO public.hr_asset_types (company_id, code, name, is_active, sort_order)
      VALUES (_company_id, 'LAPTOP', 'Laptop', true, 10);
    END IF;
  END IF;

  PERFORM private.hr_seed_automation_defaults(_company_id);

  RETURN jsonb_build_object(
    'skipped', false,
    'profilesUpserted', _profiles,
    'locationId', _loc,
    'managerEmployeeId', _mgr
  );
END;
$$;

REVOKE ALL ON FUNCTION private.hr_seed_demo_workforce(UUID) FROM PUBLIC, anon, authenticated;

-- Apply to all current demo companies
DO $$
DECLARE
  c RECORD;
  result JSONB;
BEGIN
  FOR c IN SELECT id, name FROM public.companies WHERE is_demo IS TRUE LOOP
    result := private.hr_seed_demo_workforce(c.id);
    RAISE NOTICE 'HR demo seed % => %', c.name, result;
  END LOOP;
END $$;

-- Optional: callable by owners for demo reset tooling (still demo-gated inside)
CREATE OR REPLACE FUNCTION public.seed_hr_demo_workforce(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'hr.settings.edit') THEN
    RAISE EXCEPTION 'Missing permission: hr.settings.edit';
  END IF;
  RETURN private.hr_seed_demo_workforce(_company_id);
END;
$$;

REVOKE ALL ON FUNCTION public.seed_hr_demo_workforce(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_hr_demo_workforce(UUID) TO authenticated;