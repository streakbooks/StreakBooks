-- HR-13 module security smoke (isolated Postgres preferred; production use read-only checks only).
\set ON_ERROR_STOP on

DO $$
DECLARE
  _missing text;
BEGIN
  SELECT string_agg(t, ', ') INTO _missing
  FROM unnest(ARRAY[
    'hr_settings','hr_employee_profiles','hr_departments','hr_locations','hr_designations',
    'hr_position_history','hr_audit_events','hr_job_requisitions','hr_applications',
    'hr_onboarding_cases','hr_attendance_logs','hr_leave_requests','hr_employee_documents',
    'hr_asset_assignments','hr_cases','hr_performance_cycles','hr_training_courses',
    'hr_compensation_changes','hr_transfer_requests','hr_offboarding_cases',
    'hr_automation_rules','hr_automation_runs'
  ]) AS t
  WHERE to_regclass('public.' || t) IS NULL;
  IF _missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing HR tables: %', _missing;
  END IF;
END $$;

-- Every HR table must have RLS enabled
DO $$
DECLARE
  _bad text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO _bad
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'hr_%'
    AND c.relrowsecurity IS NOT TRUE;
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'HR tables without RLS: %', _bad;
  END IF;
END $$;

-- anon must not execute HR domain RPCs
DO $$
DECLARE
  _bad text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO _bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname ~ '^(list|get|upsert|create|update|decide|run|export|preview)_hr_'
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'anon can execute HR RPCs: %', _bad;
  END IF;
END $$;

SELECT 'hr-module-security-ok' AS status;