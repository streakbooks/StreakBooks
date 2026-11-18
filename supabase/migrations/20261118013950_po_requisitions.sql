-- Original LinkBooks purchase requisitions. No journal is posted by this workflow.
CREATE TABLE public.purchase_requisitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 requisition_number text NOT NULL,
 request_id uuid NOT NULL,
 request_fingerprint text NOT NULL,
 title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 160),
 justification text NOT NULL DEFAULT '' CHECK (length(justification) <= 4000),
 contact_id uuid NOT NULL REFERENCES public.contacts(id),
 requested_on date NOT NULL,
 required_on date CHECK (required_on IS NULL OR required_on >= requested_on),
 currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
 lines jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) BETWEEN 1 AND 200),
 subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
 tax_minor bigint NOT NULL CHECK (tax_minor >= 0),
 total_minor bigint NOT NULL CHECK (total_minor = subtotal_minor + tax_minor),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','approved','rejected','cancelled','ordered')),
 version bigint NOT NULL DEFAULT 1,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 submitted_by uuid REFERENCES auth.users(id), submitted_at timestamptz,
 approved_by uuid REFERENCES auth.users(id), approved_at timestamptz,
 decision_comment text, order_id uuid REFERENCES public.purchase_orders(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (company_id, requisition_number), UNIQUE (company_id, request_id)
);
CREATE INDEX purchase_requisitions_company_status ON public.purchase_requisitions(company_id,status,created_at DESC,id DESC);
ALTER TABLE public.purchase_requisitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_requisitions_read ON public.purchase_requisitions FOR SELECT TO authenticated
 USING (public.has_company_permission(company_id,'purchases.view'));
REVOKE ALL ON public.purchase_requisitions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.purchase_requisitions TO authenticated;
CREATE TRIGGER platform_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_requisitions
 FOR EACH ROW EXECUTE FUNCTION private.platform_write_guard('purchases');

