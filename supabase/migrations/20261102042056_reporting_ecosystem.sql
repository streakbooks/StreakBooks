-- Reporting: additive metadata, explicit grants, immutable packs and durable delivery outbox.
-- Existing ledger_balances/report_* RPCs remain the authoritative accounting facts.
ALTER TABLE public.report_saved_views
 ADD COLUMN IF NOT EXISTS access_level text NOT NULL DEFAULT 'private' CHECK(access_level IN ('private','selected','company','firm')),
 ADD COLUMN IF NOT EXISTS firm_id uuid REFERENCES public.firms(id),
 ADD COLUMN IF NOT EXISTS modified_by uuid REFERENCES auth.users(id),
 ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK(version>0);

CREATE TABLE public.report_grants(
 view_id uuid NOT NULL REFERENCES public.report_saved_views(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 access text NOT NULL CHECK(access IN ('view','edit')),
 granted_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(view_id,user_id)
);
CREATE INDEX report_grants_user_idx ON public.report_grants(user_id,view_id);
ALTER TABLE public.report_grants ENABLE ROW LEVEL SECURITY;

-- Narrow boolean helper avoids recursive RLS. Only returns access to the current authenticated user.
CREATE FUNCTION private.report_access(_id uuid,_edit boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
 SELECT 1 FROM public.report_saved_views v WHERE v.id=_id
 AND public.has_company_permission(v.company_id,'reports.view') AND (
   v.user_id=auth.uid()
   OR (v.access_level='selected' AND EXISTS(SELECT 1 FROM public.report_grants g WHERE g.view_id=v.id AND g.user_id=auth.uid() AND (NOT _edit OR g.access='edit')))
   OR (NOT _edit AND v.access_level='company')
   OR (NOT _edit AND v.access_level='firm' AND EXISTS(
    SELECT 1 FROM public.firm_members fm JOIN public.firm_client_links fl ON fl.firm_id=fm.firm_id
    WHERE fm.user_id=auth.uid() AND fm.firm_id=v.firm_id AND fl.company_id=v.company_id AND fl.revoked_at IS NULL))
 ));
$$;
REVOKE ALL ON FUNCTION private.report_access(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.report_access(uuid,boolean) TO authenticated;
DROP POLICY IF EXISTS "Members manage own report views" ON public.report_saved_views;
CREATE POLICY report_views_read ON public.report_saved_views FOR SELECT TO authenticated USING(private.report_access(id,false));
CREATE POLICY report_views_insert ON public.report_saved_views FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND public.has_company_permission(company_id,'reports.view') AND access_level='private' AND firm_id IS NULL);
CREATE POLICY report_views_update ON public.report_saved_views FOR UPDATE TO authenticated USING(private.report_access(id,true)) WITH CHECK(private.report_access(id,true));
CREATE POLICY report_views_delete ON public.report_saved_views FOR DELETE TO authenticated USING(user_id=auth.uid() AND public.has_company_permission(company_id,'reports.view'));
CREATE POLICY report_grants_read ON public.report_grants FOR SELECT TO authenticated USING(private.report_access(view_id,false));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.report_saved_views TO authenticated;
GRANT SELECT ON public.report_grants TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.report_grants FROM authenticated,anon;

CREATE FUNCTION private.report_view_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(COALESCE(NEW.company_id,OLD.company_id),'reports.view') THEN RAISE EXCEPTION 'Report access denied' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.company_id<>OLD.company_id OR NEW.user_id<>OLD.user_id OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'Report ownership is immutable'; END IF;
  IF (NEW.access_level,NEW.firm_id) IS DISTINCT FROM (OLD.access_level,OLD.firm_id) AND current_setting('linkbooks.report_access_change',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Use set_report_access to change sharing' USING ERRCODE='42501'; END IF;
  NEW.version:=OLD.version+1;
 END IF;
 IF length(trim(NEW.name)) NOT BETWEEN 1 AND 80 OR jsonb_typeof(NEW.config)<>'object' OR octet_length(NEW.config::text)>100000 THEN RAISE EXCEPTION 'Invalid report configuration'; END IF;
 NEW.updated_at:=clock_timestamp();NEW.modified_by:=auth.uid();
 RETURN NEW;
END $$;
CREATE TRIGGER reporting_view_guard BEFORE INSERT OR UPDATE ON public.report_saved_views FOR EACH ROW EXECUTE FUNCTION private.report_view_guard();
CREATE FUNCTION private.report_view_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.record_audit_event(COALESCE(NEW.company_id,OLD.company_id),'report.'||lower(TG_OP),'saved_report',COALESCE(NEW.id,OLD.id),jsonb_build_object('name',COALESCE(NEW.name,OLD.name),'version',COALESCE(NEW.version,OLD.version)));
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER reporting_view_audit AFTER INSERT OR UPDATE OR DELETE ON public.report_saved_views FOR EACH ROW EXECUTE FUNCTION private.report_view_audit();
REVOKE ALL ON FUNCTION private.report_view_guard(),private.report_view_audit() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.set_report_access(_view_id uuid,_level text,_grants jsonb DEFAULT '[]',_firm_id uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.report_saved_views; g jsonb; old_setting text;
BEGIN
 SELECT * INTO v FROM public.report_saved_views WHERE id=_view_id FOR UPDATE;
 IF auth.uid() IS NULL OR v.user_id IS DISTINCT FROM auth.uid() OR NOT public.has_company_permission(v.company_id,'reports.export') THEN RAISE EXCEPTION 'Only the report owner with export permission may share it' USING ERRCODE='42501'; END IF;
 IF _level NOT IN ('private','selected','company','firm') OR jsonb_typeof(_grants)<>'array' OR jsonb_array_length(_grants)>100 THEN RAISE EXCEPTION 'Invalid report sharing'; END IF;
 IF _level='firm' AND NOT EXISTS(SELECT 1 FROM public.firm_members fm JOIN public.firm_client_links fl ON fl.firm_id=fm.firm_id WHERE fm.user_id=auth.uid() AND fm.firm_id=_firm_id AND fl.company_id=v.company_id AND fl.revoked_at IS NULL) THEN RAISE EXCEPTION 'Firm is not authorized for this client' USING ERRCODE='42501'; END IF;
 DELETE FROM public.report_grants WHERE view_id=_view_id;
 IF _level='selected' THEN
  FOR g IN SELECT value FROM jsonb_array_elements(_grants) LOOP
   IF g->>'access' NOT IN ('view','edit') OR NOT EXISTS(SELECT 1 FROM public.company_members WHERE company_id=v.company_id AND user_id=(g->>'userId')::uuid AND status='active') THEN RAISE EXCEPTION 'Recipients must be active members of this company'; END IF;
   INSERT INTO public.report_grants(view_id,user_id,access,granted_by) VALUES(_view_id,(g->>'userId')::uuid,g->>'access',auth.uid());
  END LOOP;
 END IF;
 old_setting:=current_setting('linkbooks.report_access_change',true);
 PERFORM set_config('linkbooks.report_access_change','on',true);
 UPDATE public.report_saved_views SET access_level=_level,firm_id=CASE WHEN _level='firm' THEN _firm_id END WHERE id=_view_id;
 PERFORM set_config('linkbooks.report_access_change',COALESCE(old_setting,''),true);
 PERFORM public.record_audit_event(v.company_id,'report.access_changed','saved_report',v.id,jsonb_build_object('access',_level,'recipients',jsonb_array_length(_grants)));
END $$;
REVOKE ALL ON FUNCTION public.set_report_access(uuid,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_report_access(uuid,text,jsonb,uuid) TO authenticated;
CREATE INDEX report_views_company_updated_idx ON public.report_saved_views(company_id,updated_at DESC,id);
CREATE INDEX report_views_company_name_idx ON public.report_saved_views(company_id,lower(name),id);

-- Captures only authoritative facts, in one database statement snapshot. Money is serialized as text
-- to retain int64 precision through JSON and JavaScript. Never accepts caller-supplied financial totals.
CREATE FUNCTION public.capture_reporting_facts(_company_id uuid,_from date,_to date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.companies; fy date; end_day integer; previous_end date; previous_from date; previous_to date; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company_id,'reports.view') THEN RAISE EXCEPTION 'Report access denied' USING ERRCODE='42501'; END IF;
 IF _from IS NULL OR _to IS NULL OR _from>_to OR _to-_from>3660 THEN RAISE EXCEPTION 'Choose a reporting range of no more than ten years'; END IF;
 SELECT * INTO STRICT c FROM public.companies WHERE id=_company_id;
 end_day:=LEAST(COALESCE(c.fiscal_year_end_day,31),extract(day FROM (make_date(extract(year FROM _to)::int,c.fiscal_year_end_month,1)+interval '1 month - 1 day'))::int);
 previous_end:=make_date(extract(year FROM _to)::int,c.fiscal_year_end_month,end_day);
 IF _to>previous_end THEN fy:=previous_end+1; ELSE
 end_day:=LEAST(COALESCE(c.fiscal_year_end_day,31),extract(day FROM (make_date(extract(year FROM _to)::int-1,c.fiscal_year_end_month,1)+interval '1 month - 1 day'))::int);
 fy:=make_date(extract(year FROM _to)::int-1,c.fiscal_year_end_month,end_day)+1;END IF;
 previous_to:=_from-1;previous_from:=_from-(_to-_from+1);
 SELECT jsonb_build_object('schemaVersion',1,'capturedAt',statement_timestamp(),'from',_from,'to',_to,'fyStart',fy,'priorFrom',previous_from,'priorTo',previous_to,
 'company',jsonb_build_object('id',c.id,'name',c.name,'baseCurrency',c.base_currency,'fyEndMonth',c.fiscal_year_end_month,'fyEndDay',c.fiscal_year_end_day),
 'accounts',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',a.id,'code',a.code,'name',a.name,'account_type',a.account_type,'subtype',a.subtype,'account_kind',a.account_kind,'system_key',a.system_key,'fs_line',a.fs_line,'cash_flow_class',a.cash_flow_class,'is_control',a.is_control,'is_active',a.is_active,'is_postable',a.is_postable,'show_on_dashboard_watchlist',a.show_on_dashboard_watchlist) ORDER BY a.code),'[]') FROM public.accounts a WHERE a.company_id=_company_id),
 'period',(SELECT COALESCE(jsonb_agg(jsonb_build_object('account_id',b.account_id,'debit_minor',b.debit_minor::text,'credit_minor',b.credit_minor::text,'line_count',b.line_count)),'[]') FROM public.ledger_balances(_company_id,_from,_to,true) b),
 'prior',(SELECT COALESCE(jsonb_agg(jsonb_build_object('account_id',b.account_id,'debit_minor',b.debit_minor::text,'credit_minor',b.credit_minor::text,'line_count',b.line_count)),'[]') FROM public.ledger_balances(_company_id,previous_from,previous_to,true) b),
 'bsPrior',(SELECT COALESCE(jsonb_agg(jsonb_build_object('account_id',b.account_id,'debit_minor',b.debit_minor::text,'credit_minor',b.credit_minor::text,'line_count',b.line_count)),'[]') FROM public.ledger_balances(_company_id,NULL,fy-1,false) b),
 'bsCurrent',(SELECT COALESCE(jsonb_agg(jsonb_build_object('account_id',b.account_id,'debit_minor',b.debit_minor::text,'credit_minor',b.credit_minor::text,'line_count',b.line_count)),'[]') FROM public.ledger_balances(_company_id,fy,_to,false) b),
 'cash',(SELECT COALESCE(jsonb_agg(jsonb_build_object('bank_account_id',b.bank_account_id,'bank_account_name',b.bank_account_name,'gl_account_id',b.gl_account_id,'gl_account_code',b.gl_account_code,'opening_minor',b.opening_minor::text,'received_minor',b.received_minor::text,'spent_minor',b.spent_minor::text,'transfers_in_minor',b.transfers_in_minor::text,'transfers_out_minor',b.transfers_out_minor::text,'closing_minor',b.closing_minor::text)),'[]') FROM public.report_cash_summary(_company_id,_from,_to) b)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.capture_reporting_facts(uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.capture_reporting_facts(uuid,date,date) TO authenticated;

CREATE FUNCTION public.capture_custom_report_facts(_company_id uuid,_from date,_to date,_definition jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; cols jsonb:='[]'; col jsonb; d1 date; d2 date; balances jsonb;
BEGIN
 IF jsonb_typeof(_definition)<>'object' OR octet_length(_definition::text)>100000 OR jsonb_typeof(_definition->'columns')<>'array' OR jsonb_array_length(_definition->'columns') NOT BETWEEN 1 AND 24 THEN RAISE EXCEPTION 'Invalid custom report definition'; END IF;
 result:=public.capture_reporting_facts(_company_id,_from,_to);
 FOR col IN SELECT value FROM jsonb_array_elements(_definition->'columns') LOOP
  d1:=_from;d2:=_to;
  CASE col->>'mode'
   WHEN 'period' THEN NULL;
   WHEN 'prior_period' THEN d2:=_from-1;d1:=_from-(_to-_from+1);
   WHEN 'prior_year' THEN d1:=(_from-interval '1 year')::date;d2:=(_to-interval '1 year')::date;
   WHEN 'month' THEN
    IF abs(COALESCE((col->>'monthOffset')::integer,0))>120 THEN RAISE EXCEPTION 'Month offset exceeds ten years'; END IF;
    d1:=(date_trunc('month',_from)+make_interval(months=>COALESCE((col->>'monthOffset')::integer,0)))::date;d2:=(d1+interval '1 month - 1 day')::date;
   WHEN 'fixed' THEN d1:=(col->>'from')::date;d2:=(col->>'to')::date;
   ELSE RAISE EXCEPTION 'Unsupported report column';
  END CASE;
  IF d1 IS NULL OR d2 IS NULL OR d1>d2 OR d2-d1>3660 THEN RAISE EXCEPTION 'Invalid column period';END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('account_id',b.account_id,'debit_minor',b.debit_minor::text,'credit_minor',b.credit_minor::text,'line_count',b.line_count)),'[]') INTO balances FROM public.ledger_balances(_company_id,d1,d2,true) b;
  cols:=cols||jsonb_build_array(jsonb_build_object('id',col->>'id','from',d1,'to',d2,'balances',balances));
 END LOOP;
 RETURN result||jsonb_build_object('customColumns',cols);
END $$;
REVOKE ALL ON FUNCTION public.capture_custom_report_facts(uuid,date,date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.capture_custom_report_facts(uuid,date,date,jsonb) TO authenticated;


CREATE TABLE public.report_packs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL REFERENCES auth.users(id),name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 from_date date NOT NULL,to_date date NOT NULL CHECK(to_date>=from_date),
 config jsonb NOT NULL DEFAULT '{}',status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_progress','ready_for_review','review_required','approved','published','delivered','archived')),
 previous_status text, reviewer_id uuid REFERENCES auth.users(id),preparer_id uuid REFERENCES auth.users(id),
 snapshot jsonb, snapshot_hash text, prepared_by uuid REFERENCES auth.users(id),approved_by uuid REFERENCES auth.users(id),approved_at timestamptz,published_at timestamptz,
 version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),modified_by uuid REFERENCES auth.users(id),
 CHECK(jsonb_typeof(config)='object' AND octet_length(config::text)<=100000)
);
CREATE INDEX report_packs_company_status_idx ON public.report_packs(company_id,status,updated_at DESC);
ALTER TABLE public.report_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_packs_read ON public.report_packs FOR SELECT TO authenticated USING(public.has_company_permission(company_id,'reports.view'));
GRANT SELECT ON public.report_packs TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.report_packs FROM authenticated,anon;

CREATE TABLE public.report_comments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),pack_id uuid NOT NULL REFERENCES public.report_packs(id) ON DELETE CASCADE,
 company_id uuid NOT NULL REFERENCES public.companies(id),author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 4000),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_comments_pack_idx ON public.report_comments(pack_id,created_at);
ALTER TABLE public.report_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_comments_read ON public.report_comments FOR SELECT TO authenticated USING(public.has_company_permission(company_id,'reports.view'));
CREATE POLICY report_comments_insert ON public.report_comments FOR INSERT TO authenticated WITH CHECK(author_id=auth.uid() AND public.has_company_permission(company_id,'reports.view') AND EXISTS(SELECT 1 FROM public.report_packs p WHERE p.id=pack_id AND p.company_id=report_comments.company_id));
GRANT SELECT,INSERT ON public.report_comments TO authenticated;

CREATE FUNCTION public.save_report_pack(_company_id uuid,_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.report_packs; id uuid; reviewer uuid; preparer uuid; cfg jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company_id,'accounting.post') OR NOT public.has_company_permission(_company_id,'reports.view') THEN RAISE EXCEPTION 'Report preparation permission required' USING ERRCODE='42501'; END IF;
 reviewer:=NULLIF(_payload->>'reviewerId','')::uuid;preparer:=NULLIF(_payload->>'preparerId','')::uuid;
 IF reviewer IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.company_members WHERE company_id=_company_id AND user_id=reviewer AND status='active' AND role IN ('owner','admin','accountant')) THEN RAISE EXCEPTION 'Reviewer must be an active owner, admin or accountant for this company'; END IF;
 IF preparer IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.company_members WHERE company_id=_company_id AND user_id=preparer AND status='active') THEN RAISE EXCEPTION 'Preparer must be an active company member'; END IF;
 cfg:=COALESCE(_payload->'config','{}');
 IF NOT cfg ? 'reports' OR jsonb_typeof(cfg->'reports')<>'array' OR jsonb_array_length(cfg->'reports') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Select one to twenty pack reports'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(cfg->'reports') x WHERE x NOT IN ('profit-and-loss','balance-sheet','trial-balance','cash-summary','cash-flow-indirect')) THEN RAISE EXCEPTION 'Unsupported pack report'; END IF;
 IF _payload ? 'id' THEN
  SELECT * INTO p FROM public.report_packs WHERE report_packs.id=(_payload->>'id')::uuid AND company_id=_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pack not found' USING ERRCODE='42501'; END IF;
  IF p.version<>(_payload->>'version')::int THEN RAISE EXCEPTION 'Pack changed; refresh before editing' USING ERRCODE='40001'; END IF;
  IF p.status NOT IN ('draft','in_progress','review_required') THEN RAISE EXCEPTION 'This pack is locked; duplicate it to prepare a new revision'; END IF;
  IF p.owner_id<>auth.uid() AND p.preparer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only owner or assigned preparer can edit' USING ERRCODE='42501'; END IF;
  UPDATE public.report_packs SET name=trim(_payload->>'name'),from_date=(_payload->>'from')::date,to_date=(_payload->>'to')::date,config=cfg,reviewer_id=reviewer,preparer_id=preparer,version=version+1,updated_at=clock_timestamp(),modified_by=auth.uid(),snapshot=NULL,snapshot_hash=NULL WHERE report_packs.id=p.id RETURNING report_packs.id INTO id;
 ELSE
  INSERT INTO public.report_packs(company_id,owner_id,name,from_date,to_date,config,reviewer_id,preparer_id,modified_by) VALUES(_company_id,auth.uid(),trim(_payload->>'name'),(_payload->>'from')::date,(_payload->>'to')::date,cfg,reviewer,preparer,auth.uid()) RETURNING report_packs.id INTO id;
 END IF;
 PERFORM public.record_audit_event(_company_id,'report.pack_saved','report_pack',id,jsonb_build_object('name',_payload->>'name'));
 RETURN id;
