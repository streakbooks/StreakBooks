-- Author review: stable calendar recurrence, delegation expiry and snapshot integrity.
ALTER TABLE public.report_schedules ADD COLUMN anchor_at timestamptz, ADD COLUMN authorized_at timestamptz NOT NULL DEFAULT now();
UPDATE public.report_schedules SET anchor_at=next_run_at WHERE anchor_at IS NULL;
ALTER TABLE public.report_schedules ALTER COLUMN anchor_at SET NOT NULL;
ALTER TABLE public.report_deliveries ADD COLUMN authorized_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.report_schedules DROP CONSTRAINT report_schedules_recurrence_check;
ALTER TABLE public.report_schedules ADD CONSTRAINT report_schedules_recurrence_check CHECK(recurrence IN ('daily','weekly','monthly','quarterly','yearly'));
ALTER TABLE public.report_schedules DROP CONSTRAINT report_schedules_period_check;
ALTER TABLE public.report_schedules ADD CONSTRAINT report_schedules_period_check CHECK(period IN ('previous_month','previous_quarter','year_to_date','financial_year_to_date'));
CREATE FUNCTION private.next_reporting_run(_anchor timestamptz,_after timestamptz,_recurrence text,_timezone text) RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE anchor_local timestamp:=_anchor AT TIME ZONE _timezone;after_local timestamp:=_after AT TIME ZONE _timezone;step integer;candidate timestamptz;months integer;
BEGIN
 IF _recurrence IN ('daily','weekly') THEN
  step:=GREATEST(1,floor(extract(epoch FROM (after_local-anchor_local))/(86400*CASE WHEN _recurrence='weekly' THEN 7 ELSE 1 END))::int);
  LOOP candidate:=(anchor_local+make_interval(days=>step*CASE WHEN _recurrence='weekly' THEN 7 ELSE 1 END)) AT TIME ZONE _timezone;EXIT WHEN candidate>_after;step:=step+1;END LOOP;
 ELSE
  months:=CASE _recurrence WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 WHEN 'yearly' THEN 12 ELSE 0 END;
  IF months=0 THEN RAISE EXCEPTION 'Unsupported recurrence';END IF;
  step:=GREATEST(1,((extract(year FROM after_local)::int-extract(year FROM anchor_local)::int)*12+extract(month FROM after_local)::int-extract(month FROM anchor_local)::int)/months);
  LOOP candidate:=(anchor_local+make_interval(months=>step*months)) AT TIME ZONE _timezone;EXIT WHEN candidate>_after;step:=step+1;END LOOP;
 END IF;
 RETURN candidate;
