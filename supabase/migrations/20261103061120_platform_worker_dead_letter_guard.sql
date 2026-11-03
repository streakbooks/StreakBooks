-- A dead-lettered scheduled handler pauses that recurring kind until reviewed.
-- Closing a failed job retains its attempts and never claims successful execution.
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
  UPDATE private.platform_job_schedules SET next_run_at=now()+make_interval(secs=>schedule.interval_seconds) WHERE kind=schedule.kind;
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
CREATE OR REPLACE FUNCTION private.platform_automation_action(_command text,_payload jsonb,_reason text,_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE allowed text[]; receipt private.platform_operation_receipts; body jsonb; response jsonb; before_row jsonb; after_row jsonb; rec_id uuid; r public.platform_alert_rules; j public.platform_jobs; ev public.platform_alert_events; operation text:=split_part(_command,'.',2);
BEGIN
 IF _command LIKE 'jobs.%' THEN PERFORM private.require_platform('settings.manage'); ELSE PERFORM private.require_platform('notifications.manage'); END IF;
 PERFORM private.platform_rate_limit();
 IF _request_id IS NULL OR _payload IS NULL OR jsonb_typeof(_payload)<>'object' OR octet_length(_payload::text)>10000 OR length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Provide valid operation details, request ID and reason'; END IF;
 allowed:=CASE _command WHEN 'jobs.enqueue' THEN ARRAY['kind'] WHEN 'jobs.retry' THEN ARRAY['id','row_version'] WHEN 'jobs.cancel' THEN ARRAY['id','row_version']
 WHEN 'rules.save' THEN ARRAY['id','row_version','name','metric','threshold','severity','quiet_start_utc','quiet_end_utc'] WHEN 'rules.enable' THEN ARRAY['id','row_version'] WHEN 'rules.disable' THEN ARRAY['id','row_version'] WHEN 'alerts.ack' THEN ARRAY['id'] END;
 IF allowed IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(_payload) k WHERE NOT k=ANY(allowed)) THEN RAISE EXCEPTION 'Unknown automation operation or field'; END IF;
 body:=jsonb_build_object('details',_payload,'reason',trim(_reason));
 INSERT INTO private.platform_operation_receipts(actor_id,request_id,command,payload) VALUES(auth.uid(),_request_id,_command,body) ON CONFLICT DO NOTHING;
 SELECT * INTO receipt FROM private.platform_operation_receipts WHERE actor_id=auth.uid() AND request_id=_request_id FOR UPDATE;
 IF receipt.command<>_command OR receipt.payload<>body THEN RAISE EXCEPTION 'This request ID already belongs to different operation details'; END IF;
 IF receipt.result IS NOT NULL THEN RETURN receipt.result; END IF;
 IF _command='jobs.enqueue' THEN
  IF coalesce(_payload->>'kind','') NOT IN ('expire_support','check_operations') THEN RAISE EXCEPTION 'Choose an implemented operational handler'; END IF;
  INSERT INTO public.platform_jobs(name,kind,status,created_by) VALUES(_payload->>'kind',_payload->>'kind','queued',auth.uid()) RETURNING id INTO rec_id;
  SELECT to_jsonb(x) INTO after_row FROM public.platform_jobs x WHERE x.id=rec_id;
 ELSIF _command IN ('jobs.retry','jobs.cancel') THEN
  rec_id:=(_payload->>'id')::uuid; SELECT * INTO j FROM public.platform_jobs WHERE id=rec_id FOR UPDATE;
  IF j.id IS NULL THEN RAISE EXCEPTION 'That job was not found'; END IF;
  IF (_payload->>'row_version')::integer IS DISTINCT FROM j.row_version THEN RAISE EXCEPTION 'This job changed. Reload before retrying' USING ERRCODE='40001'; END IF;
  before_row:=to_jsonb(j);
  IF _command='jobs.retry' THEN
   IF j.status<>'failed' OR j.kind IS NULL OR j.max_attempts>=30 THEN RAISE EXCEPTION 'Only a failed implemented job below the retry limit can retry'; END IF;
   UPDATE public.platform_jobs SET status='queued',max_attempts=least(30,max_attempts+5),next_run_at=now(),last_error=NULL,finished_at=NULL,row_version=row_version+1 WHERE id=rec_id;
  ELSE
   IF j.status NOT IN ('queued','failed') THEN RAISE EXCEPTION 'Only queued or failed jobs can be closed'; END IF;
   UPDATE public.platform_jobs SET status='cancelled',finished_at=now(),row_version=row_version+1 WHERE id=rec_id;
  END IF;
  SELECT to_jsonb(x) INTO after_row FROM public.platform_jobs x WHERE x.id=rec_id;
 ELSIF _command='alerts.ack' THEN
  rec_id:=(_payload->>'id')::uuid; SELECT * INTO ev FROM public.platform_alert_events WHERE id=rec_id FOR UPDATE;
  IF ev.id IS NULL OR ev.resolved_at IS NOT NULL OR ev.acknowledged_at IS NOT NULL THEN RAISE EXCEPTION 'Choose an unacknowledged open alert'; END IF;
  before_row:=to_jsonb(ev); UPDATE public.platform_alert_events SET acknowledged_at=now(),acknowledged_by=auth.uid() WHERE id=rec_id;
  SELECT to_jsonb(x) INTO after_row FROM public.platform_alert_events x WHERE x.id=rec_id;
 ELSE
  rec_id:=(_payload->>'id')::uuid;
  IF rec_id IS NOT NULL THEN
   SELECT * INTO r FROM public.platform_alert_rules WHERE id=rec_id FOR UPDATE;
   IF r.id IS NULL THEN RAISE EXCEPTION 'That alert rule was not found'; END IF;
   IF (_payload->>'row_version')::integer IS DISTINCT FROM r.row_version THEN RAISE EXCEPTION 'This rule changed. Reload before retrying' USING ERRCODE='40001'; END IF;
   before_row:=to_jsonb(r);
  ELSIF _command<>'rules.save' THEN RAISE EXCEPTION 'Choose an alert rule'; END IF;
  IF _command='rules.save' THEN
   IF length(trim(coalesce(_payload->>'name',''))) NOT BETWEEN 2 AND 80 OR coalesce(_payload->>'metric','') NOT IN ('overdue_cases','urgent_cases','open_incidents','failed_jobs','aged_approvals') OR coalesce(_payload->>'severity','') NOT IN ('info','warning','critical') OR (_payload->>'threshold') IS NULL OR (_payload->>'threshold')::bigint NOT BETWEEN 0 AND 2147483647 THEN RAISE EXCEPTION 'Choose valid rule details and a whole-number threshold up to 2147483647'; END IF;
   IF rec_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(483925017);
    IF (SELECT count(*) FROM public.platform_alert_rules)>=1000 THEN RAISE EXCEPTION 'Rule capacity reached'; END IF;
    INSERT INTO public.platform_alert_rules(name,metric,threshold,severity,created_by,quiet_start_utc,quiet_end_utc,state)
    VALUES(trim(_payload->>'name'),_payload->>'metric',(_payload->>'threshold')::bigint,_payload->>'severity',auth.uid(),(_payload->>'quiet_start_utc')::integer,(_payload->>'quiet_end_utc')::integer,'paused') RETURNING id INTO rec_id;
   ELSE
    UPDATE public.platform_alert_rules SET name=trim(_payload->>'name'),metric=_payload->>'metric',threshold=(_payload->>'threshold')::bigint,severity=_payload->>'severity',quiet_start_utc=(_payload->>'quiet_start_utc')::integer,quiet_end_utc=(_payload->>'quiet_end_utc')::integer,row_version=row_version+1,updated_at=now(),observed=NULL,observed_at=NULL,state=CASE WHEN enabled THEN 'unknown' ELSE 'paused' END WHERE id=rec_id;
    -- A configuration change starts a new measured episode rather than rewriting history.
    UPDATE public.platform_alert_events SET resolved_at=now(),resolution_reason='Rule configuration changed' WHERE rule_id=rec_id AND resolved_at IS NULL;
   END IF;
  ELSIF _command='rules.enable' THEN
   IF r.enabled OR r.metric IS NULL THEN RAISE EXCEPTION 'Choose a configured paused rule'; END IF;
   -- Serialize capacity changes; no enabled rule is silently skipped by the bounded evaluator.
   PERFORM pg_advisory_xact_lock(483925017);
   IF (SELECT count(*) FROM public.platform_alert_rules WHERE enabled)>=100 THEN RAISE EXCEPTION 'Enabled rule capacity reached'; END IF;
   UPDATE public.platform_alert_rules SET enabled=true,state='unknown',observed=NULL,observed_at=NULL,updated_at=now(),row_version=row_version+1 WHERE id=rec_id;
  ELSE
   IF NOT r.enabled THEN RAISE EXCEPTION 'That rule is already paused'; END IF;
   UPDATE public.platform_alert_rules SET enabled=false,state='paused',updated_at=now(),row_version=row_version+1 WHERE id=rec_id;
   UPDATE public.platform_alert_events SET resolved_at=now(),resolution_reason='Rule paused by operator' WHERE rule_id=rec_id AND resolved_at IS NULL;
  END IF;
  SELECT to_jsonb(x)||jsonb_build_object('threshold',x.threshold::text,'observed',x.observed::text) INTO after_row FROM public.platform_alert_rules x WHERE x.id=rec_id;
 END IF;
 PERFORM private.platform_log(_command,CASE WHEN _command LIKE 'jobs.%' THEN 'platform_job' WHEN _command='alerts.ack' THEN 'platform_alert_event' ELSE 'platform_alert_rule' END,rec_id::text,before_row,after_row,trim(_reason));
 response:=jsonb_build_object('id',rec_id,'record',after_row);
 UPDATE private.platform_operation_receipts SET result=response WHERE actor_id=auth.uid() AND request_id=_request_id;
 RETURN response;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'That job is already queued or that rule name already exists';
END $$;
REVOKE ALL ON FUNCTION private.platform_worker_tick() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.platform_automation_action(text,jsonb,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.platform_automation_action(text,jsonb,text,uuid) TO authenticated;
