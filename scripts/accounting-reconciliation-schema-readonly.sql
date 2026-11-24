-- StreakBooks Accounting reconciliation schema proof — READ ONLY.
-- Run on a DEDICATED STAGING database after applying Batches 4 and 5.
-- It makes no changes; an object existing does NOT prove authenticated RLS.
-- Do not use this as approval for production release.

select
  current_database() as connected_database,
  to_regclass('public.reconciliation_review_cases')::text as review_cases,
  to_regclass('public.reconciliation_review_events')::text as review_events,
  to_regprocedure(
    'public.save_reconciliation_review_case(uuid,text,text,text,text,text,text,text,uuid,uuid,text,text,integer)'
  )::text as review_case_rpc,
  to_regprocedure(
    'public.progress_reconciliation_review_case(uuid,uuid,text,integer,text,text)'
  )::text as independent_review_rpc;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_can_select,
  has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_can_insert_directly,
  has_table_privilege('authenticated', c.oid, 'UPDATE') as authenticated_can_update_directly,
  has_table_privilege('authenticated', c.oid, 'DELETE') as authenticated_can_delete_directly,
  has_table_privilege('anon', c.oid, 'SELECT') as anonymous_can_select
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'reconciliation_review_cases', 'reconciliation_review_events'
  )
order by c.relname;

select
  tablename, policyname, roles, cmd, permissive, qual
from pg_catalog.pg_policies
where schemaname='public'
  and tablename in (
    'reconciliation_review_cases', 'reconciliation_review_events'
  )
order by tablename, policyname;

select
  p.proname, p.prosecdef as security_definer,
  p.proconfig as function_settings,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_executes,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous_executes
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'save_reconciliation_review_case', 'progress_reconciliation_review_case'
  )
order by p.proname;

select version, name
from supabase_migrations.schema_migrations
where version in ('20261106233000','20261106234500')
order by version;

-- Manual acceptance still required with genuine authenticated session roles:
-- 1. Deny reads from unrelated organisations and members without accounting.view
-- 2. Deny writes to direct client tables, disabled MFA, and accounting.post denial
-- 3. Reject source/journal cross-tenant IDs, stale versions, inactive assignees
-- 4. Reject self-signoff by the creator, submitter or unassigned actor
-- 5. Confirm the old Batch-4 RPC cannot bypass submitted/reviewed stage guards
-- 6. Confirm every stage transition appends an event and no journal is changed
