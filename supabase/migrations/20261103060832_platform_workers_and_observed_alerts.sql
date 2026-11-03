-- A bounded, database-local worker. No arbitrary names, SQL, URLs, provider calls or secrets.
ALTER TABLE public.platform_jobs DROP CONSTRAINT platform_jobs_status_check;
ALTER TABLE public.platform_jobs ADD CONSTRAINT platform_jobs_status_check CHECK(status IN ('queued','running','succeeded','failed','cancelled'));
ALTER TABLE public.platform_jobs ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.platform_jobs ADD COLUMN kind text CHECK(kind IN ('expire_support','check_operations')),
 ADD COLUMN origin text NOT NULL DEFAULT 'operator' CHECK(origin IN ('operator','schedule')),
 ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), ADD COLUMN max_attempts integer NOT NULL DEFAULT 5 CHECK(max_attempts BETWEEN 1 AND 30),
 ADD COLUMN next_run_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN started_at timestamptz, ADD COLUMN finished_at timestamptz,
 ADD COLUMN last_error text, ADD COLUMN result jsonb, ADD COLUMN row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),
 ADD CONSTRAINT platform_jobs_actor CHECK(created_by IS NOT NULL OR origin='schedule');
CREATE INDEX platform_jobs_ready ON public.platform_jobs(next_run_at,created_at) WHERE status='queued' AND kind IS NOT NULL;
CREATE TABLE public.platform_job_runs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, job_id uuid NOT NULL REFERENCES public.platform_jobs(id),
 attempt integer NOT NULL, started_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
 status text NOT NULL CHECK(status IN ('running','succeeded','failed')), error_code text, result jsonb,
 UNIQUE(job_id,attempt)
);
ALTER TABLE public.platform_job_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_job_runs FROM PUBLIC,anon,authenticated;
ALTER TABLE public.platform_alert_rules ADD COLUMN metric text CHECK(metric IN ('overdue_cases','urgent_cases','open_incidents','failed_jobs','aged_approvals')),
 ADD COLUMN severity text NOT NULL DEFAULT 'warning' CHECK(severity IN ('info','warning','critical')),
 ADD COLUMN enabled boolean NOT NULL DEFAULT false, ADD COLUMN observed bigint, ADD COLUMN observed_at timestamptz,
 ADD COLUMN state text NOT NULL DEFAULT 'unconfigured' CHECK(state IN ('unconfigured','paused','quiet','firing','unknown')),
 ADD COLUMN quiet_start_utc integer CHECK(quiet_start_utc BETWEEN 0 AND 23), ADD COLUMN quiet_end_utc integer CHECK(quiet_end_utc BETWEEN 0 AND 23),
 ADD COLUMN row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0), ADD COLUMN updated_at timestamptz,
 ADD CONSTRAINT platform_alert_quiet_pair CHECK((quiet_start_utc IS NULL AND quiet_end_utc IS NULL) OR (quiet_start_utc IS NOT NULL AND quiet_end_utc IS NOT NULL AND quiet_start_utc<>quiet_end_utc));
CREATE TABLE public.platform_alert_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rule_id uuid NOT NULL REFERENCES public.platform_alert_rules(id),
 metric text NOT NULL, severity text NOT NULL, threshold bigint NOT NULL, observed bigint NOT NULL,
 first_seen_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(), observations integer NOT NULL DEFAULT 1,
 resolved_at timestamptz, resolution_reason text, acknowledged_at timestamptz, acknowledged_by uuid,
 quiet_hours boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX platform_alert_open ON public.platform_alert_events(rule_id) WHERE resolved_at IS NULL;
