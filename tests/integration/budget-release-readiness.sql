-- LinkBooks Budgets release gate (READ ONLY).
-- Run AFTER applying the six pending Budgets migrations to a disposable/staging DB.
-- All statements inspect PostgreSQL catalogs only; no business data is changed.
-- NOTE: PASS here does not replace authenticated two-tenant tests or browser QA.
-- Any is_ready = false must block production launch.

WITH required_tables(table_name) AS (
  VALUES
    ('budgets'),
    ('budget_lines'),
    ('budget_governance'),
    ('budget_revisions'),
    ('budget_approval_state'),
    ('budget_approval_events'),
    ('budget_dimension_lines'),
    ('budget_dimension_revisions'),
    ('budget_forecast_scenarios'),
    ('budget_forecast_scenario_events')
),
table_checks AS (
  SELECT
    'TABLE'::text AS check_type,
    'public.' || t.table_name AS object_name,
    c.oid IS NOT NULL AS installed,
    COALESCE(c.relrowsecurity, FALSE) AS rls_enabled,
    CASE WHEN c.oid IS NOT NULL THEN
      has_table_privilege('authenticated',c.oid,'SELECT')
    ELSE FALSE END AS authenticated_can_read,
    CASE WHEN c.oid IS NOT NULL THEN
      NOT (
        has_table_privilege('authenticated',c.oid,'INSERT') OR
        has_table_privilege('authenticated',c.oid,'UPDATE') OR
        has_table_privilege('authenticated',c.oid,'DELETE') OR
        has_table_privilege('anon',c.oid,'INSERT') OR
        has_table_privilege('anon',c.oid,'UPDATE') OR
        has_table_privilege('anon',c.oid,'DELETE')
      )
    ELSE FALSE END AS direct_write_blocked,
    NULL::boolean AS authenticated_can_execute
  FROM required_tables t
  LEFT JOIN pg_namespace n ON n.nspname = 'public'
  LEFT JOIN pg_class c
    ON c.relnamespace = n.oid AND c.relname = t.table_name
),
required_functions(signature) AS (
  VALUES
    ('public.save_budget(uuid,uuid,text,date,text)'),
    ('public.save_budget_lines(uuid,jsonb,text)'),
    ('public.delete_budget(uuid)'),
    ('public.duplicate_budget(uuid,uuid,text,date,boolean)'),
    ('public.set_budget_lock(uuid,uuid,boolean,text)'),
    ('public.save_budget_document(uuid,uuid,text,text,timestamptz,jsonb)'),
    ('public.transition_budget_approval(uuid,uuid,text,text)'),
    ('public.save_budget_dimension_category(uuid,uuid,uuid,timestamptz,jsonb)'),
    ('public.save_budget_forecast_scenario(uuid,uuid,uuid,timestamptz,text,text,integer,integer,text)'),
    ('public.delete_budget_forecast_scenario(uuid,uuid,uuid,timestamptz)')
),
function_checks AS (
  SELECT
    'FUNCTION'::text AS check_type,
    f.signature AS object_name,
    p.oid IS NOT NULL AS installed,
    NULL::boolean AS rls_enabled,
    NULL::boolean AS authenticated_can_read,
    NULL::boolean AS direct_write_blocked,
    CASE WHEN p.oid IS NOT NULL THEN
      has_function_privilege('authenticated',p.oid,'EXECUTE')
    ELSE FALSE END AS authenticated_can_execute
  FROM required_functions f
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(f.signature)::oid
),
all_checks AS (
  SELECT * FROM table_checks UNION ALL SELECT * FROM function_checks
)
SELECT
  check_type,
  object_name,
  installed,
  rls_enabled,
  authenticated_can_read,
  direct_write_blocked,
  authenticated_can_execute,
  CASE
    WHEN check_type = 'TABLE' THEN
      installed AND rls_enabled AND authenticated_can_read AND direct_write_blocked
    ELSE installed AND authenticated_can_execute
  END AS is_ready
FROM all_checks
ORDER BY check_type, object_name;
