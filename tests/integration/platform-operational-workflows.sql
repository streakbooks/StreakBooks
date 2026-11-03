-- Actual guarded SQL, synthetic identities only; existing MFA and revoked-session checks reused.
TRUNCATE private.platform_request_buckets;
CREATE TABLE fixture.operations(key text PRIMARY KEY,value jsonb);
GRANT ALL ON fixture.operations TO authenticated;
SET ROLE authenticated; SELECT fixture.login(5);
SELECT fixture.denied($q$SELECT public.platform_ops_context()$q$,'permission');
SELECT fixture.denied($q$SELECT public.platform_ops_list('cases')$q$,'Platform permission');
SELECT fixture.denied($q$SELECT public.platform_ops_apply('cases.create','{}','Tenant attempt',gen_random_uuid())$q$,'Platform permission');
SELECT fixture.denied($q$SELECT private.platform_ops_row('cases',gen_random_uuid())$q$,'permission denied');
SELECT fixture.login(1,'aal1');
SELECT fixture.denied($q$SELECT public.platform_ops_context()$q$,'permission');
SELECT fixture.login(2);
SELECT fixture.denied($q$SELECT public.platform_ops_context()$q$,'permission');
SELECT fixture.login(1);
DO $$ DECLARE r jsonb; replay jsonb; d jsonb; request uuid:=gen_random_uuid(); record_id uuid; BEGIN
 IF jsonb_array_length(public.platform_ops_context()->'modules')<>4 THEN RAISE EXCEPTION 'Owner context lost a module'; END IF;
 r:=public.platform_ops_apply('cases.create',jsonb_build_object('company_id','20000000-0000-4000-8000-000000000001','subject','Review fixture support','owner_id','00000000-0000-4000-8000-000000000003','priority','urgent','due_at',now()+interval '1 day'),'Customer requested assistance',request);
 replay:=public.platform_ops_apply('cases.create',jsonb_build_object('company_id','20000000-0000-4000-8000-000000000001','subject','Review fixture support','owner_id','00000000-0000-4000-8000-000000000003','priority','urgent','due_at',now()+interval '1 day'),'Customer requested assistance',request);
 IF r<>replay OR r->'record'->>'row_version'<>'1' THEN RAISE EXCEPTION 'Idempotent create failed'; END IF;
 INSERT INTO fixture.operations VALUES('case',r),('request',to_jsonb(request));
 record_id:=(r->'record'->>'id')::uuid;
 r:=public.platform_ops_apply('cases.close',jsonb_build_object('id',record_id,'row_version',1),'Resolution confirmed',gen_random_uuid());
 IF r->'record'->>'closed_at' IS NULL OR r->'record'->>'status'<>'closed' THEN RAISE EXCEPTION 'Close failed'; END IF;
 r:=public.platform_ops_apply('cases.reopen',jsonb_build_object('id',record_id,'row_version',2),'Customer follow-up received',gen_random_uuid());
 IF r->'record'->>'closed_at' IS NOT NULL OR r->'record'->>'status'<>'open' THEN RAISE EXCEPTION 'Reopen failed'; END IF;
 r:=public.platform_ops_apply('cases.comment',jsonb_build_object('id',record_id,'note','Internal context without financial access'),'Record follow-up',gen_random_uuid());
 d:=public.platform_ops_detail('cases',record_id);
 IF jsonb_array_length(d->'timeline')<>4 OR d->'timeline'->0->>'note'<>'Internal context without financial access' OR d->'record'->>'row_version'<>'4' THEN RAISE EXCEPTION 'Case timeline failed'; END IF;
 IF (public.platform_ops_list('cases','Review fixture','all',NULL,0)->>'total')::int<>1 THEN RAISE EXCEPTION 'Case list failed'; END IF;