CREATE INDEX platform_alert_events_time ON public.platform_alert_events(first_seen_at DESC,id);
ALTER TABLE public.platform_alert_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_alert_events FROM PUBLIC,anon,authenticated;
CREATE TABLE private.platform_worker_state (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT true,
 started_at timestamptz, finished_at timestamptz, last_jobs integer, error_code text
);
CREATE TABLE private.platform_job_schedules (
 kind text PRIMARY KEY CHECK(kind IN ('expire_support','check_operations')), interval_seconds integer NOT NULL CHECK(interval_seconds BETWEEN 60 AND 86400),
 next_run_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.platform_worker_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.platform_job_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.platform_worker_state,private.platform_job_schedules FROM PUBLIC,anon,authenticated;
INSERT INTO private.platform_worker_state(singleton) VALUES(true);
INSERT INTO private.platform_job_schedules(kind,interval_seconds) VALUES('expire_support',60),('check_operations',60);

CREATE FUNCTION private.platform_measure_metric(_metric text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v bigint; BEGIN
 CASE _metric
 WHEN 'overdue_cases' THEN SELECT count(*) INTO v FROM public.platform_service_cases x JOIN public.companies c ON c.id=x.company_id WHERE x.status='open' AND x.due_at<now() AND NOT c.is_demo;
 WHEN 'urgent_cases' THEN SELECT count(*) INTO v FROM public.platform_service_cases x JOIN public.companies c ON c.id=x.company_id WHERE x.status='open' AND x.priority='urgent' AND NOT c.is_demo;
 WHEN 'open_incidents' THEN SELECT count(*) INTO v FROM public.platform_incidents WHERE status='open';
 WHEN 'failed_jobs' THEN SELECT count(*) INTO v FROM public.platform_jobs WHERE status='failed' AND kind IS NOT NULL;
 WHEN 'aged_approvals' THEN SELECT count(*) INTO v FROM public.approval_requests WHERE status='pending' AND expires_at>now() AND created_at<now()-interval '24 hours';
 ELSE RETURN NULL; END CASE; RETURN v;
END $$;
CREATE FUNCTION private.platform_check_operations() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.platform_alert_rules; value bigint; fired integer:=0; recovered integer:=0; observed integer:=0; quiet boolean; hour integer:=extract(hour FROM now() AT TIME ZONE 'UTC'); event_id uuid;
BEGIN
 FOR r IN SELECT * FROM public.platform_alert_rules WHERE enabled ORDER BY id LIMIT 100 FOR UPDATE LOOP
  value:=private.platform_measure_metric(r.metric); observed:=observed+1;
  UPDATE public.platform_alert_rules SET observed=value,observed_at=now(),state=CASE WHEN value IS NULL THEN 'unknown' WHEN value>r.threshold THEN 'firing' ELSE 'quiet' END WHERE id=r.id;
  IF value IS NULL THEN CONTINUE; END IF; -- unavailable is never a fabricated zero or a recovery.
  quiet:=coalesce(CASE WHEN r.quiet_start_utc<r.quiet_end_utc THEN hour>=r.quiet_start_utc AND hour<r.quiet_end_utc ELSE hour>=r.quiet_start_utc OR hour<r.quiet_end_utc END,false);
  IF value>r.threshold THEN
   event_id:=NULL;
   INSERT INTO public.platform_alert_events(rule_id,metric,severity,threshold,observed,quiet_hours)
   VALUES(r.id,r.metric,r.severity,r.threshold,value,quiet) ON CONFLICT(rule_id) WHERE resolved_at IS NULL DO NOTHING RETURNING id INTO event_id;
   IF event_id IS NULL THEN UPDATE public.platform_alert_events SET observed=value,last_seen_at=now(),observations=observations+1,quiet_hours=quiet WHERE rule_id=r.id AND resolved_at IS NULL;
   ELSE fired:=fired+1; PERFORM private.platform_log('alert.fire','platform_alert_rule',r.id::text,NULL,jsonb_build_object('eventId',event_id,'metric',r.metric,'observed',value,'threshold',r.threshold),'Measured operational threshold exceeded'); END IF;
  ELSE
   UPDATE public.platform_alert_events SET resolved_at=now(),resolution_reason='Measured value returned below or to threshold',last_seen_at=now(),observed=value WHERE rule_id=r.id AND resolved_at IS NULL RETURNING id INTO event_id;
   IF FOUND THEN recovered:=recovered+1; PERFORM private.platform_log('alert.recover','platform_alert_rule',r.id::text,NULL,jsonb_build_object('eventId',event_id,'observed',value),'Measured operational recovery'); END IF;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('rulesObserved',observed,'newEpisodes',fired,'recoveries',recovered);
END $$;
CREATE FUNCTION private.platform_expire_support_jobs() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate record; g public.break_glass_grants; total integer:=0; BEGIN
 FOR candidate IN SELECT id,company_id FROM public.break_glass_grants WHERE status IN ('pending','active') AND expires_at<=now() ORDER BY expires_at,id LIMIT 100 LOOP
  -- Match the established company -> request -> approval lock order, and skip busy companies.
  PERFORM 1 FROM public.companies WHERE id=candidate.company_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT * INTO g FROM public.break_glass_grants WHERE id=candidate.id FOR UPDATE;
  IF g.status NOT IN ('pending','active') OR g.expires_at>now() THEN CONTINUE; END IF;
  UPDATE public.approval_requests SET status='expired' WHERE id=g.approval_id AND status='pending';
  UPDATE public.platform_support_grants SET revoked_at=now() WHERE id=g.support_grant_id AND revoked_at IS NULL;
  UPDATE public.break_glass_grants SET status='expired' WHERE id=g.id;
  INSERT INTO public.break_glass_events(grant_id,company_id,action,actor_id,event_reason) VALUES(g.id,g.company_id,'expired',NULL,'Access reached its expiry');
  PERFORM private.platform_log('break_glass.expire','company',g.company_id::text,to_jsonb(g),jsonb_build_object('status','expired','source','scheduled_worker'),'Access reached its expiry');
  total:=total+1;
 END LOOP;
 RETURN jsonb_build_object('expired',total);
END $$;
CREATE FUNCTION private.platform_worker_tick() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.platform_jobs; schedule record; count_jobs integer:=0; run_id bigint; output jsonb; code text;
BEGIN
 IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Scheduled worker requires system execution' USING ERRCODE='42501'; END IF;
 IF NOT pg_try_advisory_xact_lock(483925016) THEN RETURN jsonb_build_object('skipped','Worker already running'); END IF;
 IF NOT EXISTS(SELECT 1 FROM private.platform_worker_state WHERE singleton AND enabled) THEN RETURN jsonb_build_object('skipped','Worker disabled'); END IF;
 UPDATE private.platform_worker_state SET started_at=clock_timestamp(),error_code=NULL WHERE singleton;
 FOR schedule IN SELECT * FROM private.platform_job_schedules WHERE next_run_at<=now() ORDER BY kind FOR UPDATE LOOP
  INSERT INTO public.platform_jobs(name,kind,status,created_by,origin) VALUES(schedule.kind,schedule.kind,'queued',NULL,'schedule') ON CONFLICT(name) WHERE status='queued' DO NOTHING;
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
-- Workers are postgres/cron-only. They cannot be invoked by a tenant or platform JWT.
REVOKE ALL ON FUNCTION private.platform_measure_metric(text),private.platform_check_operations(),private.platform_expire_support_jobs(),private.platform_worker_tick() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.platform_worker_health() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state private.platform_worker_state; configured boolean:=false; latest jsonb; BEGIN
 SELECT * INTO state FROM private.platform_worker_state WHERE singleton;
 IF to_regclass('cron.job') IS NOT NULL THEN
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname=''linkbooks-platform-operations'' AND active)' INTO configured;
 END IF;
 RETURN jsonb_build_object('configured',configured,'enabled',state.enabled,'startedAt',state.started_at,'finishedAt',state.finished_at,'lastJobs',state.last_jobs,
 'state',CASE WHEN NOT configured THEN 'unconfigured' WHEN NOT state.enabled THEN 'paused' WHEN state.finished_at IS NULL THEN 'awaiting_first_run' WHEN state.finished_at<now()-interval '3 minutes' THEN 'stale' ELSE 'recent_tick' END);
END $$;
CREATE FUNCTION private.platform_automation_read(_module text,_search text,_status text,_page integer,_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE term text:=trim(coalesce(_search,'')); source text; result jsonb; modules jsonb;
BEGIN
 IF _module='context' THEN
  IF NOT(private.platform_can('settings.view') OR private.platform_can('monitoring.view') OR private.platform_can('notifications.view')) THEN RAISE EXCEPTION 'Platform automation permission required' USING ERRCODE='42501'; END IF;
  SELECT jsonb_agg(jsonb_build_object('key',key,'label',label,'canManage',private.platform_can(permission)) ORDER BY position) INTO modules FROM (VALUES('jobs','Background jobs','settings.manage',1),('rules','Alert rules','notifications.manage',2),('events','Alert history','notifications.manage',3)) m(key,label,permission,position)
  WHERE CASE WHEN key='jobs' THEN private.platform_can('settings.view') OR private.platform_can('monitoring.view') ELSE private.platform_can('notifications.view') END;
  RETURN jsonb_build_object('modules',modules,'worker',private.platform_worker_health());
 END IF;
 IF _module IN ('jobs','runs') THEN
  IF NOT(private.platform_can('settings.view') OR private.platform_can('monitoring.view')) THEN RAISE EXCEPTION 'Platform job view permission required' USING ERRCODE='42501'; END IF;
 ELSIF _module IN ('rules','events') THEN PERFORM private.require_platform('notifications.view');
 ELSE RAISE EXCEPTION 'Unknown automation workspace'; END IF;
 PERFORM private.platform_rate_limit();
 IF _page IS NULL OR _page NOT BETWEEN 0 AND 100000 OR length(term)>160 OR _status IS NULL OR length(_status)>40 THEN RAISE EXCEPTION 'Invalid automation filters'; END IF;
 term:='%'||replace(replace(replace(term,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
 source:=CASE _module
 WHEN 'jobs' THEN 'SELECT to_jsonb(j) AS row,j.created_at AS sort_at FROM public.platform_jobs j'
 WHEN 'runs' THEN 'SELECT to_jsonb(x)||jsonb_build_object(''id'',x.id::text) AS row,x.started_at AS sort_at FROM public.platform_job_runs x WHERE x.job_id=$3'
 WHEN 'rules' THEN 'SELECT to_jsonb(r)||jsonb_build_object(''threshold'',r.threshold::text,''observed'',r.observed::text,''status'',r.state) AS row,r.created_at AS sort_at FROM public.platform_alert_rules r'
 WHEN 'events' THEN 'SELECT to_jsonb(e)||jsonb_build_object(''name'',r.name,''threshold'',e.threshold::text,''observed'',e.observed::text,''status'',CASE WHEN e.resolved_at IS NULL THEN ''open'' ELSE ''resolved'' END) AS row,e.first_seen_at AS sort_at FROM public.platform_alert_events e JOIN public.platform_alert_rules r ON r.id=e.rule_id' END;
 EXECUTE 'WITH source AS ('||source||'),filtered AS (SELECT * FROM source WHERE (row->>''name'' ILIKE $1 ESCAPE E''\\'' OR row->>''id'' ILIKE $1 ESCAPE E''\\'' OR $1=''%%'') AND ($2=''all'' OR row->>''status''=$2)),page AS (SELECT row FROM filtered ORDER BY sort_at DESC,row->>''id'' LIMIT 25 OFFSET $4) SELECT jsonb_build_object(''rows'',coalesce((SELECT jsonb_agg(row) FROM page),''[]''::jsonb),''total'',(SELECT count(*) FROM filtered))' INTO result USING term,_status,_id,_page*25;
 RETURN result;
END $$;
CREATE FUNCTION private.platform_automation_action(_command text,_payload jsonb,_reason text,_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
   IF j.status<>'queued' THEN RAISE EXCEPTION 'Only a queued job can be cancelled'; END IF;
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
CREATE FUNCTION public.platform_automation_read(_module text,_search text DEFAULT '',_status text DEFAULT 'all',_page integer DEFAULT 0,_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.platform_automation_read(_module,_search,_status,_page,_id) $$;
CREATE FUNCTION public.platform_automation_action(_command text,_payload jsonb,_reason text,_request_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.platform_automation_action(_command,_payload,_reason,_request_id) $$;
CREATE OR REPLACE FUNCTION public.platform_enqueue_job(_name text,_reason text) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT (private.platform_automation_action('jobs.enqueue',jsonb_build_object('kind',_name),_reason,gen_random_uuid())->>'id')::uuid $$;
REVOKE ALL ON FUNCTION public.platform_automation_read(text,text,text,integer,uuid),private.platform_automation_read(text,text,text,integer,uuid),public.platform_automation_action(text,jsonb,text,uuid),private.platform_automation_action(text,jsonb,text,uuid),public.platform_enqueue_job(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_automation_read(text,text,text,integer,uuid),private.platform_automation_read(text,text,text,integer,uuid),public.platform_automation_action(text,jsonb,text,uuid),private.platform_automation_action(text,jsonb,text,uuid),public.platform_enqueue_job(text,text) TO authenticated;
REVOKE ALL ON FUNCTION private.platform_worker_health() FROM PUBLIC,anon,authenticated;
-- Supabase already provides pg_cron; the disposable plain-Postgres fixture drives ticks explicitly.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
  PERFORM cron.schedule('linkbooks-platform-operations','* * * * *','SELECT private.platform_worker_tick();');
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
