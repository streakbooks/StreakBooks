-- Operational workflows reuse existing stores, staff permissions and platform_audit.
-- Retained records are never deleted. Legacy unknown dates/priority stay unknown.
ALTER TABLE public.platform_service_cases
 ADD COLUMN description text NOT NULL DEFAULT '', ADD COLUMN priority text NOT NULL DEFAULT 'untriaged' CHECK(priority IN ('untriaged','low','normal','high','urgent')),
 ADD COLUMN phase text NOT NULL DEFAULT 'triage' CHECK(phase IN ('triage','in_progress','waiting_customer')),
 ADD COLUMN owner_id uuid, ADD COLUMN due_at timestamptz, ADD COLUMN closed_at timestamptz,
 ADD COLUMN updated_at timestamptz, ADD COLUMN row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0);
ALTER TABLE public.platform_incidents
 ADD COLUMN description text NOT NULL DEFAULT '', ADD COLUMN severity text NOT NULL DEFAULT 'unclassified' CHECK(severity IN ('unclassified','minor','major','critical')),
 ADD COLUMN phase text NOT NULL DEFAULT 'unknown' CHECK(phase IN ('unknown','investigating','identified','monitoring')),
 ADD COLUMN owner_id uuid, ADD COLUMN impact_started_at timestamptz, ADD COLUMN resolved_at timestamptz,
 ADD COLUMN updated_at timestamptz, ADD COLUMN row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0);
ALTER TABLE public.platform_segments ADD COLUMN archived_at timestamptz, ADD COLUMN updated_at timestamptz,
 ADD COLUMN row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0);
ALTER TABLE public.platform_segment_members ADD COLUMN active boolean NOT NULL DEFAULT true,
 ADD COLUMN added_at timestamptz, ADD COLUMN removed_at timestamptz;
ALTER TABLE public.platform_releases ADD COLUMN title text, ADD COLUMN summary text NOT NULL DEFAULT '',
 ADD COLUMN stage text NOT NULL DEFAULT 'recorded' CHECK(stage IN ('planned','recorded','rolled_back')),
 ADD COLUMN change_reference text, ADD COLUMN rollback_reference text, ADD COLUMN updated_at timestamptz,
 ADD COLUMN row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0);
CREATE INDEX platform_cases_company_status ON public.platform_service_cases(company_id,status,created_at DESC);
CREATE INDEX platform_cases_due ON public.platform_service_cases(due_at) WHERE status='open' AND due_at IS NOT NULL;
CREATE TABLE private.platform_operation_receipts (
 actor_id uuid NOT NULL, request_id uuid NOT NULL, command text NOT NULL, payload jsonb NOT NULL,
 result jsonb, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,request_id)
);
ALTER TABLE private.platform_operation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.platform_operation_receipts FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.platform_ops_permission(_module text,_manage boolean) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE base text;
BEGIN base:=CASE _module WHEN 'cases' THEN 'support' WHEN 'incidents' THEN 'support' WHEN 'segments' THEN 'businesses' WHEN 'releases' THEN 'settings' ELSE NULL END;
 IF base IS NULL THEN RAISE EXCEPTION 'Unknown operations workspace'; END IF;
 RETURN base||CASE WHEN _manage THEN '.manage' ELSE '.view' END;
END $$;
CREATE FUNCTION private.platform_ops_staff_eligible(_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=_id AND (u.banned_until IS NULL OR u.banned_until<=now())
 AND NOT EXISTS(SELECT 1 FROM public.platform_user_controls x WHERE x.user_id=u.id AND x.status<>'active')
 AND (EXISTS(SELECT 1 FROM public.platform_roles r WHERE r.user_id=u.id AND r.role IN ('platform_owner','platform_support'))
 OR EXISTS(SELECT 1 FROM public.platform_role_assignments a JOIN public.platform_custom_roles r ON r.id=a.role_id
 WHERE a.user_id=u.id AND a.scope_id IS NULL AND r.scope='platform' AND 'support.manage'=ANY(r.permissions) AND 'support.view'=ANY(r.permissions))));