END $$;
SELECT fixture.denied($q$SELECT public.platform_ops_apply('cases.close',jsonb_build_object('id',(SELECT value->'record'->>'id' FROM fixture.operations WHERE key='case'),'row_version',1),'Stale closure request',gen_random_uuid())$q$,'record changed');
SELECT fixture.denied($q$SELECT public.platform_ops_apply('cases.create',jsonb_build_object('company_id','20000000-0000-4000-8000-000000000001','subject','Invalid owner','owner_id','00000000-0000-4000-8000-000000000005'),'Invalid assignment',gen_random_uuid())$q$,'active platform support');
SELECT fixture.denied($q$SELECT public.platform_ops_apply('cases.create','{}','Changed request',(SELECT (value#>>'{}')::uuid FROM fixture.operations WHERE key='request'))$q$,'different operation');
SELECT fixture.denied($q$SELECT public.platform_ops_apply('cases.create','{"admin":true}','Field injection',gen_random_uuid())$q$,'Unknown operation');
DO $$ DECLARE r jsonb; seg uuid; event text; BEGIN
 r:=public.platform_ops_apply('segments.create','{"name":"Operational fixture"}','Create customer segment',gen_random_uuid()); seg:=(r->'record'->>'id')::uuid;
 r:=public.platform_ops_apply('segments.members',jsonb_build_object('id',seg,'row_version',1,'mode','add','company_ids',jsonb_build_array('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002')),'Previewed two businesses',gen_random_uuid());
 IF r->>'changed'<>'2' OR r->'record'->>'members'<>'2' THEN RAISE EXCEPTION 'Bulk add failed'; END IF;
 IF public.platform_ops_member_preview(seg,'remove',ARRAY['20000000-0000-4000-8000-000000000001'::uuid])->>'changed'<>'1' THEN RAISE EXCEPTION 'Preview did not count actual changes'; END IF;
 event:=r->>'undoEvent';
 r:=public.platform_ops_apply('segments.undo',jsonb_build_object('id',seg,'row_version',2,'event_id',event),'Undo original membership',gen_random_uuid());
 IF r->'record'->>'members'<>'0' THEN RAISE EXCEPTION 'Undo failed'; END IF;
 PERFORM public.platform_tag_company(seg,'20000000-0000-4000-8000-000000000001','Legacy entry restores soft membership');
 IF public.platform_ops_members(seg)->>'total'<>'1' THEN RAISE EXCEPTION 'Legacy tag did not restore membership'; END IF;
 r:=public.platform_ops_detail('segments',seg);
 INSERT INTO fixture.operations VALUES('segment',r);
 PERFORM public.platform_ops_apply('segments.archive',jsonb_build_object('id',seg,'row_version',4),'Retain historical segment',gen_random_uuid());
END $$;
SELECT fixture.denied($q$SELECT public.platform_ops_apply('segments.members',jsonb_build_object('id',(SELECT value->'record'->>'id' FROM fixture.operations WHERE key='segment'),'row_version',5,'mode','add','company_ids',jsonb_build_array('20000000-0000-4000-8000-000000000003')),'Archived segment refused',gen_random_uuid())$q$,'Restore the segment');
DO $$ DECLARE r jsonb; record_id uuid; BEGIN
 r:=public.platform_ops_apply('incidents.create','{"title":"Synthetic outage","severity":"major","phase":"investigating"}','Investigate actual observation',gen_random_uuid()); record_id:=(r->'record'->>'id')::uuid;
 r:=public.platform_ops_apply('incidents.resolve',jsonb_build_object('id',record_id,'row_version',1),'Recovery verified',gen_random_uuid());
 IF r->'record'->>'resolved_at' IS NULL THEN RAISE EXCEPTION 'Incident resolution missing'; END IF;
 r:=public.platform_ops_apply('incidents.reopen',jsonb_build_object('id',record_id,'row_version',2),'Observation repeated',gen_random_uuid());
 IF r->'record'->>'resolved_by' IS NOT NULL OR r->'record'->>'resolved_at' IS NOT NULL THEN RAISE EXCEPTION 'Incident reopen failed'; END IF;
 r:=public.platform_ops_apply('releases.create','{"version":"99.0.1","title":"Fixture release"}','Plan reviewed change',gen_random_uuid()); record_id:=(r->'record'->>'id')::uuid;
 IF r->'record'->>'stage'<>'planned' THEN RAISE EXCEPTION 'Release falsely recorded'; END IF;
 r:=public.platform_ops_apply('releases.evidence',jsonb_build_object('id',record_id,'row_version',1,'change_reference','Verified change evidence #123'),'Record actual evidence',gen_random_uuid());
 r:=public.platform_ops_apply('releases.rollback',jsonb_build_object('id',record_id,'row_version',2,'rollback_reference','Verified rollback #124'),'Recovery evidence recorded',gen_random_uuid());
 IF r->'record'->>'stage'<>'rolled_back' THEN RAISE EXCEPTION 'Rollback evidence missing'; END IF;
 IF public.platform_ops_lookup('business',chr(37)||chr(95)||chr(92),0)->>'total'<>'1' THEN RAISE EXCEPTION 'Lookup escaping failed'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.platform_ops_lookup('staff','',0)->'rows') x WHERE x->>'id' IN ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000006')) THEN RAISE EXCEPTION 'Staff eligibility leaked tenant/finance'; END IF;
END $$;
SELECT fixture.login(3);
DO $$ BEGIN
 IF jsonb_array_length(public.platform_ops_context()->'modules')<>3 THEN RAISE EXCEPTION 'Support workspace scope incorrect'; END IF;
END $$;
SELECT fixture.denied($q$SELECT public.platform_ops_list('releases')$q$,'Platform permission');
RESET ROLE;
DO $$ DECLARE f record; BEGIN
 IF (SELECT count(*) FROM public.platform_segment_members m JOIN public.platform_segments s ON s.id=m.segment_id WHERE s.name='Operational fixture')<>2 THEN RAISE EXCEPTION 'History deleted'; END IF;
 FOR f IN SELECT p.oid::regprocedure AS signature,n.nspname,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.proname LIKE 'platform_ops_%' LOOP
  IF has_function_privilege('anon',f.signature,'EXECUTE') OR (f.nspname='public' AND f.prosecdef) THEN RAISE EXCEPTION 'Unsafe operations ACL: %',f.signature; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.platform_audit WHERE entity_type='platform_release' AND after_state->'record'->>'stage'='rolled_back' AND reason IS NULL) THEN RAISE EXCEPTION 'Release audit missing'; END IF;
END $$;

SET ROLE authenticated; SELECT fixture.login(1);
SELECT fixture.denied($q$SELECT public.platform_ops_member_preview((SELECT (value->'record'->>'id')::uuid FROM fixture.operations WHERE key='segment'),'add',ARRAY[gen_random_uuid()])$q$,'active segment');
SELECT fixture.denied($q$SELECT public.platform_ops_apply('segments.undo',jsonb_build_object('id',(SELECT value->'record'->>'id' FROM fixture.operations WHERE key='segment'),'row_version',5,'event_id',(SELECT value->'timeline'->0->>'id' FROM fixture.operations WHERE key='segment')),'Stale undo refused',gen_random_uuid())$q$,'cannot be undone');
RESET ROLE;
