-- Harden direct RPC calls and retain independently adjusted memberships.
CREATE OR REPLACE FUNCTION public.manage_practice_client(_firm_id uuid,_company_id uuid,_access text,_revoke boolean DEFAULT false) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE link public.firm_client_links; m record; cm public.company_members; mapped public.company_role; n integer:=0; retained integer:=0;
BEGIN
 _revoke:=coalesce(_revoke,false);
 IF auth.uid() IS NULL OR NOT private.mfa_requirement_met() OR NOT public.is_firm_admin(_firm_id) THEN RAISE EXCEPTION 'Firm admin access required' USING ERRCODE='42501'; END IF;
 -- Company authorization is required for grants; revocation cannot remove independent memberships.
 IF NOT _revoke AND NOT public.has_company_permission(_company_id,'company.settings.edit') THEN RAISE EXCEPTION 'Client administrator authorization required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_company_id::text,17));
 SELECT * INTO link FROM public.firm_client_links WHERE firm_id=_firm_id AND company_id=_company_id FOR UPDATE;
 IF _revoke THEN
  IF link.id IS NULL THEN RAISE EXCEPTION 'Client link not found'; END IF;
  IF link.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('removed',0,'retained',0); END IF;
  UPDATE public.firm_client_links SET revoked_at=now() WHERE id=link.id;
  FOR m IN SELECT g.* FROM private.firm_access_grants g WHERE link_id=link.id ORDER BY member_id LOOP
   SELECT * INTO cm FROM public.company_members WHERE id=m.member_id FOR UPDATE;
   IF cm.id IS NOT NULL AND cm.role=m.granted_role AND cm.updated_at=m.member_updated_at AND NOT EXISTS(SELECT 1 FROM public.member_permission_adjustments WHERE company_id=_company_id AND user_id=cm.user_id) AND NOT EXISTS(
    SELECT 1 FROM private.firm_access_grants g JOIN public.firm_client_links l ON l.id=g.link_id WHERE g.member_id=m.member_id AND l.revoked_at IS NULL AND l.id<>link.id) THEN
    DELETE FROM public.company_members WHERE id=m.member_id; n:=n+1;
   ELSE retained:=retained+1; END IF;
  END LOOP;
  DELETE FROM private.firm_access_grants WHERE link_id=link.id;
  -- Legacy access is deliberately retained because its provenance cannot be established.
  SELECT count(*) INTO retained FROM public.company_members c JOIN public.firm_members f ON f.user_id=c.user_id WHERE c.company_id=_company_id AND f.firm_id=_firm_id;
  -- Audit insert is explicit: a firm administrator may no longer be a company member after revoke.
  INSERT INTO public.audit_events(company_id,actor_user_id,action,entity_type,entity_id,details) VALUES(_company_id,auth.uid(),'firm.client_revoke','firm_client_link',link.id,jsonb_build_object('firm_id',_firm_id,'removed',n,'retained',retained));
  RETURN jsonb_build_object('removed',n,'retained',retained);
 END IF;
 IF _access IS NULL OR _access NOT IN ('view','bookkeep','full') THEN RAISE EXCEPTION 'Invalid access level'; END IF;
 IF link.id IS NOT NULL AND link.revoked_at IS NULL AND link.access_level::text<>_access THEN RAISE EXCEPTION 'Revoke the existing link before changing its access level'; END IF;
 mapped:=CASE _access WHEN 'view' THEN 'read_only'::public.company_role WHEN 'bookkeep' THEN 'bookkeeper'::public.company_role ELSE 'accountant'::public.company_role END;
 INSERT INTO public.firm_client_links(firm_id,company_id,access_level,linked_by,revoked_at) VALUES(_firm_id,_company_id,_access::public.firm_access_level,auth.uid(),NULL)
 ON CONFLICT(firm_id,company_id) DO UPDATE SET access_level=excluded.access_level,linked_by=excluded.linked_by,revoked_at=NULL RETURNING * INTO link;
 FOR m IN SELECT user_id FROM public.firm_members WHERE firm_id=_firm_id ORDER BY user_id LOOP
  cm:=NULL;
  INSERT INTO public.company_members(company_id,user_id,role) VALUES(_company_id,m.user_id,mapped) ON CONFLICT(company_id,user_id) DO NOTHING RETURNING * INTO cm;
  IF cm.id IS NOT NULL THEN
   INSERT INTO private.firm_access_grants VALUES(link.id,cm.id,cm.role,cm.updated_at) ON CONFLICT DO NOTHING; n:=n+1;
  ELSE
   -- Shared managed access can be retained for a second active firm without overwriting its role.
   INSERT INTO private.firm_access_grants SELECT link.id,c.id,c.role,c.updated_at FROM public.company_members c WHERE c.company_id=_company_id AND c.user_id=m.user_id AND EXISTS(
    SELECT 1 FROM private.firm_access_grants g WHERE g.member_id=c.id AND g.granted_role=c.role AND g.member_updated_at=c.updated_at) ON CONFLICT DO NOTHING;
  END IF;
 END LOOP;
 PERFORM public.record_audit_event(_company_id,'firm.client_link','firm_client_link',link.id,jsonb_build_object('firm_id',_firm_id,'created_memberships',n,'access_level',_access));
 RETURN jsonb_build_object('id',link.id,'created',n);
