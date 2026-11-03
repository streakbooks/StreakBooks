TRUNCATE private.platform_request_buckets;
SET ROLE authenticated; SELECT fixture.login(5);
SELECT fixture.denied($q$SELECT public.platform_automation_read('context')$q$,'permission');
SELECT fixture.denied($q$SELECT public.platform_automation_action('jobs.enqueue','{"kind":"check_operations"}','Tenant cannot queue',gen_random_uuid())$q$,'Platform permission');
SELECT fixture.denied($q$SELECT private.platform_worker_tick()$q$,'permission denied');
SELECT fixture.denied($q$SELECT * FROM public.platform_job_runs$q$,'permission denied');
SELECT fixture.login(1,'aal1');
SELECT fixture.denied($q$SELECT public.platform_automation_read('jobs')$q$,'permission');
SELECT fixture.login(1);
SELECT fixture.denied($q$SELECT public.platform_enqueue_job('arbitrary SQL text','No arbitrary handler')$q$,'implemented operational');
DO $$ DECLARE r jsonb; BEGIN
 r:=public.platform_automation_action('rules.save','{"name":"Incident observation fixture","metric":"open_incidents","severity":"critical","threshold":0,"quiet_start_utc":23,"quiet_end_utc":6}','Configure measured alert',gen_random_uuid());
 INSERT INTO fixture.operations VALUES('alert_rule',r);
 PERFORM public.platform_automation_action('rules.enable',jsonb_build_object('id',r->>'id','row_version',1),'Enable after review',gen_random_uuid());
 IF public.platform_automation_read('rules')->'rows'->0->>'observed' IS NOT NULL THEN RAISE EXCEPTION 'Observation fabricated before execution'; END IF;
END $$;
RESET ROLE;
UPDATE public.break_glass_grants SET expires_at=now()-interval '1 second' WHERE id='30000000-0000-4000-8000-000000000004';
UPDATE public.approval_requests SET expires_at=now()-interval '1 second' WHERE id=(SELECT approval_id FROM public.break_glass_grants WHERE id='30000000-0000-4000-8000-000000000004');
SELECT set_config('request.jwt.claims','{}',false);
SELECT private.platform_worker_tick();
DO $$ DECLARE rid uuid:=(SELECT (value->>'id')::uuid FROM fixture.operations WHERE key='alert_rule'); BEGIN
 IF (SELECT status FROM public.break_glass_grants WHERE id='30000000-0000-4000-8000-000000000004')<>'expired' THEN RAISE EXCEPTION 'System expiry handler did not execute'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.break_glass_events WHERE grant_id='30000000-0000-4000-8000-000000000004' AND action='expired' AND actor_id IS NULL) THEN RAISE EXCEPTION 'System expiry actor incorrectly attributed'; END IF;
 IF (SELECT count(*) FROM public.platform_alert_events WHERE rule_id=rid AND resolved_at IS NULL)<>1 THEN RAISE EXCEPTION 'Measured incident did not fire'; END IF;
 IF EXISTS(SELECT 1 FROM private.platform_job_schedules WHERE next_run_at<>date_trunc('minute',now())+make_interval(secs=>interval_seconds)) THEN RAISE EXCEPTION 'Minute recurrence can skip because of jitter'; END IF;
 IF (SELECT count(*) FROM public.platform_job_runs WHERE status='succeeded')<>2 THEN RAISE EXCEPTION 'Scheduled jobs did not execute'; END IF;
END $$;
SET ROLE authenticated; SELECT fixture.login(1);
SELECT public.platform_enqueue_job('check_operations','Repeat observation for dedupe');
RESET ROLE; SELECT set_config('request.jwt.claims','{}',false); SELECT private.platform_worker_tick();
DO $$ BEGIN
 IF (SELECT count(*) FROM public.platform_alert_events)<>1 OR (SELECT observations FROM public.platform_alert_events LIMIT 1)<>2 THEN RAISE EXCEPTION 'Duplicate observation created a duplicate alert'; END IF;
