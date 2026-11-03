-- Align recurrence to the minute so subsecond cron jitter cannot skip the next tick.
CREATE OR REPLACE FUNCTION private.platform_worker_tick() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.platform_jobs; schedule record; count_jobs integer:=0; run_id bigint; output jsonb; code text;
BEGIN
 IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Scheduled worker requires system execution' USING ERRCODE='42501'; END IF;
 IF NOT pg_try_advisory_xact_lock(483925016) THEN RETURN jsonb_build_object('skipped','Worker already running'); END IF;
 IF NOT EXISTS(SELECT 1 FROM private.platform_worker_state WHERE singleton AND enabled) THEN RETURN jsonb_build_object('skipped','Worker disabled'); END IF;
 UPDATE private.platform_worker_state SET started_at=clock_timestamp(),error_code=NULL WHERE singleton;
 FOR schedule IN SELECT * FROM private.platform_job_schedules WHERE next_run_at<=now() ORDER BY kind FOR UPDATE LOOP
  IF NOT EXISTS(SELECT 1 FROM public.platform_jobs WHERE kind=schedule.kind AND origin='schedule' AND status='failed') THEN
  INSERT INTO public.platform_jobs(name,kind,status,created_by,origin) VALUES(schedule.kind,schedule.kind,'queued',NULL,'schedule') ON CONFLICT(name) WHERE status='queued' DO NOTHING;
  END IF;
  UPDATE private.platform_job_schedules SET next_run_at=date_trunc('minute',now())+make_interval(secs=>schedule.interval_seconds) WHERE kind=schedule.kind;
 END LOOP;
 FOR j IN SELECT * FROM public.platform_jobs WHERE status='queued' AND kind IS NOT NULL AND next_run_at<=now() AND attempts<max_attempts ORDER BY next_run_at,created_at,id LIMIT 5 FOR UPDATE SKIP LOCKED LOOP
  UPDATE public.platform_jobs SET status='running',attempts=attempts+1,started_at=clock_timestamp(),finished_at=NULL,last_error=NULL,row_version=row_version+1 WHERE id=j.id RETURNING * INTO j;
  INSERT INTO public.platform_job_runs(job_id,attempt,status) VALUES(j.id,j.attempts,'running') RETURNING id INTO run_id;
  BEGIN
   CASE j.kind WHEN 'expire_support' THEN output:=private.platform_expire_support_jobs(); WHEN 'check_operations' THEN output:=private.platform_check_operations(); ELSE RAISE EXCEPTION 'Unsupported job handler'; END CASE;
   UPDATE public.platform_jobs SET status='succeeded',finished_at=clock_timestamp(),result=output,row_version=row_version+1 WHERE id=j.id;
   UPDATE public.platform_job_runs SET status='succeeded',finished_at=clock_timestamp(),result=output WHERE id=run_id;
   PERFORM private.platform_log('job.succeed','platform_job',j.id::text,NULL,output,'Bounded operational handler completed');
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE;
   UPDATE public.platform_jobs SET status=CASE WHEN attempts>=max_attempts THEN 'failed' ELSE 'queued' END,next_run_at=now()+make_interval(secs=>least(3600,60*power(2,least(attempts-1,6))::integer)),finished_at=clock_timestamp(),last_error='Handler failed ('||code||')',row_version=row_version+1 WHERE id=j.id;
   UPDATE public.platform_job_runs SET status='failed',finished_at=clock_timestamp(),error_code=code WHERE id=run_id;
   PERFORM private.platform_log('job.fail','platform_job',j.id::text,NULL,jsonb_build_object('code',code,'attempt',j.attempts,'retrying',j.attempts<j.max_attempts),'Operational handler failed; details remain redacted');
  END;
  count_jobs:=count_jobs+1;
 END LOOP;
 UPDATE private.platform_worker_state SET finished_at=clock_timestamp(),last_jobs=count_jobs WHERE singleton;
 RETURN jsonb_build_object('processed',count_jobs);
END $$;
REVOKE ALL ON FUNCTION private.platform_worker_tick() FROM PUBLIC,anon,authenticated;