CREATE OR REPLACE FUNCTION private.save_purchase_requisition(_company uuid,_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.purchase_requisitions; rid uuid := nullif(_payload->>'id','')::uuid;
 request uuid := nullif(_payload->>'requestId','')::uuid; fingerprint text := md5(_payload::text);
 c jsonb; next_no bigint; supplier uuid := (_payload->>'contactId')::uuid;
 requested date := (_payload->>'requestedOn')::date; required date := nullif(_payload->>'requiredOn','')::date;
 currency text := upper(trim(_payload->>'currencyCode')); v_title text := trim(_payload->>'title');
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'purchases.draft') THEN
  RAISE EXCEPTION 'Purchase access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(_company::text||':workflow-reset',0));
 IF rid IS NULL THEN
  IF request IS NULL THEN RAISE EXCEPTION 'Request ID required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_company::text||':requisition-number',0));
  SELECT * INTO r FROM public.purchase_requisitions WHERE company_id=_company AND request_id=request;
  IF FOUND THEN
   IF r.request_fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'Request ID already used with different data'; END IF;
   RETURN to_jsonb(r);
  END IF;
 ELSE
  SELECT * INTO r FROM public.purchase_requisitions WHERE company_id=_company AND id=rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Requisition not found'; END IF;
  IF r.version IS DISTINCT FROM (_payload->>'version')::bigint THEN RAISE EXCEPTION 'Requisition changed; reload first' USING ERRCODE='40001'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'Only draft requisitions can be edited'; END IF;
 END IF;
 IF v_title IS NULL OR length(v_title) NOT BETWEEN 3 AND 160 OR length(coalesce(_payload->>'justification',''))>4000
  OR requested IS NULL OR (required IS NOT NULL AND required<requested) OR currency IS NULL OR currency !~ '^[A-Z]{3}$' THEN
  RAISE EXCEPTION 'Invalid requisition header'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.contacts WHERE company_id=_company AND id=supplier AND kind::text IN ('supplier','both') AND is_active) THEN
  RAISE EXCEPTION 'Active supplier required in this organisation'; END IF;
 c := private.workflow_order_lines(_company,_payload->'lines');
 IF rid IS NULL THEN
  SELECT coalesce(max(substring(requisition_number from 4)::bigint),0)+1 INTO next_no FROM public.purchase_requisitions WHERE company_id=_company;
  INSERT INTO public.purchase_requisitions(company_id,requisition_number,request_id,request_fingerprint,title,justification,contact_id,requested_on,required_on,currency_code,lines,subtotal_minor,tax_minor,total_minor,created_by)
  VALUES(_company,'PR-'||lpad(next_no::text,greatest(6,length(next_no::text)),'0'),request,fingerprint,v_title,coalesce(_payload->>'justification',''),supplier,requested,required,currency,_payload->'lines',(c->>'subtotal_minor')::bigint,(c->>'tax_minor')::bigint,(c->>'total_minor')::bigint,auth.uid()) RETURNING * INTO r;
 ELSE
  UPDATE public.purchase_requisitions SET title=v_title,justification=coalesce(_payload->>'justification',''),contact_id=supplier,requested_on=requested,required_on=required,currency_code=currency,lines=_payload->'lines',subtotal_minor=(c->>'subtotal_minor')::bigint,tax_minor=(c->>'tax_minor')::bigint,total_minor=(c->>'total_minor')::bigint,version=version+1,updated_at=now()
  WHERE company_id=_company AND id=rid RETURNING * INTO r;
 END IF;
 PERFORM public.record_audit_event(_company,'purchase_requisition_saved','purchase_requisition',r.id,jsonb_build_object('version',r.version,'total_minor',r.total_minor));
 RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION private.manage_purchase_requisition(_company uuid,_id uuid,_version bigint,_action text,_comment text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.purchase_requisitions; next_status text; c jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,CASE WHEN _action IN ('approve','reject') THEN 'purchases.authorise' ELSE 'purchases.draft' END) THEN
  RAISE EXCEPTION 'Purchase access denied' USING ERRCODE='42501'; END IF;
 IF _action IS NULL OR _action NOT IN ('submit','approve','reject','reset','cancel','convert') OR length(coalesce(_comment,''))>1000 THEN RAISE EXCEPTION 'Invalid requisition action'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(_company::text||':workflow-reset',0));
 SELECT * INTO r FROM public.purchase_requisitions WHERE company_id=_company AND id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Requisition not found'; END IF;
 -- A lost conversion response may be safely replayed with its original version.
 IF _action='convert' AND r.status='ordered' AND r.order_id IS NOT NULL THEN RETURN to_jsonb(r); END IF;
 IF r.version IS DISTINCT FROM _version THEN RAISE EXCEPTION 'Requisition changed; reload first' USING ERRCODE='40001'; END IF;
 IF _action='submit' AND r.status='draft' THEN
  c:=private.workflow_order_lines(_company,r.lines);
  IF NOT EXISTS(SELECT 1 FROM public.contacts WHERE company_id=_company AND id=r.contact_id AND kind::text IN ('supplier','both') AND is_active) THEN RAISE EXCEPTION 'Active supplier required'; END IF;
  IF (c->>'total_minor')::bigint<>r.total_minor THEN RAISE EXCEPTION 'Requisition totals are inconsistent'; END IF;
  next_status:='pending';
 ELSIF _action IN ('approve','reject') AND r.status='pending' THEN
  IF auth.uid()=r.submitted_by OR auth.uid()=r.created_by THEN RAISE EXCEPTION 'A different authorised person must decide this requisition' USING ERRCODE='42501'; END IF;
  IF _action='reject' AND length(trim(coalesce(_comment,'')))<3 THEN RAISE EXCEPTION 'Give a rejection reason'; END IF;
  next_status:=CASE WHEN _action='approve' THEN 'approved' ELSE 'rejected' END;
 ELSIF _action='reset' AND r.status IN ('rejected','approved') THEN next_status:='draft';
 ELSIF _action='cancel' AND r.status IN ('draft','pending','approved','rejected') THEN next_status:='cancelled';
 ELSIF _action='convert' AND r.status='approved' THEN
  c:=private.save_purchase_order_atomic(_company,jsonb_build_object('requestId',r.id,'contactId',r.contact_id,'orderDate',r.requested_on,'currencyCode',r.currency_code,'memo',left(r.requisition_number||': '||r.title,500),'lines',r.lines));
  UPDATE public.purchase_requisitions SET order_id=(c->>'id')::uuid WHERE company_id=_company AND id=_id;
  next_status:='ordered';
 ELSE RAISE EXCEPTION 'This requisition action is no longer allowed'; END IF;
 UPDATE public.purchase_requisitions SET status=next_status,version=version+1,updated_at=now(),
  submitted_by=CASE WHEN _action='submit' THEN auth.uid() WHEN _action='reset' THEN NULL ELSE submitted_by END,
  submitted_at=CASE WHEN _action='submit' THEN now() WHEN _action='reset' THEN NULL ELSE submitted_at END,
  approved_by=CASE WHEN _action='approve' THEN auth.uid() WHEN _action='reset' THEN NULL ELSE approved_by END,
  approved_at=CASE WHEN _action='approve' THEN now() WHEN _action='reset' THEN NULL ELSE approved_at END,
  decision_comment=CASE WHEN _action IN ('approve','reject') THEN nullif(trim(_comment),'') WHEN _action='reset' THEN NULL ELSE decision_comment END
 WHERE company_id=_company AND id=_id RETURNING * INTO r;
 PERFORM public.record_audit_event(_company,'purchase_requisition_'||_action,'purchase_requisition',r.id,jsonb_build_object('status',r.status,'version',r.version,'comment',_comment,'order_id',r.order_id));
 RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.save_purchase_requisition(_company uuid,_payload jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.save_purchase_requisition(_company,_payload) $$;
CREATE OR REPLACE FUNCTION public.manage_purchase_requisition(_company uuid,_id uuid,_version bigint,_action text,_comment text DEFAULT '')
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.manage_purchase_requisition(_company,_id,_version,_action,_comment) $$;
REVOKE ALL ON FUNCTION private.save_purchase_requisition(uuid,jsonb),public.save_purchase_requisition(uuid,jsonb),private.manage_purchase_requisition(uuid,uuid,bigint,text,text),public.manage_purchase_requisition(uuid,uuid,bigint,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.save_purchase_requisition(uuid,jsonb),public.save_purchase_requisition(uuid,jsonb),private.manage_purchase_requisition(uuid,uuid,bigint,text,text),public.manage_purchase_requisition(uuid,uuid,bigint,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.browse_purchase_requisitions(_company uuid,_status text DEFAULT 'all',_search text DEFAULT '',_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; total bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'purchases.view') THEN RAISE EXCEPTION 'Purchase access denied' USING ERRCODE='42501'; END IF;
 IF _page IS NULL OR _page NOT BETWEEN 1 AND 100000 OR _status IS NULL OR _status NOT IN ('all','draft','pending','approved','rejected','cancelled','ordered') OR length(coalesce(_search,''))>100 THEN RAISE EXCEPTION 'Invalid requisition filter'; END IF;
 SELECT count(*) INTO total FROM public.purchase_requisitions r WHERE r.company_id=_company AND (_status='all' OR r.status=_status) AND (coalesce(_search,'')='' OR position(lower(_search) in lower(r.requisition_number||' '||r.title))>0);
 SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) INTO result FROM (
  SELECT * FROM public.purchase_requisitions r WHERE r.company_id=_company AND (_status='all' OR r.status=_status) AND (coalesce(_search,'')='' OR position(lower(_search) in lower(r.requisition_number||' '||r.title))>0)
  ORDER BY r.created_at DESC,r.id DESC OFFSET ((_page-1)*25) LIMIT 25
 ) r;
 RETURN jsonb_build_object('rows',result,'total',total,'page',_page,'pageSize',25);
END $$;
REVOKE ALL ON FUNCTION public.browse_purchase_requisitions(uuid,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.browse_purchase_requisitions(uuid,text,text,integer) TO authenticated;
-- Preserve the most recent complete reset implementation, including all modules.
-- Only this authenticated destructive reset can establish the private transaction marker.
ALTER FUNCTION private.reset_demo_company_with_workflows(uuid) RENAME TO reset_demo_company_before_purchasing;
REVOKE ALL ON FUNCTION private.reset_demo_company_before_purchasing(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.reset_demo_company_with_workflows(_company uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'demo.reset') THEN RAISE EXCEPTION 'Demo reset access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_company::text||':workflow-reset',0));
 IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=_company AND is_demo) THEN RAISE EXCEPTION 'Reset denied: company is not a demo company'; END IF;
 INSERT INTO private.po_reset_context(transaction_id,company_id) VALUES(txid_current(),_company);
 DELETE FROM public.purchase_requisitions WHERE company_id=_company;
 PERFORM private.reset_demo_company_before_purchasing(_company);
 DELETE FROM private.po_reset_context WHERE transaction_id=txid_current() AND company_id=_company;
END $$;
-- Recreate the SQL wrapper: its pre-existing dependency follows the renamed function.
CREATE OR REPLACE FUNCTION public.reset_demo_company(_company_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.reset_demo_company_with_workflows(_company_id) $$;
REVOKE ALL ON FUNCTION private.reset_demo_company_with_workflows(uuid),public.reset_demo_company(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.reset_demo_company_with_workflows(uuid),public.reset_demo_company(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