END $$;
UPDATE public.platform_incidents SET status='resolved';
SET ROLE authenticated; SELECT fixture.login(1);
DO $$ DECLARE ev jsonb; BEGIN
 ev:=public.platform_automation_read('events')->'rows'->0;
 PERFORM public.platform_automation_action('alerts.ack',jsonb_build_object('id',ev->>'id'),'Investigating observed incident',gen_random_uuid());
 PERFORM public.platform_enqueue_job('check_operations','Measure recovery');
END $$;
RESET ROLE; SELECT set_config('request.jwt.claims','{}',false); SELECT private.platform_worker_tick();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.platform_alert_events WHERE resolved_at IS NULL) OR NOT EXISTS(SELECT 1 FROM public.platform_alert_events WHERE acknowledged_at IS NOT NULL AND resolved_at IS NOT NULL) THEN RAISE EXCEPTION 'Recovery or acknowledgment did not retain history'; END IF;
END $$;
-- Controlled dependency fault only in this disposable database; exercise the real retry transaction.
INSERT INTO fixture.operations SELECT 'measure_definition',to_jsonb(pg_get_functiondef('private.platform_measure_metric(text)'::regprocedure));
CREATE OR REPLACE FUNCTION private.platform_measure_metric(_metric text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Injected dependency outage'; END $$;
SET ROLE authenticated; SELECT fixture.login(1);
INSERT INTO fixture.operations SELECT 'failure_job',public.platform_automation_action('jobs.enqueue','{"kind":"check_operations"}','Retry exercise',gen_random_uuid());
RESET ROLE;
UPDATE public.platform_jobs SET max_attempts=2,origin='schedule',created_by=NULL WHERE id=(SELECT (value->>'id')::uuid FROM fixture.operations WHERE key='failure_job');
SELECT set_config('request.jwt.claims','{}',false); SELECT private.platform_worker_tick();
DO $$ DECLARE j public.platform_jobs; BEGIN
 SELECT * INTO j FROM public.platform_jobs WHERE id=(SELECT (value->>'id')::uuid FROM fixture.operations WHERE key='failure_job');
 IF j.status<>'queued' OR j.attempts<>1 OR j.next_run_at<=now() OR j.last_error<>'Handler failed (P0001)' THEN RAISE EXCEPTION 'Failure/backoff not recorded'; END IF;
END $$;
SELECT private.platform_worker_tick();
DO $$ BEGIN IF (SELECT attempts FROM public.platform_jobs WHERE id=(SELECT (value->>'id')::uuid FROM fixture.operations WHERE key='failure_job'))<>1 THEN RAISE EXCEPTION 'Backoff ignored'; END IF; END $$;
UPDATE public.platform_jobs SET next_run_at=now() WHERE id=(SELECT (value->>'id')::uuid FROM fixture.operations WHERE key='failure_job');
SELECT private.platform_worker_tick();
DO $$ DECLARE j public.platform_jobs; BEGIN
 SELECT * INTO j FROM public.platform_jobs WHERE id=(SELECT (value->>'id')::uuid FROM fixture.operations WHERE key='failure_job');
 IF j.status<>'failed' OR j.attempts<>2 THEN RAISE EXCEPTION 'Dead letter limit ignored'; END IF;
 EXECUTE (SELECT value#>>'{}' FROM fixture.operations WHERE key='measure_definition');
 INSERT INTO fixture.operations VALUES('failure_current',to_jsonb(j));
END $$;
INSERT INTO fixture.operations SELECT 'dead_count',to_jsonb(count(*)) FROM public.platform_jobs WHERE kind='check_operations';
UPDATE private.platform_job_schedules SET next_run_at=now() WHERE kind='check_operations';
SELECT private.platform_worker_tick();
DO $$ BEGIN IF (SELECT count(*) FROM public.platform_jobs WHERE kind='check_operations')<>(SELECT (value#>>'{}')::bigint FROM fixture.operations WHERE key='dead_count') THEN RAISE EXCEPTION 'Scheduler reset a dead-letter retry budget'; END IF; END $$;
SET ROLE authenticated; SELECT fixture.login(1);
DO $$ DECLARE payload jsonb; request uuid:=gen_random_uuid(); a jsonb; b jsonb; BEGIN
 payload:=jsonb_build_object('id',(SELECT value->>'id' FROM fixture.operations WHERE key='failure_current'),'row_version',(SELECT value->'row_version' FROM fixture.operations WHERE key='failure_current'));
 a:=public.platform_automation_action('jobs.retry',payload,'Dependency restored; retry reviewed',request);
 b:=public.platform_automation_action('jobs.retry',payload,'Dependency restored; retry reviewed',request);
 IF a<>b THEN RAISE EXCEPTION 'Lost response retry duplicated effect'; END IF;
END $$;
RESET ROLE; SELECT set_config('request.jwt.claims','{}',false); SELECT private.platform_worker_tick();
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.platform_jobs WHERE id=(SELECT (value->>'id')::uuid FROM fixture.operations WHERE key='failure_job') AND status='succeeded' AND attempts=3) THEN RAISE EXCEPTION 'Manual recovery did not run'; END IF;
 IF (SELECT count(*) FROM public.platform_job_runs WHERE job_id=(SELECT (value->>'id')::uuid FROM fixture.operations WHERE key='failure_job'))<>3 THEN RAISE EXCEPTION 'Attempt history lost'; END IF;
END $$;
INSERT INTO public.platform_alert_rules(name,threshold,metric,enabled,created_by) VALUES('Unavailable fixture',0,NULL,true,'00000000-0000-4000-8000-000000000001');
SELECT private.platform_check_operations();
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.platform_alert_rules WHERE name='Unavailable fixture' AND state='unknown' AND observed IS NULL) OR EXISTS(SELECT 1 FROM public.platform_alert_events e JOIN public.platform_alert_rules r ON r.id=e.rule_id WHERE r.name='Unavailable fixture') THEN RAISE EXCEPTION 'Missing observation fired or became zero'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname IN ('platform_worker_tick','platform_measure_metric','platform_check_operations','platform_expire_support_jobs','platform_worker_health') AND (has_function_privilege('authenticated',p.oid,'EXECUTE') OR has_function_privilege('anon',p.oid,'EXECUTE'))) THEN RAISE EXCEPTION 'Worker direct execution leaked'; END IF;
END $$;
SET ROLE authenticated; SELECT fixture.login(3);
SELECT fixture.denied($q$SELECT public.platform_automation_read('jobs')$q$,'permission');
SELECT fixture.denied($q$SELECT public.platform_automation_action('rules.save','{}','Unauthorized configuration',gen_random_uuid())$q$,'Platform permission');
SELECT fixture.login(2);
SELECT fixture.denied($q$SELECT public.platform_automation_read('context')$q$,'permission');
RESET ROLE;

-- A planted dead-letter record checks explicit closure independently of the real retry exercise above.
INSERT INTO public.platform_jobs(name,kind,status,created_by,origin,attempts,max_attempts) VALUES('Closure fixture','check_operations','failed','00000000-0000-4000-8000-000000000001','schedule',5,5);
INSERT INTO fixture.operations SELECT 'close_failure',to_jsonb(j) FROM public.platform_jobs j WHERE name='Closure fixture';
SET ROLE authenticated;SELECT fixture.login(1);
DO $$ DECLARE response jsonb; BEGIN
 response:=public.platform_automation_action('jobs.cancel',jsonb_build_object('id',(SELECT value->>'id' FROM fixture.operations WHERE key='close_failure'),'row_version',1),'Dead letter reviewed for closure',gen_random_uuid());
 IF response->'record'->>'status'<>'cancelled' OR response->'record'->>'attempts'<>'5' THEN RAISE EXCEPTION 'Failed-job closure lost history or claimed execution'; END IF;
END $$;
RESET ROLE;