END $$;
REVOKE ALL ON FUNCTION public.save_report_pack(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_report_pack(uuid,jsonb) TO authenticated;

CREATE FUNCTION public.transition_report_pack(_id uuid,_version integer,_action text,_note text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.report_packs; next_status text; facts jsonb;
BEGIN
 SELECT * INTO p FROM public.report_packs WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT public.has_company_permission(p.company_id,'reports.view') OR NOT public.has_company_permission(p.company_id,'accounting.post') THEN RAISE EXCEPTION 'Pack access denied' USING ERRCODE='42501'; END IF;
 IF p.version<>_version THEN RAISE EXCEPTION 'Pack changed; refresh before retrying' USING ERRCODE='40001'; END IF;
 IF _action IN ('approve','request_changes') THEN
  IF p.status<>'ready_for_review' OR p.reviewer_id IS DISTINCT FROM auth.uid() OR p.prepared_by=auth.uid() THEN RAISE EXCEPTION 'An assigned independent reviewer is required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.company_members WHERE company_id=p.company_id AND user_id=auth.uid() AND status='active' AND role IN ('owner','admin','accountant')) THEN RAISE EXCEPTION 'Reviewer role required' USING ERRCODE='42501'; END IF;
 ELSE
  IF p.owner_id<>auth.uid() AND p.preparer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Owner or preparer required' USING ERRCODE='42501'; END IF;
 END IF;
 CASE _action
 WHEN 'start' THEN IF p.status<>'draft' THEN RAISE EXCEPTION 'Only drafts can start'; END IF;next_status:='in_progress';
 WHEN 'submit' THEN
  IF p.status NOT IN ('draft','in_progress','review_required') OR p.reviewer_id IS NULL OR p.reviewer_id=auth.uid() THEN RAISE EXCEPTION 'Choose a different reviewer before submitting'; END IF;
  facts:=public.capture_reporting_facts(p.company_id,p.from_date,p.to_date);next_status:='ready_for_review';
 WHEN 'approve' THEN next_status:='approved';
 WHEN 'request_changes' THEN IF length(trim(_note))=0 THEN RAISE EXCEPTION 'Explain the requested changes'; END IF;next_status:='review_required';
 WHEN 'publish' THEN IF p.status<>'approved' THEN RAISE EXCEPTION 'Only approved packs can be published'; END IF;next_status:='published';
 WHEN 'archive' THEN IF p.status='archived' THEN RAISE EXCEPTION 'Already archived'; END IF;next_status:='archived';
 WHEN 'restore' THEN IF p.status<>'archived' THEN RAISE EXCEPTION 'Only archived packs can be restored'; END IF;next_status:=p.previous_status;
 ELSE RAISE EXCEPTION 'Unsupported pack action';
 END CASE;
 UPDATE public.report_packs SET status=next_status,previous_status=CASE WHEN _action='archive' THEN p.status ELSE previous_status END,
 snapshot=CASE WHEN _action='submit' THEN facts ELSE snapshot END,
 snapshot_hash=CASE WHEN _action='submit' THEN encode(extensions.digest(convert_to(facts::text||p.config::text,'UTF8'),'sha256'),'hex') ELSE snapshot_hash END,
 prepared_by=CASE WHEN _action='submit' THEN auth.uid() ELSE prepared_by END,
 approved_by=CASE WHEN _action='approve' THEN auth.uid() ELSE approved_by END,
 approved_at=CASE WHEN _action='approve' THEN now() ELSE approved_at END,
 published_at=CASE WHEN _action='publish' THEN now() ELSE published_at END,
 version=version+1,modified_by=auth.uid(),updated_at=clock_timestamp() WHERE id=_id;
 IF length(trim(_note))>0 THEN INSERT INTO public.report_comments(pack_id,company_id,author_id,body) VALUES(p.id,p.company_id,auth.uid(),left(trim(_note),4000));END IF;
 PERFORM public.record_audit_event(p.company_id,'report.pack_'||_action,'report_pack',p.id,jsonb_build_object('from',p.status,'to',next_status,'snapshot_hash',p.snapshot_hash));
END $$;
REVOKE ALL ON FUNCTION public.transition_report_pack(uuid,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transition_report_pack(uuid,integer,text,text) TO authenticated;

-- Versioned assumptions and dashboard/firm templates hold configuration, not financial results.
CREATE TABLE public.report_models(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),kind text NOT NULL CHECK(kind IN ('dashboard','forecast','pack_template')),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),config jsonb NOT NULL,
 version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(jsonb_typeof(config)='object' AND octet_length(config::text)<=100000)
);
CREATE INDEX report_models_company_owner_idx ON public.report_models(company_id,owner_id,kind);
ALTER TABLE public.report_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_models_owner ON public.report_models FOR ALL TO authenticated USING(owner_id=auth.uid() AND public.has_company_permission(company_id,'reports.view')) WITH CHECK(owner_id=auth.uid() AND public.has_company_permission(company_id,'reports.view'));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.report_models TO authenticated;

CREATE TABLE public.report_schedules(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL REFERENCES auth.users(id),view_id uuid REFERENCES public.report_saved_views(id) ON DELETE CASCADE,pack_id uuid REFERENCES public.report_packs(id) ON DELETE CASCADE,
 recipients jsonb NOT NULL,subject text NOT NULL CHECK(length(trim(subject)) BETWEEN 1 AND 200),message text NOT NULL DEFAULT '',
 recurrence text NOT NULL CHECK(recurrence IN ('daily','weekly','monthly','quarterly')),period text NOT NULL DEFAULT 'previous_month' CHECK(period IN ('previous_month','previous_quarter','year_to_date')),
 timezone text NOT NULL DEFAULT 'UTC',next_run_at timestamptz NOT NULL,end_at timestamptz,enabled boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(num_nonnulls(view_id,pack_id)=1),CHECK(jsonb_typeof(recipients)='array' AND jsonb_array_length(recipients) BETWEEN 1 AND 25)
);
CREATE INDEX report_schedules_due_idx ON public.report_schedules(next_run_at) WHERE enabled;
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_schedules_read ON public.report_schedules FOR SELECT TO authenticated USING(owner_id=auth.uid() AND public.has_company_permission(company_id,'reports.export'));
GRANT SELECT ON public.report_schedules TO authenticated;

CREATE TABLE public.report_deliveries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.companies(id),owner_id uuid NOT NULL REFERENCES auth.users(id),
 pack_id uuid REFERENCES public.report_packs(id),view_id uuid REFERENCES public.report_saved_views(id),schedule_id uuid REFERENCES public.report_schedules(id) ON DELETE SET NULL,
 scheduled_for timestamptz,recipients jsonb NOT NULL,subject text NOT NULL,message text NOT NULL DEFAULT '',facts jsonb NOT NULL,definition jsonb NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','accepted','delivered','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0,lease_until timestamptz,provider_id text,last_error text,next_attempt_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(schedule_id,scheduled_for),CHECK(num_nonnulls(pack_id,view_id)=1)
);
CREATE INDEX report_deliveries_pending_idx ON public.report_deliveries(next_attempt_at) WHERE status IN ('queued','sending');
CREATE INDEX report_deliveries_company_idx ON public.report_deliveries(company_id,created_at DESC);
ALTER TABLE public.report_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_deliveries_read ON public.report_deliveries FOR SELECT TO authenticated USING(owner_id=auth.uid() AND public.has_company_permission(company_id,'reports.export'));
GRANT SELECT ON public.report_deliveries TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.report_schedules,public.report_deliveries FROM authenticated,anon;

