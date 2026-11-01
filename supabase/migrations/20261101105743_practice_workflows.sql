-- Practice work is operational evidence, never permission to post or lock a ledger.
CREATE TABLE public.practice_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 200),
 kind text NOT NULL CHECK(kind IN ('deadline','month_end')),
 period_end date,
 due_date date NOT NULL,
 status text NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','blocked','ready','completed')),
 assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 note text NOT NULL DEFAULT '' CHECK(length(note)<=4000),
 template_key text,
 prepared_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 completed_at timestamptz,
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK(kind<>'month_end' OR (period_end IS NOT NULL AND period_end=(date_trunc('month',period_end)+interval '1 month - 1 day')::date)),
 CHECK(status<>'ready' OR prepared_by IS NOT NULL),
 CHECK(status<>'completed' OR (prepared_by IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_by<>prepared_by AND completed_at IS NOT NULL)),
 UNIQUE(company_id,period_end,template_key)
);
CREATE INDEX practice_tasks_queue ON public.practice_tasks(company_id,due_date,id);
CREATE INDEX practice_tasks_assignee ON public.practice_tasks(assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX practice_tasks_preparer ON public.practice_tasks(prepared_by) WHERE prepared_by IS NOT NULL;
CREATE INDEX practice_tasks_reviewer ON public.practice_tasks(reviewed_by) WHERE reviewed_by IS NOT NULL;
CREATE INDEX practice_tasks_creator ON public.practice_tasks(created_by);
ALTER TABLE public.practice_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY practice_tasks_read ON public.practice_tasks FOR SELECT TO authenticated
 USING(public.has_company_permission(company_id,'accounting.view'));
REVOKE ALL ON public.practice_tasks FROM anon,authenticated;
GRANT SELECT ON public.practice_tasks TO authenticated;
CREATE POLICY mfa_aal2_required ON public.practice_tasks AS RESTRICTIVE FOR ALL TO authenticated
 USING((SELECT private.mfa_requirement_met())) WITH CHECK((SELECT private.mfa_requirement_met()));

-- No direct writes: transitions, optimistic versions and audit are one transaction.
CREATE FUNCTION public.save_practice_task(_company_id uuid,_payload jsonb) RETURNS jsonb
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
REVOKE ALL ON FUNCTION public.save_practice_task(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_practice_task(uuid,jsonb) TO authenticated;

CREATE FUNCTION public.bulk_practice_tasks(_items jsonb,_status text,_note text) RETURNS integer
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item jsonb; n integer:=0;
BEGIN
 IF jsonb_typeof(_items)<>'array' OR jsonb_array_length(_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Select between 1 and 100 tasks'; END IF;
 IF _status NOT IN ('in_progress','blocked','ready','completed') OR _status IS NULL THEN RAISE EXCEPTION 'Invalid bulk action'; END IF;
 IF (SELECT count(DISTINCT v->>'id') FROM jsonb_array_elements(_items) v)<>jsonb_array_length(_items) THEN RAISE EXCEPTION 'Duplicate task selection'; END IF;
 -- Ordered locks avoid inverse-order deadlocks; an exception rolls back every item.
 FOR item IN SELECT value FROM jsonb_array_elements(_items) ORDER BY value->>'id' LOOP
  PERFORM public.save_practice_task((item->>'company_id')::uuid,item||jsonb_build_object('status',_status,'note',_note)); n:=n+1;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.bulk_practice_tasks(jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bulk_practice_tasks(jsonb,text,text) TO authenticated;

CREATE FUNCTION public.create_month_end_work(_company_id uuid,_period_end date,_due_date date) RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE entry record; tid uuid; n integer:=0;
BEGIN
 IF auth.uid() IS NULL OR NOT private.mfa_requirement_met() OR NOT public.has_company_permission(_company_id,'accounting.post') THEN RAISE EXCEPTION 'Accounting management permission required' USING ERRCODE='42501'; END IF;
 IF _period_end IS NULL OR _due_date IS NULL OR _period_end<>(date_trunc('month',_period_end)+interval '1 month - 1 day')::date OR _due_date<_period_end THEN RAISE EXCEPTION 'Choose a month end and a deadline on or after it'; END IF;
 FOR entry IN SELECT * FROM (VALUES ('bank','Reconcile bank and cash accounts'),('ar','Tie receivables to the general ledger'),('ap','Tie payables to the general ledger'),
 ('adjustments','Review accruals, prepayments, depreciation and FX'),('tax','Review tax balances and filing obligations'),('reporting','Review financial statements and period-lock readiness')) v(key,title) LOOP
  tid:=NULL;
  INSERT INTO public.practice_tasks(company_id,title,kind,period_end,due_date,template_key,created_by)
  VALUES(_company_id,entry.title,'month_end',_period_end,_due_date,entry.key,auth.uid()) ON CONFLICT(company_id,period_end,template_key) DO NOTHING RETURNING id INTO tid;
  IF tid IS NOT NULL THEN n:=n+1; PERFORM public.record_audit_event(_company_id,'practice.month_end_create','practice_task',tid,jsonb_build_object('period_end',_period_end,'template',entry.key)); END IF;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.create_month_end_work(uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_month_end_work(uuid,date,date) TO authenticated;

CREATE FUNCTION public.practice_assignees(_company_id uuid) RETURNS TABLE(user_id uuid,name text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT m.user_id,coalesce(nullif(p.full_name,''),'Team member '||left(m.user_id::text,8)) FROM public.company_members m LEFT JOIN public.profiles p ON p.id=m.user_id
 WHERE auth.uid() IS NOT NULL AND private.mfa_requirement_met() AND public.has_company_permission(_company_id,'accounting.view') AND m.company_id=_company_id AND m.status='active' ORDER BY 2;
$$;
REVOKE ALL ON FUNCTION public.practice_assignees(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_assignees(uuid) TO authenticated;

-- Atomic bootstrap avoids an INSERT RETURNING hidden by the member-only firm SELECT policy.
CREATE FUNCTION public.create_practice_firm(_name text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE fid uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT private.customer_access_ok() OR NOT private.mfa_requirement_met() THEN RAISE EXCEPTION 'Valid sign-in required' USING ERRCODE='42501'; END IF;
 IF _name IS NULL OR length(trim(_name)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Firm name must contain 2 to 120 characters'; END IF;
 INSERT INTO public.firms(name,created_by) VALUES(trim(_name),auth.uid()) RETURNING id INTO fid;
 INSERT INTO public.firm_members(firm_id,user_id,role) VALUES(fid,auth.uid(),'owner');
 RETURN fid;
END $$;
REVOKE ALL ON FUNCTION public.create_practice_firm(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_practice_firm(text) TO authenticated;

-- Track only memberships this workflow actually created. Never claim legacy or independent access.
CREATE TABLE private.firm_access_grants (
 link_id uuid NOT NULL REFERENCES public.firm_client_links(id) ON DELETE CASCADE,
 member_id uuid NOT NULL REFERENCES public.company_members(id) ON DELETE CASCADE,
 granted_role public.company_role NOT NULL,
 member_updated_at timestamptz NOT NULL,
 PRIMARY KEY(link_id,member_id)
);
CREATE INDEX firm_access_grants_member ON private.firm_access_grants(member_id);
ALTER TABLE private.firm_access_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.firm_access_grants FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.manage_practice_client(_firm_id uuid,_company_id uuid,_access text,_revoke boolean DEFAULT false) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE link public.firm_client_links; m record; cm public.company_members; mapped public.company_role; n integer:=0; retained integer:=0;
BEGIN
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
   IF cm.id IS NOT NULL AND cm.role=m.granted_role AND cm.updated_at=m.member_updated_at AND NOT EXISTS(
    SELECT 1 FROM private.firm_access_grants g JOIN public.firm_client_links l ON l.id=g.link_id WHERE g.member_id=m.member_id AND l.revoked_at IS NULL AND l.id<>link.id) THEN
    DELETE FROM public.company_members WHERE id=m.member_id; n:=n+1;
   ELSE retained:=retained+1; END IF;
  END LOOP;
  DELETE FROM private.firm_access_grants WHERE link_id=link.id;
  -- Legacy access is deliberately retained because its provenance cannot be established.
  SELECT retained+count(*) INTO retained FROM public.company_members c JOIN public.firm_members f ON f.user_id=c.user_id WHERE c.company_id=_company_id AND f.firm_id=_firm_id;
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
REVOKE ALL ON FUNCTION public.manage_practice_client(uuid,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_practice_client(uuid,uuid,text,boolean) TO authenticated;