$$;
CREATE FUNCTION private.platform_ops_touch() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE j jsonb:=to_jsonb(NEW); prior jsonb; staff uuid;
BEGIN
 IF TG_OP='UPDATE' THEN prior:=to_jsonb(OLD); NEW.row_version:=OLD.row_version+1; ELSE NEW.row_version:=1; END IF;
 NEW.updated_at:=clock_timestamp(); staff:=(j->>'owner_id')::uuid;
 IF staff IS NOT NULL AND (TG_OP='INSERT' OR staff IS DISTINCT FROM (prior->>'owner_id')::uuid)
 AND NOT private.platform_ops_staff_eligible(staff) THEN RAISE EXCEPTION 'Choose an active platform support staff member'; END IF;
 IF TG_TABLE_NAME='platform_service_cases' THEN
  IF (TG_OP='INSERT' OR NEW.subject IS DISTINCT FROM OLD.subject) AND length(trim(NEW.subject)) NOT BETWEEN 3 AND 160 THEN RAISE EXCEPTION 'Case subject must contain 3 to 160 characters'; END IF;
  IF length(NEW.description)>8000 OR (NEW.due_at IS NOT NULL AND NOT isfinite(NEW.due_at)) THEN RAISE EXCEPTION 'Invalid case details or deadline'; END IF;
  IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN NEW.closed_at:=CASE WHEN NEW.status='closed' THEN now() ELSE NULL END; END IF;
 ELSIF TG_TABLE_NAME='platform_incidents' THEN
  IF (TG_OP='INSERT' OR NEW.title IS DISTINCT FROM OLD.title) AND length(trim(NEW.title)) NOT BETWEEN 3 AND 160 THEN RAISE EXCEPTION 'Incident title must contain 3 to 160 characters'; END IF;
  IF length(NEW.description)>8000 OR (NEW.impact_started_at IS NOT NULL AND NOT isfinite(NEW.impact_started_at)) THEN RAISE EXCEPTION 'Invalid incident details'; END IF;
  IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN NEW.resolved_at:=CASE WHEN NEW.status='resolved' THEN now() ELSE NULL END; END IF;
 ELSIF TG_TABLE_NAME='platform_releases' THEN
  IF length(coalesce(NEW.title,''))>160 OR length(NEW.summary)>8000 OR length(coalesce(NEW.change_reference,''))>1000 OR length(coalesce(NEW.rollback_reference,''))>1000 THEN RAISE EXCEPTION 'Release details are too long'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER platform_cases_touch BEFORE INSERT OR UPDATE ON public.platform_service_cases FOR EACH ROW EXECUTE FUNCTION private.platform_ops_touch();
CREATE TRIGGER platform_incidents_touch BEFORE INSERT OR UPDATE ON public.platform_incidents FOR EACH ROW EXECUTE FUNCTION private.platform_ops_touch();
CREATE TRIGGER platform_segments_touch BEFORE INSERT OR UPDATE ON public.platform_segments FOR EACH ROW EXECUTE FUNCTION private.platform_ops_touch();
CREATE TRIGGER platform_releases_touch BEFORE INSERT OR UPDATE ON public.platform_releases FOR EACH ROW EXECUTE FUNCTION private.platform_ops_touch();

CREATE FUNCTION private.platform_ops_context() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; BEGIN
 IF NOT(private.platform_can('support.view') OR private.platform_can('businesses.view') OR private.platform_can('settings.view')) THEN RAISE EXCEPTION 'Platform operations permission required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_agg(jsonb_build_object('key',key,'label',label,'canManage',private.platform_can(private.platform_ops_permission(key,true))) ORDER BY position)
 INTO result FROM (VALUES('cases','Service cases',1),('incidents','Incidents',2),('segments','Business segments',3),('releases','Release records',4)) m(key,label,position)
 WHERE private.platform_can(private.platform_ops_permission(key,false));
 RETURN jsonb_build_object('modules',coalesce(result,'[]'::jsonb));