-- All RPCs below validate the current requester. Only the outbox worker may change delivery status.
CREATE FUNCTION public.queue_report_delivery(_company_id uuid,_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.report_packs; v public.report_saved_views; facts jsonb; definition jsonb; id uuid; recipient text; recipients jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company_id,'reports.export') THEN RAISE EXCEPTION 'Report export permission required' USING ERRCODE='42501'; END IF;
 recipients:=_payload->'recipients';
 IF jsonb_typeof(recipients)<>'array' OR jsonb_array_length(recipients) NOT BETWEEN 1 AND 25 OR length(trim(_payload->>'subject')) NOT BETWEEN 1 AND 200 OR length(COALESCE(_payload->>'message',''))>10000 THEN RAISE EXCEPTION 'Invalid delivery message'; END IF;
 FOR recipient IN SELECT jsonb_array_elements_text(recipients) LOOP IF recipient !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' OR length(recipient)>254 THEN RAISE EXCEPTION 'Invalid recipient address'; END IF;END LOOP;
 IF _payload ? 'packId' THEN
  SELECT * INTO p FROM public.report_packs WHERE report_packs.id=(_payload->>'packId')::uuid AND company_id=_company_id FOR UPDATE;
  IF NOT FOUND OR p.status NOT IN ('published','delivered') OR p.owner_id<>auth.uid() THEN RAISE EXCEPTION 'Only the owner can deliver a published pack' USING ERRCODE='42501'; END IF;
  facts:=p.snapshot;definition:=jsonb_build_object('name',p.name,'config',p.config);
 ELSE
  SELECT * INTO v FROM public.report_saved_views WHERE report_saved_views.id=(_payload->>'viewId')::uuid AND company_id=_company_id;
  IF NOT FOUND OR NOT private.report_access(v.id,false) OR v.user_id<>auth.uid() THEN RAISE EXCEPTION 'Only the report owner can deliver this report' USING ERRCODE='42501'; END IF;
  IF v.report_id NOT IN ('profit-and-loss','balance-sheet','trial-balance','cash-summary','cash-flow-indirect') AND NOT (v.config ? '_builder') THEN RAISE EXCEPTION 'Email export is not supported for this report type'; END IF;
  facts:=CASE WHEN v.config ? '_builder' THEN public.capture_custom_report_facts(_company_id,(_payload->>'from')::date,(_payload->>'to')::date,v.config->'_builder') ELSE public.capture_reporting_facts(_company_id,(_payload->>'from')::date,(_payload->>'to')::date) END;
  definition:=jsonb_build_object('name',v.name,'reportId',v.report_id,'config',v.config);
 END IF;
 INSERT INTO public.report_deliveries(company_id,owner_id,pack_id,view_id,recipients,subject,message,facts,definition)
 VALUES(_company_id,auth.uid(),p.id,v.id,recipients,trim(_payload->>'subject'),COALESCE(_payload->>'message',''),facts,definition) RETURNING report_deliveries.id INTO id;
 PERFORM public.record_audit_event(_company_id,'report.delivery_queued','report_delivery',id,jsonb_build_object('pack_id',p.id,'view_id',v.id,'recipient_count',jsonb_array_length(recipients)));
 RETURN id;
