-- HR foundation security smoke (run only on isolated Postgres with LinkBooks migrations).
-- Does not target production.

DO $$
BEGIN
  IF to_regclass('public.hr_settings') IS NULL THEN
    RAISE EXCEPTION 'hr_settings missing — apply 20261109190000_hr_management_foundation';
  END IF;
  IF to_regclass('public.hr_employee_profiles') IS NULL THEN
    RAISE EXCEPTION 'hr_employee_profiles missing';
  END IF;
  IF to_regprocedure('public.get_hr_settings(uuid)') IS NULL THEN
    RAISE EXCEPTION 'get_hr_settings missing';
  END IF;
END $$;

SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'hr_settings',
    'hr_locations',
    'hr_branches',
    'hr_departments',
    'hr_designations',
    'hr_employee_profiles',
    'hr_position_history',
    'hr_audit_events'
  )
ORDER BY 1;

SELECT role, permission
FROM public.role_permissions
WHERE permission LIKE 'hr.%'
ORDER BY 1, 2;