END $$;

CREATE OR REPLACE FUNCTION public.save_practice_task(_company_id uuid,_payload jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.practice_tasks; old_t public.practice_tasks; new_status text; task_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT private.mfa_requirement_met() OR NOT public.has_company_permission(_company_id,'accounting.post') THEN
  RAISE EXCEPTION 'Accounting management permission and a valid session are required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_payload)<>'object' THEN RAISE EXCEPTION 'Invalid task payload'; END IF;
 task_id:=nullif(_payload->>'id','')::uuid;
 IF task_id IS NULL THEN
  INSERT INTO public.practice_tasks(company_id,title,kind,period_end,due_date,assignee_id,note,created_by)
  VALUES(_company_id,trim(_payload->>'title'),_payload->>'kind',nullif(_payload->>'period_end','')::date,
    (_payload->>'due_date')::date,nullif(_payload->>'assignee_id','')::uuid,coalesce(_payload->>'note',''),auth.uid()) RETURNING * INTO t;
 ELSE
  SELECT * INTO old_t FROM public.practice_tasks WHERE id=task_id AND company_id=_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found or inaccessible'; END IF;
  IF old_t.version IS DISTINCT FROM (_payload->>'version')::integer THEN RAISE EXCEPTION 'Task changed. Refresh before retrying' USING ERRCODE='40001'; END IF;
  t:=old_t;
  new_status:=coalesce(_payload->>'status',t.status);
  IF new_status<>t.status AND NOT (
    (t.status='todo' AND new_status IN ('in_progress','blocked')) OR
    (t.status='in_progress' AND new_status IN ('ready','blocked')) OR
    (t.status='blocked' AND new_status='in_progress') OR
    (t.status='ready' AND new_status IN ('completed','in_progress','blocked')) OR
    (t.status='completed' AND new_status='in_progress')
   ) THEN RAISE EXCEPTION 'Invalid task transition: % to %',t.status,new_status; END IF;
  IF t.status IN ('ready','completed') AND new_status=t.status THEN RAISE EXCEPTION 'Reopen this task before editing reviewed evidence'; END IF;
  IF t.status='ready' AND new_status='completed' AND (
    (_payload ? 'title' AND trim(_payload->>'title') IS DISTINCT FROM t.title) OR
    (_payload ? 'due_date' AND (_payload->>'due_date')::date IS DISTINCT FROM t.due_date) OR
    (_payload ? 'assignee_id' AND nullif(_payload->>'assignee_id','')::uuid IS DISTINCT FROM t.assignee_id)
   ) THEN RAISE EXCEPTION 'Reopen this task before changing reviewed work details'; END IF;
  t.note:=coalesce(_payload->>'note',t.note);
  IF new_status<>t.status AND new_status IN ('ready','completed','blocked','in_progress') AND length(trim(t.note))<3 THEN
   RAISE EXCEPTION 'Add an evidence note or reason before changing this task'; END IF;
  IF new_status='ready' AND new_status<>t.status THEN t.prepared_by:=auth.uid(); t.reviewed_by:=NULL; t.completed_at:=NULL; END IF;
  IF new_status='completed' AND new_status<>t.status THEN
   IF t.prepared_by=auth.uid() THEN RAISE EXCEPTION 'A different accountant must review and complete this work'; END IF;
   t.reviewed_by:=auth.uid(); t.completed_at:=now();
  END IF;
  IF new_status IN ('in_progress','blocked') AND new_status<>t.status THEN t.prepared_by:=NULL; t.reviewed_by:=NULL; t.completed_at:=NULL; END IF;
  UPDATE public.practice_tasks SET title=coalesce(trim(_payload->>'title'),t.title),due_date=coalesce((_payload->>'due_date')::date,t.due_date),
   assignee_id=CASE WHEN _payload ? 'assignee_id' THEN nullif(_payload->>'assignee_id','')::uuid ELSE t.assignee_id END,
   note=t.note,status=new_status,prepared_by=t.prepared_by,reviewed_by=t.reviewed_by,completed_at=t.completed_at,version=t.version+1,updated_at=clock_timestamp()
   WHERE id=t.id RETURNING * INTO t;
 END IF;
 IF t.assignee_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.company_members WHERE company_id=_company_id AND user_id=t.assignee_id AND status='active') THEN
  RAISE EXCEPTION 'Assignee must be an active member of this organisation'; END IF;
 PERFORM public.record_audit_event(_company_id,CASE WHEN task_id IS NULL THEN 'practice.task_create' ELSE 'practice.task_update' END,'practice_task',t.id,
  jsonb_build_object('before',CASE WHEN task_id IS NULL THEN NULL ELSE to_jsonb(old_t) END,'after',to_jsonb(t)));
 RETURN to_jsonb(t);
END $$;

CREATE POLICY firm_access_grants_no_direct_access ON private.firm_access_grants FOR ALL TO authenticated USING(false) WITH CHECK(false);
