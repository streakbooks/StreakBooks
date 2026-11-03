-- Disable execution and new mutations while retaining jobs, attempts, observations and audit.
DO $$ DECLARE j record; BEGIN
 PERFORM pg_advisory_xact_lock(483925016);
 UPDATE private.platform_worker_state SET enabled=false WHERE singleton;
 IF to_regclass('cron.job') IS NOT NULL THEN
  FOR j IN EXECUTE 'SELECT jobid FROM cron.job WHERE jobname=''linkbooks-platform-operations''' LOOP PERFORM cron.unschedule(j.jobid); END LOOP;
 END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_automation_action(text,jsonb,text,uuid),private.platform_automation_action(text,jsonb,text,uuid) FROM authenticated;
NOTIFY pgrst,'reload schema';