END $$;
REVOKE ALL ON FUNCTION private.next_reporting_run(timestamptz,timestamptz,text,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.report_pack_integrity(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT snapshot IS NOT NULL AND snapshot_hash=encode(extensions.digest(convert_to(snapshot::text||config::text,'UTF8'),'sha256'),'hex') FROM public.report_packs WHERE id=_id;
$$;
REVOKE ALL ON FUNCTION public.report_pack_integrity(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.report_pack_integrity(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_report_schedule(_company_id uuid,_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.report_schedules; v public.report_saved_views; p public.report_packs; id uuid; recipient text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company_id,'reports.export') THEN RAISE EXCEPTION 'Report export permission required' USING ERRCODE='42501'; END IF;
 IF _payload ? 'viewId' THEN SELECT * INTO v FROM public.report_saved_views WHERE report_saved_views.id=(_payload->>'viewId')::uuid AND company_id=_company_id; IF NOT FOUND OR v.user_id<>auth.uid() THEN RAISE EXCEPTION 'Report owner required' USING ERRCODE='42501';END IF;
 ELSE SELECT * INTO p FROM public.report_packs WHERE report_packs.id=(_payload->>'packId')::uuid AND company_id=_company_id;IF NOT FOUND OR p.owner_id<>auth.uid() OR p.status NOT IN ('published','delivered') THEN RAISE EXCEPTION 'Published pack owner required' USING ERRCODE='42501';END IF;END IF;
 IF jsonb_typeof(_payload->'recipients')<>'array' OR jsonb_array_length(_payload->'recipients') NOT BETWEEN 1 AND 25 OR length(COALESCE(_payload->>'message',''))>10000 THEN RAISE EXCEPTION 'Invalid schedule recipients or message';END IF;
 FOR recipient IN SELECT jsonb_array_elements_text(_payload->'recipients') LOOP IF recipient !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' OR length(recipient)>254 THEN RAISE EXCEPTION 'Invalid recipient address'; END IF;END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=COALESCE(_payload->>'timezone','UTC')) THEN RAISE EXCEPTION 'Invalid timezone'; END IF;
 IF _payload ? 'id' THEN
  SELECT * INTO s FROM public.report_schedules WHERE report_schedules.id=(_payload->>'id')::uuid AND company_id=_company_id AND owner_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule not found' USING ERRCODE='42501';END IF;
  IF s.version<>(_payload->>'version')::int THEN RAISE EXCEPTION 'Schedule changed; refresh' USING ERRCODE='40001'; END IF;
  UPDATE public.report_schedules SET recipients=_payload->'recipients',subject=trim(_payload->>'subject'),message=COALESCE(_payload->>'message',''),recurrence=_payload->>'recurrence',period=COALESCE(_payload->>'period','previous_month'),timezone=COALESCE(_payload->>'timezone','UTC'),next_run_at=(_payload->>'nextRunAt')::timestamptz,end_at=NULLIF(_payload->>'endAt','')::timestamptz,enabled=COALESCE((_payload->>'enabled')::boolean,true),anchor_at=(_payload->>'nextRunAt')::timestamptz,authorized_at=now(),version=version+1,updated_at=clock_timestamp() WHERE report_schedules.id=s.id RETURNING report_schedules.id INTO id;
 ELSE
  INSERT INTO public.report_schedules(company_id,owner_id,view_id,pack_id,recipients,subject,message,recurrence,period,timezone,next_run_at,anchor_at,end_at,enabled) VALUES(_company_id,auth.uid(),v.id,p.id,_payload->'recipients',trim(_payload->>'subject'),COALESCE(_payload->>'message',''),_payload->>'recurrence',COALESCE(_payload->>'period','previous_month'),COALESCE(_payload->>'timezone','UTC'),(_payload->>'nextRunAt')::timestamptz,(_payload->>'nextRunAt')::timestamptz,NULLIF(_payload->>'endAt','')::timestamptz,COALESCE((_payload->>'enabled')::boolean,true)) RETURNING report_schedules.id INTO id;
 END IF;
 PERFORM public.record_audit_event(_company_id,'report.schedule_saved','report_schedule',id,'{}');RETURN id;
END $$;


CREATE OR REPLACE FUNCTION public.enqueue_due_report_schedules(_now timestamptz DEFAULT now()) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.report_schedules; p public.report_packs; v public.report_saved_views; payload jsonb; queued uuid; count integer:=0; d1 date;d2 date; old_claims text;old_sub text;local_now timestamp;due timestamptz;new_due timestamptz;
BEGIN
 old_claims:=current_setting('request.jwt.claims',true);old_sub:=current_setting('request.jwt.claim.sub',true);
 FOR s IN SELECT * FROM public.report_schedules WHERE enabled AND next_run_at<=_now ORDER BY next_run_at,id LIMIT 50 FOR UPDATE SKIP LOCKED LOOP
  due:=s.next_run_at;
  IF s.end_at IS NOT NULL AND due>s.end_at THEN UPDATE public.report_schedules SET enabled=false WHERE id=s.id;CONTINUE;END IF;
  BEGIN
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',s.owner_id,'role','authenticated','aal','aal2','iat',extract(epoch FROM s.authorized_at))::text,true);
   PERFORM set_config('request.jwt.claim.sub',s.owner_id::text,true);
   local_now:=due AT TIME ZONE s.timezone;
   d2:=date_trunc('month',local_now)::date-1;d1:=date_trunc('month',d2)::date;
   IF s.period='previous_quarter' THEN d2:=date_trunc('quarter',local_now)::date-1;d1:=date_trunc('quarter',d2)::date;END IF;
   IF s.period='year_to_date' THEN d1:=make_date(extract(year FROM local_now)::int,1,1);d2:=local_now::date;END IF;
   IF s.period='financial_year_to_date' THEN d2:=local_now::date;SELECT (public.capture_reporting_facts(s.company_id,make_date(extract(year FROM d2)::int,1,1),d2)->>'fyStart')::date INTO d1;END IF;
   payload:=jsonb_build_object('recipients',s.recipients,'subject',s.subject,'message',s.message,'from',d1,'to',d2)||CASE WHEN s.view_id IS NOT NULL THEN jsonb_build_object('viewId',s.view_id) ELSE jsonb_build_object('packId',s.pack_id) END;
   IF NOT EXISTS(SELECT 1 FROM public.report_deliveries WHERE schedule_id=s.id AND scheduled_for=due) THEN
    queued:=public.queue_report_delivery(s.company_id,payload);
    UPDATE public.report_deliveries SET schedule_id=s.id,scheduled_for=due,authorized_at=s.authorized_at WHERE id=queued;
    count:=count+1;
   END IF;
   -- Advance from the intended local clock time; preserve DST behavior. Skip stale catch-up bursts.
   new_due:=private.next_reporting_run(s.anchor_at,_now,s.recurrence,s.timezone);
   UPDATE public.report_schedules SET next_run_at=new_due,enabled=(end_at IS NULL OR new_due<=end_at),updated_at=clock_timestamp(),version=version+1 WHERE id=s.id;
  EXCEPTION WHEN OTHERS THEN
   INSERT INTO public.report_deliveries(company_id,owner_id,pack_id,view_id,schedule_id,scheduled_for,recipients,subject,message,facts,definition,status,last_error)
   VALUES(s.company_id,s.owner_id,s.pack_id,s.view_id,s.id,due,s.recipients,s.subject,s.message,'{}','{}','failed',left(SQLERRM,500)) ON CONFLICT(schedule_id,scheduled_for) DO NOTHING;
   UPDATE public.report_schedules SET enabled=false,updated_at=clock_timestamp(),version=version+1 WHERE id=s.id;
  END;
 END LOOP;
 PERFORM set_config('request.jwt.claims',COALESCE(old_claims,''),true);PERFORM set_config('request.jwt.claim.sub',COALESCE(old_sub,''),true);
 RETURN count;
END $$;


CREATE OR REPLACE FUNCTION public.claim_report_deliveries(_limit integer DEFAULT 5) RETURNS SETOF public.report_deliveries
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.report_deliveries; old_claims text;old_sub text;
BEGIN
 old_claims:=current_setting('request.jwt.claims',true);old_sub:=current_setting('request.jwt.claim.sub',true);
 FOR j IN SELECT * FROM public.report_deliveries WHERE (status='queued' OR(status='sending' AND lease_until<now())) AND next_attempt_at<=now() AND attempts<5 ORDER BY created_at,id LIMIT LEAST(GREATEST(_limit,1),10) FOR UPDATE SKIP LOCKED LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',j.owner_id,'role','authenticated','aal','aal2','iat',extract(epoch FROM j.authorized_at))::text,true);PERFORM set_config('request.jwt.claim.sub',j.owner_id::text,true);
  IF NOT public.has_company_permission(j.company_id,'reports.export') OR (j.view_id IS NOT NULL AND NOT private.report_access(j.view_id,false)) OR (j.pack_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.report_packs WHERE id=j.pack_id AND owner_id=j.owner_id AND status IN ('published','delivered'))) THEN
   UPDATE public.report_deliveries SET status='cancelled',last_error='Authorization was revoked',updated_at=now() WHERE id=j.id;CONTINUE;
  END IF;
  UPDATE public.report_deliveries SET status='sending',attempts=attempts+1,lease_until=now()+interval '5 minutes',updated_at=now() WHERE id=j.id RETURNING * INTO j;
  RETURN NEXT j;
 END LOOP;
 PERFORM set_config('request.jwt.claims',COALESCE(old_claims,''),true);PERFORM set_config('request.jwt.claim.sub',COALESCE(old_sub,''),true);
END $$;

