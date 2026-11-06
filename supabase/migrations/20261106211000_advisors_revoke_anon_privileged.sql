-- AD-10 follow-up: privileged Advisors RPCs must not be executable by anon.
-- Linked project ACLs had explicit anon=X grants (not PUBLIC) on platform/portal RPCs.
-- Public catalogue/chat/booking/proposal/agreement surfaces keep anon execute.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        p.proname LIKE 'platform_advisors_%'
        OR p.proname LIKE 'advisors_portal_%'
        OR p.proname IN (
          'advisors_claim_due_reminders',
          'advisors_mark_reminder_status',
          'advisors_reclaim_stale_reminders'
        )
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;