END $$;
REVOKE ALL ON FUNCTION public.queue_report_delivery(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.queue_report_delivery(uuid,jsonb) TO authenticated;

CREATE FUNCTION public.save_report_schedule(_company_id uuid,_payload jsonb) RETURNS uuid
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
  UPDATE public.report_schedules SET recipients=_payload->'recipients',subject=trim(_payload->>'subject'),message=COALESCE(_payload->>'message',''),recurrence=_payload->>'recurrence',period=COALESCE(_payload->>'period','previous_month'),timezone=COALESCE(_payload->>'timezone','UTC'),next_run_at=(_payload->>'nextRunAt')::timestamptz,end_at=NULLIF(_payload->>'endAt','')::timestamptz,enabled=COALESCE((_payload->>'enabled')::boolean,true),version=version+1,updated_at=clock_timestamp() WHERE report_schedules.id=s.id RETURNING report_schedules.id INTO id;
 ELSE
  INSERT INTO public.report_schedules(company_id,owner_id,view_id,pack_id,recipients,subject,message,recurrence,period,timezone,next_run_at,end_at,enabled) VALUES(_company_id,auth.uid(),v.id,p.id,_payload->'recipients',trim(_payload->>'subject'),COALESCE(_payload->>'message',''),_payload->>'recurrence',COALESCE(_payload->>'period','previous_month'),COALESCE(_payload->>'timezone','UTC'),(_payload->>'nextRunAt')::timestamptz,NULLIF(_payload->>'endAt','')::timestamptz,COALESCE((_payload->>'enabled')::boolean,true)) RETURNING report_schedules.id INTO id;
 END IF;
 PERFORM public.record_audit_event(_company_id,'report.schedule_saved','report_schedule',id,'{}');RETURN id;
END $$;
REVOKE ALL ON FUNCTION public.save_report_schedule(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_report_schedule(uuid,jsonb) TO authenticated;

CREATE FUNCTION public.delete_report_schedule(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.report_schedules;
BEGIN SELECT * INTO s FROM public.report_schedules WHERE id=_id AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR NOT public.has_company_permission(s.company_id,'reports.export') THEN RAISE EXCEPTION 'Schedule access denied' USING ERRCODE='42501';END IF;
 DELETE FROM public.report_schedules WHERE id=_id;PERFORM public.record_audit_event(s.company_id,'report.schedule_deleted','report_schedule',_id,'{}');END $$;
REVOKE ALL ON FUNCTION public.delete_report_schedule(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_report_schedule(uuid) TO authenticated;

-- Column-level privileges prevent clients from spoofing ownership/sharing/audit fields even via SQL.
REVOKE UPDATE ON public.report_saved_views FROM authenticated;
GRANT UPDATE(name,config,is_favourite,updated_at) ON public.report_saved_views TO authenticated;

-- Scheduler/worker functions are service-role-only. Ownership and permission are rechecked for every run.
CREATE FUNCTION public.enqueue_due_report_schedules(_now timestamptz DEFAULT now()) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.report_schedules; p public.report_packs; v public.report_saved_views; payload jsonb; queued uuid; count integer:=0; d1 date;d2 date; old_claims text;old_sub text;local_now timestamp;due timestamptz;new_due timestamptz;
BEGIN
 old_claims:=current_setting('request.jwt.claims',true);old_sub:=current_setting('request.jwt.claim.sub',true);
 FOR s IN SELECT * FROM public.report_schedules WHERE enabled AND next_run_at<=_now ORDER BY next_run_at,id LIMIT 50 FOR UPDATE SKIP LOCKED LOOP
  due:=s.next_run_at;
  IF s.end_at IS NOT NULL AND due>s.end_at THEN UPDATE public.report_schedules SET enabled=false WHERE id=s.id;CONTINUE;END IF;
  BEGIN
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',s.owner_id,'role','authenticated','aal','aal2')::text,true);
   PERFORM set_config('request.jwt.claim.sub',s.owner_id::text,true);
   local_now:=due AT TIME ZONE s.timezone;
   d2:=date_trunc('month',local_now)::date-1;d1:=date_trunc('month',d2)::date;
   IF s.period='previous_quarter' THEN d2:=date_trunc('quarter',local_now)::date-1;d1:=date_trunc('quarter',d2)::date;END IF;
   IF s.period='year_to_date' THEN d1:=make_date(extract(year FROM local_now)::int,1,1);d2:=local_now::date;END IF;
   payload:=jsonb_build_object('recipients',s.recipients,'subject',s.subject,'message',s.message,'from',d1,'to',d2)||CASE WHEN s.view_id IS NOT NULL THEN jsonb_build_object('viewId',s.view_id) ELSE jsonb_build_object('packId',s.pack_id) END;
   IF NOT EXISTS(SELECT 1 FROM public.report_deliveries WHERE schedule_id=s.id AND scheduled_for=due) THEN
    queued:=public.queue_report_delivery(s.company_id,payload);
    UPDATE public.report_deliveries SET schedule_id=s.id,scheduled_for=due WHERE id=queued;
    count:=count+1;
   END IF;
   -- Advance from the intended local clock time; preserve DST behavior. Skip stale catch-up bursts.
   new_due:=due;
   LOOP
    new_due:=((new_due AT TIME ZONE s.timezone)+CASE s.recurrence WHEN 'daily' THEN interval '1 day' WHEN 'weekly' THEN interval '1 week' WHEN 'monthly' THEN interval '1 month' ELSE interval '3 months' END) AT TIME ZONE s.timezone;
    EXIT WHEN new_due>_now;
   END LOOP;
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
REVOKE ALL ON FUNCTION public.enqueue_due_report_schedules(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_due_report_schedules(timestamptz) TO service_role;

CREATE FUNCTION public.claim_report_deliveries(_limit integer DEFAULT 5) RETURNS SETOF public.report_deliveries
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.report_deliveries; old_claims text;old_sub text;
BEGIN
 old_claims:=current_setting('request.jwt.claims',true);old_sub:=current_setting('request.jwt.claim.sub',true);
 FOR j IN SELECT * FROM public.report_deliveries WHERE (status='queued' OR(status='sending' AND lease_until<now())) AND next_attempt_at<=now() AND attempts<5 ORDER BY created_at,id LIMIT LEAST(GREATEST(_limit,1),10) FOR UPDATE SKIP LOCKED LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',j.owner_id,'role','authenticated','aal','aal2')::text,true);PERFORM set_config('request.jwt.claim.sub',j.owner_id::text,true);
  IF NOT public.has_company_permission(j.company_id,'reports.export') OR (j.view_id IS NOT NULL AND NOT private.report_access(j.view_id,false)) OR (j.pack_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.report_packs WHERE id=j.pack_id AND owner_id=j.owner_id AND status IN ('published','delivered'))) THEN
   UPDATE public.report_deliveries SET status='cancelled',last_error='Authorization was revoked',updated_at=now() WHERE id=j.id;CONTINUE;
  END IF;
  UPDATE public.report_deliveries SET status='sending',attempts=attempts+1,lease_until=now()+interval '5 minutes',updated_at=now() WHERE id=j.id RETURNING * INTO j;
  RETURN NEXT j;
 END LOOP;
 PERFORM set_config('request.jwt.claims',COALESCE(old_claims,''),true);PERFORM set_config('request.jwt.claim.sub',COALESCE(old_sub,''),true);
END $$;
REVOKE ALL ON FUNCTION public.claim_report_deliveries(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_report_deliveries(integer) TO service_role;
CREATE FUNCTION public.finish_report_delivery(_id uuid,_attempt integer,_provider_id text DEFAULT NULL,_error text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.report_deliveries;
BEGIN
 SELECT * INTO j FROM public.report_deliveries WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR j.status<>'sending' OR j.attempts<>_attempt THEN RAISE EXCEPTION 'Delivery lease changed' USING ERRCODE='40001';END IF;
 UPDATE public.report_deliveries SET status=CASE WHEN _error IS NULL AND _provider_id IS NOT NULL THEN 'accepted' WHEN attempts<5 THEN 'queued' ELSE 'failed' END,provider_id=_provider_id,last_error=left(_error,500),lease_until=NULL,next_attempt_at=now()+make_interval(secs=>LEAST(3600,30*power(2,attempts)::int)),updated_at=now() WHERE id=_id;
 INSERT INTO public.audit_events(company_id,actor_user_id,action,entity_type,entity_id,details) VALUES(j.company_id,j.owner_id,CASE WHEN _error IS NULL THEN 'report.delivery_accepted' ELSE 'report.delivery_failed' END,'report_delivery',j.id,jsonb_build_object('provider_id',_provider_id,'attempt',j.attempts));
END $$;
REVOKE ALL ON FUNCTION public.finish_report_delivery(uuid,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_report_delivery(uuid,integer,text,text) TO service_role;
CREATE FUNCTION public.confirm_report_delivery(_provider_id text,_delivered boolean,_reason text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.report_deliveries;
BEGIN
 SELECT * INTO j FROM public.report_deliveries WHERE provider_id=_provider_id AND status IN ('accepted','delivered') FOR UPDATE;
 IF NOT FOUND THEN RETURN;END IF;
 UPDATE public.report_deliveries SET status=CASE WHEN _delivered THEN 'delivered' ELSE 'failed' END,last_error=CASE WHEN _delivered THEN NULL ELSE left(_reason,500) END,updated_at=now() WHERE id=j.id;
 IF _delivered AND j.pack_id IS NOT NULL THEN UPDATE public.report_packs SET status='delivered',version=version+1,updated_at=now() WHERE id=j.pack_id AND status IN ('published','delivered');END IF;
 INSERT INTO public.audit_events(company_id,actor_user_id,action,entity_type,entity_id,details) VALUES(j.company_id,j.owner_id,CASE WHEN _delivered THEN 'report.delivery_confirmed' ELSE 'report.delivery_bounced' END,'report_delivery',j.id,jsonb_build_object('provider_id',_provider_id));
END $$;
REVOKE ALL ON FUNCTION public.confirm_report_delivery(text,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_report_delivery(text,boolean,text) TO service_role;