END $$;
CREATE FUNCTION private.platform_ops_row(_module text,_id uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r jsonb; BEGIN
 CASE _module
 WHEN 'cases' THEN SELECT to_jsonb(c)||jsonb_build_object('company_name',co.name,'owner_name',p.full_name) INTO r FROM public.platform_service_cases c JOIN public.companies co ON co.id=c.company_id LEFT JOIN public.profiles p ON p.id=c.owner_id WHERE c.id=_id;
 WHEN 'incidents' THEN SELECT to_jsonb(i)||jsonb_build_object('owner_name',p.full_name) INTO r FROM public.platform_incidents i LEFT JOIN public.profiles p ON p.id=i.owner_id WHERE i.id=_id;
 WHEN 'segments' THEN SELECT to_jsonb(s)||jsonb_build_object('status',CASE WHEN s.archived_at IS NULL THEN 'active' ELSE 'archived' END,'members',(SELECT count(*) FROM public.platform_segment_members m WHERE m.segment_id=s.id AND m.active)) INTO r FROM public.platform_segments s WHERE s.id=_id;
 WHEN 'releases' THEN SELECT to_jsonb(x) INTO r FROM public.platform_releases x WHERE x.id=_id;
 ELSE RAISE EXCEPTION 'Unknown operations workspace'; END CASE;
 RETURN r;
END $$;
CREATE FUNCTION private.platform_ops_entity(_module text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE _module WHEN 'cases' THEN 'service_case' WHEN 'incidents' THEN 'platform_incident' WHEN 'segments' THEN 'platform_segment' WHEN 'releases' THEN 'platform_release' END;
$$;
CREATE FUNCTION private.platform_ops_list(_module text,_search text,_status text,_company uuid,_page integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source text; result jsonb; term text:=trim(coalesce(_search,'')); BEGIN
 PERFORM private.require_platform(private.platform_ops_permission(_module,false)); PERFORM private.platform_rate_limit();
 IF _page IS NULL OR _page NOT BETWEEN 0 AND 100000 OR length(term)>160 OR _status IS NULL OR length(_status)>40 THEN RAISE EXCEPTION 'Invalid list filters'; END IF;
 term:='%'||replace(replace(replace(term,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
 source:=CASE _module
 WHEN 'cases' THEN 'SELECT to_jsonb(c)||jsonb_build_object(''company_name'',co.name,''owner_name'',p.full_name) AS row,coalesce(c.updated_at,c.created_at) AS sort_at FROM public.platform_service_cases c JOIN public.companies co ON co.id=c.company_id LEFT JOIN public.profiles p ON p.id=c.owner_id WHERE ($3::uuid IS NULL OR c.company_id=$3)'
 WHEN 'incidents' THEN 'SELECT to_jsonb(i)||jsonb_build_object(''owner_name'',p.full_name) AS row,coalesce(i.updated_at,i.created_at) AS sort_at FROM public.platform_incidents i LEFT JOIN public.profiles p ON p.id=i.owner_id'
 WHEN 'segments' THEN 'SELECT to_jsonb(s)||jsonb_build_object(''status'',CASE WHEN s.archived_at IS NULL THEN ''active'' ELSE ''archived'' END,''members'',(SELECT count(*) FROM public.platform_segment_members m WHERE m.segment_id=s.id AND m.active)) AS row,coalesce(s.updated_at,s.created_at) AS sort_at FROM public.platform_segments s'
 WHEN 'releases' THEN 'SELECT to_jsonb(r) AS row,coalesce(r.updated_at,r.created_at) AS sort_at FROM public.platform_releases r' END;
 EXECUTE 'WITH source AS ('||source||'),filtered AS (SELECT * FROM source WHERE ($1=''%%'' OR row::text ILIKE $1 ESCAPE E''\\'') AND ($2=''all'' OR row->>''status''=$2 OR row->>''phase''=$2 OR row->>''stage''=$2)),page AS (SELECT row FROM filtered ORDER BY sort_at DESC,row->>''id'' LIMIT 25 OFFSET $4) SELECT jsonb_build_object(''rows'',coalesce((SELECT jsonb_agg(row) FROM page),''[]''::jsonb),''total'',(SELECT count(*) FROM filtered),''pageSize'',25)' INTO result USING term,_status,_company,_page*25;
 RETURN result;
END $$;
CREATE FUNCTION private.platform_ops_detail(_module text,_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb; timeline jsonb; BEGIN
 PERFORM private.require_platform(private.platform_ops_permission(_module,false)); PERFORM private.platform_rate_limit();
 r:=private.platform_ops_row(_module,_id); IF r IS NULL THEN RAISE EXCEPTION 'That operations record was not found'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) INTO timeline FROM (
 SELECT a.id::text,a.action,a.reason,a.after_state->>'note' AS note,a.actor_user_id AS actor_id,p.full_name AS actor_name,a.created_at AS at,
 (_module='segments' AND a.action='platform_segment.members' AND coalesce((a.after_state->>'changed')::integer,0)>0 AND (a.after_state->'record'->>'row_version')::integer=(r->>'row_version')::integer) AS undo_available
 FROM public.platform_audit a LEFT JOIN public.profiles p ON p.id=a.actor_user_id
 WHERE a.entity_type=private.platform_ops_entity(_module) AND a.entity_id=_id::text AND a.action<>'operations.view' ORDER BY a.created_at DESC,a.id DESC LIMIT 100) t;
 PERFORM private.platform_log('operations.view',private.platform_ops_entity(_module),_id::text,NULL,jsonb_build_object('timelineRows',jsonb_array_length(timeline)),'Read operations metadata');
 RETURN jsonb_build_object('record',r,'timeline',timeline);
END $$;
CREATE FUNCTION private.platform_ops_lookup(_kind text,_search text,_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE term text:=trim(coalesce(_search,'')); source text; result jsonb; BEGIN
 IF _kind='business' THEN IF NOT(private.platform_can('businesses.view') OR private.platform_can('support.manage')) THEN RAISE EXCEPTION 'Platform permission required' USING ERRCODE='42501'; END IF; source:='SELECT c.id,c.name AS label FROM public.companies c';
 ELSIF _kind='staff' THEN PERFORM private.require_platform('support.manage'); source:='SELECT u.id,coalesce(nullif(p.full_name,''''),u.email,u.id::text) AS label FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE private.platform_ops_staff_eligible(u.id)';
 ELSE RAISE EXCEPTION 'Unknown record lookup'; END IF;
 PERFORM private.platform_rate_limit(); IF _page IS NULL OR _page NOT BETWEEN 0 AND 100000 OR length(term)>160 THEN RAISE EXCEPTION 'Invalid lookup'; END IF;
 term:='%'||replace(replace(replace(term,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
 EXECUTE 'WITH source AS ('||source||'),filtered AS (SELECT * FROM source WHERE label ILIKE $1 ESCAPE E''\\'' OR id::text ILIKE $1 ESCAPE E''\\''),page AS (SELECT * FROM filtered ORDER BY lower(label),id LIMIT 25 OFFSET $2) SELECT jsonb_build_object(''rows'',coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page),''[]''::jsonb),''total'',(SELECT count(*) FROM filtered))' INTO result USING term,_page*25;
 RETURN result;
END $$;
CREATE FUNCTION private.platform_ops_apply(_command text,_payload jsonb,_reason text,_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE module text:=split_part(_command,'.',1); operation text:=split_part(_command,'.',2);
 rec_id uuid; prior jsonb; after_row jsonb; response jsonb; receipt private.platform_operation_receipts%ROWTYPE;
 allowed text[]; body jsonb; changed integer:=0; company uuid; states jsonb:='[]'::jsonb; old_member jsonb;
 log_before jsonb; log_after jsonb; event_id bigint; undo_event text; entry jsonb; original_before jsonb; original_after jsonb;
BEGIN
 PERFORM private.require_platform(private.platform_ops_permission(module,true)); PERFORM private.platform_rate_limit();
 IF _request_id IS NULL OR _payload IS NULL OR jsonb_typeof(_payload)<>'object' OR octet_length(_payload::text)>20000 OR length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Provide valid operation details, a request ID and a reason of 3 to 1000 characters'; END IF;
 allowed:=CASE _command
 WHEN 'cases.create' THEN ARRAY['company_id','subject','description','priority','phase','owner_id','due_at']
 WHEN 'cases.update' THEN ARRAY['id','row_version','subject','description','priority','phase','owner_id','due_at']
 WHEN 'cases.close' THEN ARRAY['id','row_version'] WHEN 'cases.reopen' THEN ARRAY['id','row_version'] WHEN 'cases.comment' THEN ARRAY['id','note']
 WHEN 'incidents.create' THEN ARRAY['title','description','severity','phase','owner_id','impact_started_at']
 WHEN 'incidents.update' THEN ARRAY['id','row_version','title','description','severity','phase','owner_id','impact_started_at']
 WHEN 'incidents.resolve' THEN ARRAY['id','row_version'] WHEN 'incidents.reopen' THEN ARRAY['id','row_version'] WHEN 'incidents.comment' THEN ARRAY['id','note']
 WHEN 'segments.create' THEN ARRAY['name'] WHEN 'segments.rename' THEN ARRAY['id','row_version','name']
 WHEN 'segments.archive' THEN ARRAY['id','row_version'] WHEN 'segments.restore' THEN ARRAY['id','row_version']
 WHEN 'segments.members' THEN ARRAY['id','row_version','company_ids','mode'] WHEN 'segments.undo' THEN ARRAY['id','row_version','event_id']
 WHEN 'releases.create' THEN ARRAY['version','title','summary'] WHEN 'releases.update' THEN ARRAY['id','row_version','title','summary']
 WHEN 'releases.evidence' THEN ARRAY['id','row_version','change_reference'] WHEN 'releases.rollback' THEN ARRAY['id','row_version','rollback_reference'] WHEN 'releases.comment' THEN ARRAY['id','note'] END;
 IF allowed IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(_payload) k WHERE NOT k=ANY(allowed)) THEN RAISE EXCEPTION 'Unknown operation or detail field'; END IF;
 body:=jsonb_build_object('details',_payload,'reason',trim(_reason));
 INSERT INTO private.platform_operation_receipts(actor_id,request_id,command,payload) VALUES(auth.uid(),_request_id,_command,body) ON CONFLICT DO NOTHING;
 SELECT * INTO receipt FROM private.platform_operation_receipts WHERE actor_id=auth.uid() AND request_id=_request_id FOR UPDATE;
 IF receipt.command<>_command OR receipt.payload<>body THEN RAISE EXCEPTION 'This request ID already belongs to different operation details'; END IF;
 IF receipt.result IS NOT NULL THEN RETURN receipt.result; END IF;
 IF operation='create' THEN rec_id:=gen_random_uuid();
 ELSE
  rec_id:=(_payload->>'id')::uuid; IF rec_id IS NULL THEN RAISE EXCEPTION 'Choose an operations record'; END IF;
  CASE module
   WHEN 'cases' THEN SELECT to_jsonb(x) INTO prior FROM public.platform_service_cases x WHERE x.id=rec_id FOR UPDATE;
   WHEN 'incidents' THEN SELECT to_jsonb(x) INTO prior FROM public.platform_incidents x WHERE x.id=rec_id FOR UPDATE;
   WHEN 'segments' THEN SELECT to_jsonb(x) INTO prior FROM public.platform_segments x WHERE x.id=rec_id FOR UPDATE;
   WHEN 'releases' THEN SELECT to_jsonb(x) INTO prior FROM public.platform_releases x WHERE x.id=rec_id FOR UPDATE;
  END CASE;
  IF prior IS NULL THEN RAISE EXCEPTION 'That operations record was not found'; END IF;
  IF operation<>'comment' AND ((_payload->>'row_version') IS NULL OR (prior->>'row_version')::integer IS DISTINCT FROM (_payload->>'row_version')::integer) THEN
   RAISE EXCEPTION 'This record changed. Reload the latest values before retrying' USING ERRCODE='40001'; END IF;
 END IF;
 IF operation='comment' THEN
  IF length(trim(coalesce(_payload->>'note',''))) NOT BETWEEN 1 AND 8000 THEN RAISE EXCEPTION 'Write a note of up to 8000 characters'; END IF;
  CASE module
   WHEN 'cases' THEN UPDATE public.platform_service_cases SET updated_at=now() WHERE platform_service_cases.id=rec_id;
   WHEN 'incidents' THEN UPDATE public.platform_incidents SET updated_at=now() WHERE platform_incidents.id=rec_id;
   WHEN 'releases' THEN UPDATE public.platform_releases SET updated_at=now() WHERE platform_releases.id=rec_id;
  END CASE;
 ELSE
 CASE _command
 WHEN 'cases.create' THEN
  INSERT INTO public.platform_service_cases(id,company_id,subject,status,opened_by,description,priority,phase,owner_id,due_at)
  VALUES(rec_id,(_payload->>'company_id')::uuid,trim(_payload->>'subject'),'open',auth.uid(),coalesce(_payload->>'description',''),coalesce(_payload->>'priority','untriaged'),coalesce(_payload->>'phase','triage'),(_payload->>'owner_id')::uuid,(_payload->>'due_at')::timestamptz);
 WHEN 'cases.update' THEN
  IF prior->>'status'<>'open' THEN RAISE EXCEPTION 'Reopen the case before editing its details'; END IF;
  UPDATE public.platform_service_cases SET subject=trim(_payload->>'subject'),description=coalesce(_payload->>'description',''),priority=_payload->>'priority',phase=_payload->>'phase',owner_id=(_payload->>'owner_id')::uuid,due_at=(_payload->>'due_at')::timestamptz WHERE platform_service_cases.id=rec_id;
 WHEN 'cases.close' THEN
  IF prior->>'status'<>'open' THEN RAISE EXCEPTION 'That case is no longer open'; END IF;
  UPDATE public.platform_service_cases SET status='closed' WHERE platform_service_cases.id=rec_id;
 WHEN 'cases.reopen' THEN
  IF prior->>'status'<>'closed' THEN RAISE EXCEPTION 'Only a closed case can be reopened'; END IF;
  UPDATE public.platform_service_cases SET status='open' WHERE platform_service_cases.id=rec_id;
 WHEN 'incidents.create' THEN
  INSERT INTO public.platform_incidents(id,title,status,opened_by,description,severity,phase,owner_id,impact_started_at)
  VALUES(rec_id,trim(_payload->>'title'),'open',auth.uid(),coalesce(_payload->>'description',''),coalesce(_payload->>'severity','unclassified'),coalesce(_payload->>'phase','investigating'),(_payload->>'owner_id')::uuid,(_payload->>'impact_started_at')::timestamptz);
 WHEN 'incidents.update' THEN
  IF prior->>'status'<>'open' THEN RAISE EXCEPTION 'Reopen the incident before editing its details'; END IF;
  UPDATE public.platform_incidents SET title=trim(_payload->>'title'),description=coalesce(_payload->>'description',''),severity=_payload->>'severity',phase=_payload->>'phase',owner_id=(_payload->>'owner_id')::uuid,impact_started_at=(_payload->>'impact_started_at')::timestamptz WHERE platform_incidents.id=rec_id;
 WHEN 'incidents.resolve' THEN
  IF prior->>'status'<>'open' THEN RAISE EXCEPTION 'That incident is no longer open'; END IF;
  UPDATE public.platform_incidents SET status='resolved',resolved_by=auth.uid() WHERE platform_incidents.id=rec_id;
 WHEN 'incidents.reopen' THEN
  IF prior->>'status'<>'resolved' THEN RAISE EXCEPTION 'Only a resolved incident can be reopened'; END IF;
  UPDATE public.platform_incidents SET status='open',resolved_by=NULL WHERE platform_incidents.id=rec_id;
 WHEN 'segments.create' THEN INSERT INTO public.platform_segments(id,name,created_by) VALUES(rec_id,trim(_payload->>'name'),auth.uid());
 WHEN 'segments.rename' THEN UPDATE public.platform_segments SET name=trim(_payload->>'name') WHERE platform_segments.id=rec_id;
 WHEN 'segments.archive' THEN
  IF prior->>'archived_at' IS NOT NULL THEN RAISE EXCEPTION 'That segment is already archived'; END IF;
  UPDATE public.platform_segments SET archived_at=now() WHERE platform_segments.id=rec_id;
 WHEN 'segments.restore' THEN
  IF prior->>'archived_at' IS NULL THEN RAISE EXCEPTION 'That segment is already active'; END IF;
  UPDATE public.platform_segments SET archived_at=NULL WHERE platform_segments.id=rec_id;
 WHEN 'segments.members' THEN
  IF prior->>'archived_at' IS NOT NULL THEN RAISE EXCEPTION 'Restore the segment before changing membership'; END IF;
  IF prior->>'archived_at' IS NOT NULL THEN RAISE EXCEPTION 'Restore the segment before changing its membership'; END IF;
  IF coalesce(_payload->>'mode','') NOT IN ('add','remove') OR jsonb_typeof(_payload->'company_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(_payload->'company_ids') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Choose add or remove and 1 to 100 businesses'; END IF;
  IF (SELECT count(DISTINCT v) FROM jsonb_array_elements_text(_payload->'company_ids') v)<>jsonb_array_length(_payload->'company_ids') THEN RAISE EXCEPTION 'Choose each business once'; END IF;
  FOR company IN SELECT v::uuid FROM jsonb_array_elements_text(_payload->'company_ids') v ORDER BY v LOOP
   IF NOT EXISTS(SELECT 1 FROM public.companies WHERE companies.id=company) THEN RAISE EXCEPTION 'A selected business was not found'; END IF;
   SELECT to_jsonb(m) INTO old_member FROM public.platform_segment_members m WHERE m.segment_id=rec_id AND m.company_id=company;
   IF coalesce((old_member->>'active')::boolean,false)=(_payload->>'mode'='add') THEN CONTINUE; END IF;
   states:=states||jsonb_build_array(jsonb_build_object('company_id',company,'active',coalesce((old_member->>'active')::boolean,false),'added_at',old_member->>'added_at'));
   INSERT INTO public.platform_segment_members(segment_id,company_id,active,added_at,removed_at)
   VALUES(rec_id,company,_payload->>'mode'='add',CASE WHEN _payload->>'mode'='add' THEN now() END,CASE WHEN _payload->>'mode'='remove' THEN now() END)
   ON CONFLICT(segment_id,company_id) DO UPDATE SET active=excluded.active,added_at=CASE WHEN excluded.active THEN now() ELSE platform_segment_members.added_at END,removed_at=excluded.removed_at;
   changed:=changed+1;
  END LOOP;
  IF changed>0 THEN UPDATE public.platform_segments SET updated_at=now() WHERE platform_segments.id=rec_id; END IF;
 WHEN 'segments.undo' THEN
  SELECT a.before_state,a.after_state INTO original_before,original_after FROM public.platform_audit a
   WHERE a.id=(_payload->>'event_id')::bigint AND a.entity_type='platform_segment' AND a.entity_id=rec_id::text AND a.action='platform_segment.members';
  IF original_before IS NULL OR (original_after->'record'->>'row_version')::integer IS DISTINCT FROM (prior->>'row_version')::integer OR coalesce((original_after->>'changed')::integer,0)<1 THEN RAISE EXCEPTION 'That membership change cannot be undone after another change'; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(original_before->'members') LOOP
   UPDATE public.platform_segment_members SET active=(entry->>'active')::boolean,added_at=(entry->>'added_at')::timestamptz,removed_at=CASE WHEN (entry->>'active')::boolean THEN NULL ELSE now() END
    WHERE segment_id=rec_id AND company_id=(entry->>'company_id')::uuid;
   changed:=changed+1;
  END LOOP;
  UPDATE public.platform_segments SET updated_at=now() WHERE platform_segments.id=rec_id;
 WHEN 'releases.create' THEN
  INSERT INTO public.platform_releases(id,version,created_by,title,summary,stage) VALUES(rec_id,_payload->>'version',auth.uid(),nullif(trim(_payload->>'title'),''),coalesce(_payload->>'summary',''),'planned');
 WHEN 'releases.update' THEN UPDATE public.platform_releases SET title=nullif(trim(_payload->>'title'),''),summary=coalesce(_payload->>'summary','') WHERE platform_releases.id=rec_id;
 WHEN 'releases.evidence' THEN
  IF prior->>'stage'<>'planned' THEN RAISE EXCEPTION 'Only a planned release can record change evidence'; END IF;
  IF length(trim(coalesce(_payload->>'change_reference',''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Record a change reference of 3 to 1000 characters'; END IF;
  UPDATE public.platform_releases SET change_reference=trim(_payload->>'change_reference'),stage='recorded' WHERE platform_releases.id=rec_id;
 WHEN 'releases.rollback' THEN
  IF prior->>'stage'<>'recorded' OR length(trim(coalesce(_payload->>'rollback_reference',''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Choose an evidence record and provide its rollback reference'; END IF;
  UPDATE public.platform_releases SET rollback_reference=trim(_payload->>'rollback_reference'),stage='rolled_back' WHERE platform_releases.id=rec_id;
 END CASE;
 END IF;
 after_row:=private.platform_ops_row(module,rec_id);
 log_before:=jsonb_build_object('record',prior,'members',states);
 log_after:=jsonb_build_object('record',after_row,'changed',changed,'note',CASE WHEN operation='comment' THEN trim(_payload->>'note') END);
 PERFORM private.platform_log(private.platform_ops_entity(module)||'.'||operation,private.platform_ops_entity(module),rec_id::text,log_before,log_after,trim(_reason));
 SELECT a.id INTO event_id FROM public.platform_audit a WHERE a.actor_user_id=auth.uid() AND a.entity_type=private.platform_ops_entity(module) AND a.entity_id=rec_id::text ORDER BY a.id DESC LIMIT 1;
 IF _command='segments.members' AND changed>0 THEN undo_event:=event_id::text; END IF;
 response:=jsonb_build_object('record',after_row,'changed',changed,'undoEvent',undo_event,'requestId',_request_id);
 UPDATE private.platform_operation_receipts SET result=response WHERE actor_id=auth.uid() AND request_id=_request_id;
 RETURN response;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'A matching open case, segment name or release version already exists';
END $$;
CREATE FUNCTION private.platform_ops_members(_id uuid,_search text,_page integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE term text:=trim(coalesce(_search,'')); response jsonb;
BEGIN
 PERFORM private.require_platform('businesses.view'); PERFORM private.platform_rate_limit();
 IF _page IS NULL OR _page NOT BETWEEN 0 AND 100000 OR length(term)>160 THEN RAISE EXCEPTION 'Invalid membership filters'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.platform_segments WHERE id=_id) THEN RAISE EXCEPTION 'That segment was not found'; END IF;
 term:='%'||replace(replace(replace(term,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
 WITH filtered AS (SELECT c.id,c.name AS label,m.added_at FROM public.platform_segment_members m JOIN public.companies c ON c.id=m.company_id WHERE m.segment_id=_id AND m.active AND (c.name ILIKE term ESCAPE E'\\' OR c.id::text ILIKE term ESCAPE E'\\')),
 page AS (SELECT * FROM filtered ORDER BY lower(label),id LIMIT 25 OFFSET _page*25)
 SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb),'total',(SELECT count(*) FROM filtered)) INTO response;
 RETURN response;
END $$;
CREATE FUNCTION public.platform_ops_context() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.platform_ops_context() $$;
CREATE FUNCTION public.platform_ops_list(_module text,_search text DEFAULT '',_status text DEFAULT 'all',_company uuid DEFAULT NULL,_page integer DEFAULT 0) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.platform_ops_list(_module,_search,_status,_company,_page) $$;
CREATE FUNCTION public.platform_ops_detail(_module text,_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.platform_ops_detail(_module,_id) $$;
CREATE FUNCTION public.platform_ops_lookup(_kind text,_search text DEFAULT '',_page integer DEFAULT 0) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.platform_ops_lookup(_kind,_search,_page) $$;
CREATE FUNCTION public.platform_ops_members(_id uuid,_search text DEFAULT '',_page integer DEFAULT 0) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.platform_ops_members(_id,_search,_page) $$;
CREATE FUNCTION public.platform_ops_apply(_command text,_payload jsonb,_reason text,_request_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.platform_ops_apply(_command,_payload,_reason,_request_id) $$;
-- Compatibility entry points use the same guarded operations. No parallel write path.
CREATE OR REPLACE FUNCTION public.platform_create_segment(_name text,_reason text) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT (private.platform_ops_apply('segments.create',jsonb_build_object('name',_name),_reason,gen_random_uuid())->'record'->>'id')::uuid $$;
CREATE OR REPLACE FUNCTION public.platform_tag_company(_segment_id uuid,_company_id uuid,_reason text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb; BEGIN
 r:=private.platform_ops_detail('segments',_segment_id)->'record';
 PERFORM private.platform_ops_apply('segments.members',jsonb_build_object('id',_segment_id,'row_version',r->'row_version','mode','add','company_ids',jsonb_build_array(_company_id)),_reason,gen_random_uuid());
END $$;
-- Explicit public ACLs are also checked by the repository migration audit.
REVOKE ALL ON FUNCTION public.platform_ops_context(),public.platform_ops_list(text,text,text,uuid,integer),public.platform_ops_detail(text,uuid),public.platform_ops_lookup(text,text,integer),public.platform_ops_members(uuid,text,integer),public.platform_ops_apply(text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated;
-- Revoke default EXECUTE explicitly, including private invoker helpers and trigger.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature,n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.proname LIKE 'platform_ops_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  IF f.proname IN ('platform_ops_context','platform_ops_list','platform_ops_detail','platform_ops_lookup','platform_ops_members','platform_ops_apply') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.platform_create_segment(text,text),public.platform_tag_company(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_create_segment(text,text),public.platform_tag_company(uuid,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
CREATE FUNCTION private.platform_ops_member_preview(_id uuid,_mode text,_company_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.platform_segments; rows jsonb;
BEGIN
 PERFORM private.require_platform('businesses.manage'); PERFORM private.platform_rate_limit();
 IF _mode IS NULL OR _mode NOT IN ('add','remove') OR _company_ids IS NULL OR cardinality(_company_ids) NOT BETWEEN 1 AND 100 OR array_position(_company_ids,NULL) IS NOT NULL OR (SELECT count(DISTINCT v) FROM unnest(_company_ids) v)<>cardinality(_company_ids) THEN RAISE EXCEPTION 'Choose add or remove and 1 to 100 distinct businesses'; END IF;
 SELECT * INTO r FROM public.platform_segments WHERE id=_id FOR SHARE;
 IF r.id IS NULL OR r.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Choose an active segment'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(_company_ids) v LEFT JOIN public.companies c ON c.id=v WHERE c.id IS NULL) THEN RAISE EXCEPTION 'A selected business was not found'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',c.id,'label',c.name,'changes',coalesce(m.active,false)<>(_mode='add')) ORDER BY lower(c.name),c.id)
 INTO rows FROM public.companies c LEFT JOIN public.platform_segment_members m ON m.company_id=c.id AND m.segment_id=_id WHERE c.id=ANY(_company_ids);
 RETURN jsonb_build_object('rowVersion',r.row_version,'rows',rows,'changed',(SELECT count(*) FROM jsonb_array_elements(rows) x WHERE (x->>'changes')::boolean));
END $$;
CREATE FUNCTION public.platform_ops_member_preview(_id uuid,_mode text,_company_ids uuid[]) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.platform_ops_member_preview(_id,_mode,_company_ids) $$;
REVOKE ALL ON FUNCTION private.platform_ops_member_preview(uuid,text,uuid[]),public.platform_ops_member_preview(uuid,text,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.platform_ops_member_preview(uuid,text,uuid[]),public.platform_ops_member_preview(uuid,text,uuid[]) TO authenticated;
