-- Read-only Action Center schema/RLS regression checks.
-- Run against a disposable or dedicated staging database, not as a data migration.
-- This does not impersonate real authenticated users or replace two-user RLS fixtures.
BEGIN;
DO $checks$
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_catalog.pg_class c
          WHERE c.oid = 'public.action_notifications'::regclass) THEN
    RAISE EXCEPTION 'Action notifications table must have RLS enabled';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    WHERE c.oid = 'public.action_notification_inbox'::regclass
      AND 'security_invoker=true' = ANY(c.reloptions)
  ) THEN
    RAISE EXCEPTION 'Action inbox view must run as security invoker';
  END IF;
  IF pg_catalog.has_table_privilege('anon','public.action_notification_inbox','SELECT') THEN
    RAISE EXCEPTION 'Anonymous role must not select inbox';
  END IF;
  IF pg_catalog.has_function_privilege(
    'anon', 'public.action_notification_workload(uuid)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Anonymous role must not execute workload function';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_indexes
    WHERE schemaname='public' AND tablename='action_notifications'
      AND indexname='action_notifications_search_trgm_idx'
      AND indexdef ILIKE '%USING gin%'
  ) THEN
    RAISE EXCEPTION 'Action Center text search GIN index missing';
  END IF;
END
$checks$;
SET LOCAL ROLE authenticated;
DO $deny$
DECLARE visible_rows bigint;
BEGIN
  -- With no auth.uid() session claim, the invoker view must expose nothing.
  SELECT count(*) INTO visible_rows FROM public.action_notification_inbox;
  IF visible_rows <> 0 THEN
    RAISE EXCEPTION 'Unauthenticated action view exposed % rows', visible_rows;
  END IF;
END
$deny$;
ROLLBACK;
