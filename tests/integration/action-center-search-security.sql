-- Read-only Action Center security smoke test.
-- Run with an administrative staging SQL connection and ON_ERROR_STOP=1.
-- No financial objects, user data, or notification state are written.
-- Does NOT replace real authenticated two-user/two-tenant RLS tests.
BEGIN READ ONLY;
DO $schema$
DECLARE
  definition text;
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_catalog.pg_class c
    WHERE c.oid='public.action_notifications'::regclass)
  THEN RAISE EXCEPTION 'Action Center table RLS not enabled'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    WHERE c.oid='public.action_notification_inbox'::regclass
    AND 'security_invoker=true' = ANY(c.reloptions)
  ) THEN RAISE EXCEPTION 'Action Center view bypasses invoker RLS'; END IF;

  IF pg_catalog.has_table_privilege('anon','public.action_notification_inbox','SELECT')
     OR pg_catalog.has_function_privilege(
       'anon','public.action_notification_workload(uuid)','EXECUTE')
     OR pg_catalog.has_function_privilege(
       'anon','public.set_action_notification_state(uuid,boolean,boolean)','EXECUTE')
  THEN RAISE EXCEPTION 'Action Center grants permit anonymous access'; END IF;

  IF NOT pg_catalog.has_table_privilege('authenticated','public.action_notification_inbox','SELECT')
     OR NOT pg_catalog.has_function_privilege(
       'authenticated','public.action_notification_workload(uuid)','EXECUTE')
     OR NOT pg_catalog.has_function_privilege(
       'authenticated','public.set_action_notification_state(uuid,boolean,boolean)','EXECUTE')
  THEN RAISE EXCEPTION 'Authenticated notification access is unexpectedly revoked'; END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.set_action_notification_state(uuid,boolean,boolean)'::regprocedure)
  INTO definition;
  -- This existing SECURITY DEFINER function must explicitly check ownership,
  -- current membership, category permissions, preferences and authentication.
  IF definition !~* 'recipient_user_id\s*=\s*auth\.uid\(\)'
     OR definition NOT LIKE '%can_read_action_notification%'
     OR definition NOT LIKE '%action_notification_preferences%'
     OR definition NOT LIKE '%Authentication required%'
  THEN RAISE EXCEPTION 'Notification state RPC is missing a required authorization guard'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_indexes
    WHERE schemaname='public' AND tablename='action_notifications'
    AND indexname='action_notifications_search_trgm_idx'
    AND indexdef ILIKE '%USING gin%'
  ) THEN RAISE EXCEPTION 'Action Center GIN search index missing'; END IF;
END
$schema$;

-- The authenticated DB role without an auth.uid() claim is NOT a user.
-- Both the invoker view and privileged state RPC must reject this session.
SET LOCAL ROLE authenticated;
DO $no_identity$
DECLARE
  rows_visible bigint;
  was_denied boolean := false;
BEGIN
  SELECT count(*) INTO rows_visible FROM public.action_notification_inbox;
  IF rows_visible <> 0 THEN
    RAISE EXCEPTION 'No-auth session exposed % notifications',rows_visible;
  END IF;

  BEGIN
    PERFORM public.set_action_notification_state(
      '00000000-0000-0000-0000-000000000000'::uuid,true,true);
  EXCEPTION WHEN OTHERS THEN
    was_denied := true;
  END;
  IF NOT was_denied THEN
    RAISE EXCEPTION 'Notification-state RPC accepted a session without a user';
  END IF;
END
$no_identity$;
ROLLBACK;
