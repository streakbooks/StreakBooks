-- Original LinkBooks purchasing controls. Operational documents never post journals.
ALTER TABLE public.purchase_orders
  ADD COLUMN approval_state text NOT NULL DEFAULT 'draft' CHECK (approval_state IN ('draft','pending','approved','rejected')),
  ADD COLUMN submitted_by uuid REFERENCES auth.users(id),
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN approval_comment text,
  ADD COLUMN supplier_reference text,
  ADD COLUMN expected_delivery_date date,
  ADD COLUMN acknowledged_on date,
  ADD COLUMN delivery_address text,
  ADD COLUMN terms text;
-- Existing committed orders remain usable; this does not fabricate approval actors.
UPDATE public.purchase_orders SET approval_state='approved' WHERE status::text IN ('sent','partially_received','billed');
CREATE INDEX purchase_orders_expected_delivery ON public.purchase_orders(company_id,expected_delivery_date) WHERE status IN ('sent','partially_received');
REVOKE INSERT,UPDATE,DELETE ON public.purchase_orders,public.purchase_order_lines FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.purchase_orders,public.purchase_order_lines TO authenticated;
DROP POLICY IF EXISTS purchase_orders_write ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_order_lines_write ON public.purchase_order_lines;
DROP POLICY IF EXISTS purchase_orders_select ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_order_lines_select ON public.purchase_order_lines;
CREATE POLICY purchase_orders_select ON public.purchase_orders FOR SELECT TO authenticated USING (public.has_company_permission(company_id,'purchases.view'));
CREATE POLICY purchase_order_lines_select ON public.purchase_order_lines FOR SELECT TO authenticated USING (public.has_company_permission(company_id,'purchases.view'));

CREATE TABLE public.purchase_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX purchase_order_events_order ON public.purchase_order_events(company_id,order_id,created_at DESC,id);
CREATE TABLE public.purchase_order_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  fingerprint text NOT NULL,
  receipt_date date NOT NULL,
  reference text CHECK (length(reference)<=200),
  lines jsonb NOT NULL CHECK (jsonb_typeof(lines)='array' AND jsonb_array_length(lines)>0),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  reversed_by uuid REFERENCES auth.users(id),
  reversal_reason text,
  reverse_request_id uuid,
  UNIQUE(company_id,request_id),
  UNIQUE(company_id,reverse_request_id)
);
CREATE INDEX purchase_order_receipts_order ON public.purchase_order_receipts(company_id,order_id,created_at DESC,id);
ALTER TABLE public.purchase_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_order_events_read ON public.purchase_order_events FOR SELECT TO authenticated USING (public.has_company_permission(company_id,'purchases.view'));
CREATE POLICY purchase_order_receipts_read ON public.purchase_order_receipts FOR SELECT TO authenticated USING (public.has_company_permission(company_id,'purchases.view'));
REVOKE ALL ON public.purchase_order_events,public.purchase_order_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.purchase_order_events,public.purchase_order_receipts TO authenticated;

-- Only the authorised reset wrapper can create this transaction-scoped marker.
-- A session setting is not authority: authenticated callers cannot mutate this table.
CREATE TABLE private.po_reset_context (
  transaction_id bigint NOT NULL,
  company_id uuid NOT NULL,
  PRIMARY KEY(transaction_id,company_id)
);
REVOKE ALL ON private.po_reset_context FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.po_reset_active(_company uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM private.po_reset_context WHERE transaction_id=txid_current() AND company_id=_company)
$$;
REVOKE ALL ON FUNCTION private.po_reset_active(uuid) FROM PUBLIC,anon,authenticated;

-- Any save of a draft, including line-only edits, invalidates prior approval.
-- Workflow actions change approval_state themselves and do not take this branch.
CREATE FUNCTION private.po_draft_approval_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.status='draft' AND NEW.status='draft' AND NEW.approval_state=OLD.approval_state
     AND (NEW.contact_id IS DISTINCT FROM OLD.contact_id OR NEW.order_date IS DISTINCT FROM OLD.order_date
       OR NEW.currency_code IS DISTINCT FROM OLD.currency_code OR NEW.memo IS DISTINCT FROM OLD.memo
       OR NEW.subtotal_minor IS DISTINCT FROM OLD.subtotal_minor OR NEW.tax_minor IS DISTINCT FROM OLD.tax_minor
       OR NEW.total_minor IS DISTINCT FROM OLD.total_minor OR NEW.terms IS DISTINCT FROM OLD.terms) THEN
    IF OLD.approval_state='pending' THEN RAISE EXCEPTION 'Withdraw the order before editing'; END IF;
    NEW.approval_state:='draft'; NEW.approved_by:=NULL; NEW.approved_at:=NULL;
    NEW.submitted_by:=NULL; NEW.submitted_at:=NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER po_draft_approval_guard BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION private.po_draft_approval_guard();
CREATE FUNCTION private.po_line_approval_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.purchase_orders; target uuid;
BEGIN
  target:=CASE WHEN TG_OP='DELETE' THEN OLD.order_id ELSE NEW.order_id END;
  -- Receipt/billing counter updates do not change commercial terms.
  IF TG_OP='UPDATE' AND ROW(NEW.description,NEW.account_id,NEW.quantity,NEW.unit_price_minor,NEW.net_minor,NEW.tax_minor,NEW.tax_rate_bps,NEW.line_no)
       IS NOT DISTINCT FROM ROW(OLD.description,OLD.account_id,OLD.quantity,OLD.unit_price_minor,OLD.net_minor,OLD.tax_minor,OLD.tax_rate_bps,OLD.line_no) THEN RETURN NEW; END IF;
  SELECT * INTO o FROM public.purchase_orders WHERE id=target FOR UPDATE;
  IF NOT FOUND THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP='DELETE' AND private.po_reset_active(o.company_id) THEN RETURN OLD; END IF;
  IF o.status<>'draft' OR o.approval_state='pending' THEN RAISE EXCEPTION 'Only withdrawn draft order lines can be edited'; END IF;
  UPDATE public.purchase_orders SET approval_state='draft',approved_by=NULL,approved_at=NULL,submitted_by=NULL,submitted_at=NULL WHERE id=target;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER po_line_approval_guard BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_order_lines FOR EACH ROW EXECUTE FUNCTION private.po_line_approval_guard();
REVOKE ALL ON FUNCTION private.po_draft_approval_guard(),private.po_line_approval_guard() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.manage_purchase_order(_company uuid,_order uuid,_version bigint,_action text,_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.purchase_orders; comment text:=nullif(trim(_payload->>'comment'),''); next_state text; next_status public.po_status;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,CASE WHEN _action IN ('approve','reject') THEN 'purchases.authorise' ELSE 'purchases.draft' END) THEN RAISE EXCEPTION 'Purchase access denied' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(_company::text||':workflow-reset',0));
  SELECT * INTO o FROM public.purchase_orders WHERE company_id=_company AND id=_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF _version IS NULL OR _version IS DISTINCT FROM o.version THEN RAISE EXCEPTION 'Order changed; reload before continuing' USING ERRCODE='40001'; END IF;
  IF _payload IS NULL OR jsonb_typeof(_payload)<>'object' OR length(coalesce(comment,''))>2000 THEN RAISE EXCEPTION 'Invalid purchase order action'; END IF;
  next_state:=o.approval_state; next_status:=o.status;
  IF _action='metadata' THEN
    IF o.status IN ('cancelled','billed') THEN RAISE EXCEPTION 'This order is closed'; END IF;
    IF length(coalesce(_payload->>'supplierReference',''))>200 OR length(coalesce(_payload->>'deliveryAddress',''))>2000 OR length(coalesce(_payload->>'terms',''))>4000 THEN RAISE EXCEPTION 'Purchase order details are too long'; END IF;
    IF _payload ? 'expectedDeliveryDate' AND nullif(_payload->>'expectedDeliveryDate','') IS NOT NULL AND (NOT isfinite((_payload->>'expectedDeliveryDate')::date) OR (_payload->>'expectedDeliveryDate')::date<o.order_date) THEN RAISE EXCEPTION 'Expected delivery must be on or after the order date'; END IF;
    IF _payload ? 'acknowledgedOn' AND nullif(_payload->>'acknowledgedOn','') IS NOT NULL AND (NOT isfinite((_payload->>'acknowledgedOn')::date) OR (_payload->>'acknowledgedOn')::date<o.order_date OR (_payload->>'acknowledgedOn')::date>current_date) THEN RAISE EXCEPTION 'Acknowledgement date must be between the order date and today'; END IF;
    IF _payload ? 'terms' AND coalesce(_payload->>'terms','') IS DISTINCT FROM coalesce(o.terms,'') AND (o.status<>'draft' OR o.approval_state='pending') THEN RAISE EXCEPTION 'Withdraw the draft before changing commercial terms'; END IF;
    UPDATE public.purchase_orders SET
      supplier_reference=CASE WHEN _payload ? 'supplierReference' THEN nullif(trim(_payload->>'supplierReference'),'') ELSE supplier_reference END,
      expected_delivery_date=CASE WHEN _payload ? 'expectedDeliveryDate' THEN nullif(_payload->>'expectedDeliveryDate','')::date ELSE expected_delivery_date END,
      acknowledged_on=CASE WHEN _payload ? 'acknowledgedOn' THEN nullif(_payload->>'acknowledgedOn','')::date ELSE acknowledged_on END,
      delivery_address=CASE WHEN _payload ? 'deliveryAddress' THEN nullif(trim(_payload->>'deliveryAddress'),'') ELSE delivery_address END,
      terms=CASE WHEN _payload ? 'terms' THEN nullif(trim(_payload->>'terms'),'') ELSE terms END,
      version=version+1,updated_at=now()
    WHERE company_id=_company AND id=_order RETURNING * INTO o;
  ELSE
    IF _action='submit' THEN
      IF o.status<>'draft' OR o.approval_state NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'Only draft orders can be submitted'; END IF;
      IF NOT EXISTS(SELECT 1 FROM public.purchase_order_lines WHERE company_id=_company AND order_id=_order) THEN RAISE EXCEPTION 'Add order lines before submitting'; END IF;
      IF NOT EXISTS(SELECT 1 FROM public.contacts WHERE company_id=_company AND id=o.contact_id AND is_active AND kind::text IN ('supplier','both')) THEN RAISE EXCEPTION 'An active supplier is required'; END IF;
      IF EXISTS(SELECT 1 FROM public.purchase_order_lines l LEFT JOIN public.accounts a ON a.company_id=l.company_id AND a.id=l.account_id WHERE l.company_id=_company AND l.order_id=_order AND (a.id IS NULL OR NOT a.is_active OR NOT a.is_postable OR a.archived_at IS NOT NULL)) THEN RAISE EXCEPTION 'An order account is no longer active'; END IF;
      next_state:='pending';
    ELSIF _action IN ('approve','reject') THEN
      IF o.status<>'draft' OR o.approval_state<>'pending' THEN RAISE EXCEPTION 'Only submitted orders can be reviewed'; END IF;
      IF _action='approve' AND auth.uid() IN (o.created_by,o.submitted_by) THEN RAISE EXCEPTION 'A different authorised user must approve this order'; END IF;
      IF _action='reject' AND length(coalesce(comment,''))<3 THEN RAISE EXCEPTION 'A rejection reason is required'; END IF;
      next_state:=CASE WHEN _action='approve' THEN 'approved' ELSE 'rejected' END;
    ELSIF _action='reset' THEN
      IF o.status<>'draft' OR o.approval_state='draft' THEN RAISE EXCEPTION 'Only submitted, approved or rejected draft orders can be withdrawn'; END IF;
      next_state:='draft';
    ELSIF _action='send' THEN
      IF o.status<>'draft' OR o.approval_state<>'approved' THEN RAISE EXCEPTION 'Approve this order before marking it sent'; END IF;
      IF NOT EXISTS(SELECT 1 FROM public.contacts WHERE company_id=_company AND id=o.contact_id AND is_active AND kind::text IN ('supplier','both')) THEN RAISE EXCEPTION 'An active supplier is required'; END IF;
      IF EXISTS(SELECT 1 FROM public.purchase_order_lines l LEFT JOIN public.accounts a ON a.company_id=l.company_id AND a.id=l.account_id WHERE l.company_id=_company AND l.order_id=_order AND (a.id IS NULL OR NOT a.is_active OR NOT a.is_postable OR a.archived_at IS NOT NULL)) THEN RAISE EXCEPTION 'An order account is no longer active'; END IF;
      next_status:='sent';
    ELSIF _action='cancel' THEN
      IF o.status NOT IN ('draft','sent','partially_received') OR EXISTS(SELECT 1 FROM public.purchase_order_lines WHERE company_id=_company AND order_id=_order AND (quantity_received>0 OR quantity_billed>0)) THEN RAISE EXCEPTION 'Reverse receipts and bills before cancelling this order'; END IF;
      IF length(coalesce(comment,''))<3 THEN RAISE EXCEPTION 'A cancellation reason is required'; END IF;
      next_status:='cancelled';
    ELSE RAISE EXCEPTION 'Unknown purchase order action'; END IF;
    UPDATE public.purchase_orders SET status=next_status,approval_state=next_state,approval_comment=comment,
      submitted_by=CASE WHEN _action='submit' THEN auth.uid() WHEN _action='reset' THEN NULL ELSE submitted_by END,
      submitted_at=CASE WHEN _action='submit' THEN now() WHEN _action='reset' THEN NULL ELSE submitted_at END,
      approved_by=CASE WHEN _action='approve' THEN auth.uid() WHEN _action IN ('submit','reject','reset') THEN NULL ELSE approved_by END,
      approved_at=CASE WHEN _action='approve' THEN now() WHEN _action IN ('submit','reject','reset') THEN NULL ELSE approved_at END,
      version=version+1,updated_at=now() WHERE company_id=_company AND id=_order RETURNING * INTO o;
  END IF;
  INSERT INTO public.purchase_order_events(company_id,order_id,action,actor_user_id,details) VALUES(_company,_order,_action,auth.uid(),jsonb_build_object('version',o.version,'comment',comment,'manual_status_only',_action='send'));
  PERFORM public.record_audit_event(_company,'purchase_order.'||_action,'purchase_order',_order,jsonb_build_object('version',o.version,'comment',comment));
  RETURN jsonb_build_object('id',o.id,'status',o.status,'approval_state',o.approval_state,'version',o.version);
END $$;
CREATE FUNCTION public.manage_purchase_order(_company uuid,_order uuid,_version bigint,_action text,_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.manage_purchase_order(_company,_order,_version,_action,_payload) $$;

CREATE FUNCTION private.receive_purchase_order(_company uuid,_order uuid,_request uuid,_date date,_reference text,_lines jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.purchase_orders; receipt public.purchase_order_receipts; item jsonb; target uuid; qty numeric; pol public.purchase_order_lines; fingerprint text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'purchases.draft') THEN RAISE EXCEPTION 'Purchase access denied' USING ERRCODE='42501'; END IF;
  IF _request IS NULL OR _date IS NULL OR _date>current_date OR length(coalesce(_reference,''))>200 OR jsonb_typeof(_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(_lines) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid receipt'; END IF;
  fingerprint:=md5(jsonb_build_object('order',_order,'date',_date,'reference',coalesce(trim(_reference),''),'lines',_lines)::text);
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(_company::text||':workflow-reset',0));
  PERFORM pg_advisory_xact_lock(hashtextextended(_company::text||_request::text,1));
  SELECT * INTO o FROM public.purchase_orders WHERE company_id=_company AND id=_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  SELECT * INTO receipt FROM public.purchase_order_receipts WHERE company_id=_company AND request_id=_request;
  IF FOUND THEN
    IF receipt.fingerprint<>fingerprint THEN RAISE EXCEPTION 'Receipt request already used for different data'; END IF;
    RETURN jsonb_build_object('id',o.id,'status',o.status,'version',o.version,'receiptId',receipt.id);
  END IF;
  IF o.status NOT IN ('sent','partially_received') OR o.approval_state<>'approved' OR _date<o.order_date THEN RAISE EXCEPTION 'Receive goods only against an approved, sent order on or after its order date'; END IF;
  IF (SELECT count(DISTINCT value->>'lineId') FROM jsonb_array_elements(_lines))<>jsonb_array_length(_lines) THEN RAISE EXCEPTION 'Receipt lines must be unique'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    target:=(item->>'lineId')::uuid; qty:=(item->>'receiveQuantity')::numeric;
    IF qty IS NULL OR qty<=0 OR qty>1000000000 OR qty<>round(qty,6) THEN RAISE EXCEPTION 'Enter a positive receipt quantity with up to six decimals'; END IF;
    SELECT * INTO pol FROM public.purchase_order_lines WHERE company_id=_company AND order_id=_order AND id=target FOR UPDATE;
    IF NOT FOUND OR pol.quantity_received+qty>pol.quantity THEN RAISE EXCEPTION 'Receipt exceeds the outstanding quantity or line is outside this order'; END IF;
    UPDATE public.purchase_order_lines SET quantity_received=quantity_received+qty WHERE id=target AND company_id=_company;
  END LOOP;
  INSERT INTO public.purchase_order_receipts(company_id,order_id,request_id,fingerprint,receipt_date,reference,lines,created_by)
  VALUES(_company,_order,_request,fingerprint,_date,nullif(trim(_reference),''),(SELECT jsonb_agg(jsonb_build_object('line_id',value->>'lineId','quantity',(value->>'receiveQuantity')::numeric)) FROM jsonb_array_elements(_lines)),auth.uid()) RETURNING * INTO receipt;
  UPDATE public.purchase_orders SET status='partially_received',version=version+1,updated_at=now() WHERE id=_order AND company_id=_company RETURNING * INTO o;
  INSERT INTO public.purchase_order_events(company_id,order_id,action,actor_user_id,details) VALUES(_company,_order,'receive',auth.uid(),jsonb_build_object('receipt_id',receipt.id,'reference',receipt.reference,'date',_date));
  PERFORM public.record_audit_event(_company,'purchase_order.receive','purchase_order',_order,jsonb_build_object('receipt_id',receipt.id,'posts',false));
  RETURN jsonb_build_object('id',o.id,'status',o.status,'version',o.version,'receiptId',receipt.id);
END $$;
CREATE FUNCTION public.receive_purchase_order(_company uuid,_order uuid,_request uuid,_date date,_reference text,_lines jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.receive_purchase_order(_company,_order,_request,_date,_reference,_lines) $$;

CREATE FUNCTION private.reverse_purchase_receipt(_company uuid,_order uuid,_receipt uuid,_request uuid,_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.purchase_orders; receipt public.purchase_order_receipts; pol public.purchase_order_lines; item jsonb; qty numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'purchases.draft') THEN RAISE EXCEPTION 'Purchase access denied' USING ERRCODE='42501'; END IF;
  IF _request IS NULL OR length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 2000 THEN RAISE EXCEPTION 'A receipt reversal reason and request ID are required'; END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(_company::text||':workflow-reset',0));
  PERFORM pg_advisory_xact_lock(hashtextextended(_company::text||_request::text,1));
  SELECT * INTO o FROM public.purchase_orders WHERE company_id=_company AND id=_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  SELECT * INTO receipt FROM public.purchase_order_receipts WHERE company_id=_company AND order_id=_order AND id=_receipt FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found in this order'; END IF;
  IF EXISTS(SELECT 1 FROM public.purchase_order_receipts WHERE company_id=_company AND reverse_request_id=_request AND id<>_receipt) THEN RAISE EXCEPTION 'Reversal request already used'; END IF;
  IF receipt.reversed_at IS NOT NULL THEN
    IF receipt.reverse_request_id<>_request OR receipt.reversal_reason<>trim(_reason) THEN RAISE EXCEPTION 'Receipt already reversed'; END IF;
    RETURN jsonb_build_object('id',o.id,'status',o.status,'version',o.version,'receiptId',receipt.id);
  END IF;
  IF o.status='cancelled' THEN RAISE EXCEPTION 'Cancelled orders cannot change'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(receipt.lines) LOOP
    qty:=(item->>'quantity')::numeric;
    SELECT * INTO pol FROM public.purchase_order_lines WHERE company_id=_company AND order_id=_order AND id=(item->>'line_id')::uuid FOR UPDATE;
    IF NOT FOUND OR pol.quantity_received-qty<pol.quantity_billed THEN RAISE EXCEPTION 'Delete or void linked bills before reversing these received goods'; END IF;
    UPDATE public.purchase_order_lines SET quantity_received=quantity_received-qty WHERE company_id=_company AND id=pol.id;
  END LOOP;
  UPDATE public.purchase_order_receipts SET reversed_at=now(),reversed_by=auth.uid(),reversal_reason=trim(_reason),reverse_request_id=_request WHERE id=_receipt;
  UPDATE public.purchase_orders SET status=CASE WHEN EXISTS(SELECT 1 FROM public.purchase_order_lines WHERE company_id=_company AND order_id=_order AND quantity_received>0) THEN 'partially_received'::public.po_status ELSE 'sent'::public.po_status END,version=version+1,updated_at=now() WHERE company_id=_company AND id=_order RETURNING * INTO o;
  INSERT INTO public.purchase_order_events(company_id,order_id,action,actor_user_id,details) VALUES(_company,_order,'reverse_receipt',auth.uid(),jsonb_build_object('receipt_id',_receipt,'reason',trim(_reason)));
  PERFORM public.record_audit_event(_company,'purchase_order.reverse_receipt','purchase_order',_order,jsonb_build_object('receipt_id',_receipt,'reason',trim(_reason),'posts',false));
  RETURN jsonb_build_object('id',o.id,'status',o.status,'version',o.version,'receiptId',receipt.id);
END $$;
CREATE FUNCTION public.reverse_purchase_receipt(_company uuid,_order uuid,_receipt uuid,_request uuid,_reason text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.reverse_purchase_receipt(_company,_order,_receipt,_request,_reason) $$;

-- Old clients must reload; neither endpoint may bypass approval/version or receipt identity.
CREATE OR REPLACE FUNCTION private.change_purchase_order_atomic(_company uuid,_order uuid,_status text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Reload the purchase order to use versioned approval actions'; END $$;
CREATE OR REPLACE FUNCTION private.receive_purchase_order_goods(_company uuid,_order uuid,_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Reload the purchase order to record a dated receipt with a request ID'; END $$;

CREATE FUNCTION public.get_purchase_order_activity(_company uuid,_order uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'purchases.view') THEN RAISE EXCEPTION 'Purchase access denied' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.purchase_orders WHERE company_id=_company AND id=_order) THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  RETURN jsonb_build_object(
    'receipts',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY created_at DESC,id) FROM (SELECT id,receipt_date,reference,created_at,created_by,reversed_at,reversed_by,reversal_reason,lines FROM public.purchase_order_receipts WHERE company_id=_company AND order_id=_order ORDER BY created_at DESC,id LIMIT 200) r),'[]'::jsonb),
    'history',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY created_at DESC,id) FROM (SELECT id,action,actor_user_id,details,created_at FROM public.purchase_order_events WHERE company_id=_company AND order_id=_order ORDER BY created_at DESC,id LIMIT 200) e),'[]'::jsonb),
    'bills',coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY bill_date DESC,id) FROM (SELECT id,bill_number,bill_date,status,total_minor,currency_code FROM public.purchase_bills WHERE company_id=_company AND purchase_order_id=_order ORDER BY bill_date DESC,id LIMIT 200) b),'[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.browse_purchase_orders(_company uuid,_search text DEFAULT '',_status text DEFAULT 'all',_page integer DEFAULT 1,_size integer DEFAULT 25) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; pattern text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'purchases.view') THEN RAISE EXCEPTION 'Purchase access denied' USING ERRCODE='42501'; END IF;
  IF _page IS NULL OR _size IS NULL OR _page NOT BETWEEN 1 AND 100000 OR _size NOT BETWEEN 1 AND 100 OR length(coalesce(_search,''))>100 OR _status IS NULL OR _status NOT IN ('all','draft','sent','partially_received','billed','cancelled','pending','approved','rejected','late') THEN RAISE EXCEPTION 'Invalid order filters'; END IF;
  pattern:='%'||replace(replace(replace(trim(coalesce(_search,'')),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
  WITH filtered AS MATERIALIZED(SELECT o.id,o.order_number,o.order_date,o.currency_code,o.status,o.total_minor,o.billed_bill_id,o.version,o.approval_state,o.supplier_reference,o.expected_delivery_date,o.acknowledged_on,jsonb_build_object('name',c.name) contacts,
    coalesce((SELECT sum(greatest(0,l.quantity_received-l.quantity_billed)) FROM public.purchase_order_lines l WHERE l.company_id=o.company_id AND l.order_id=o.id),0) billable_quantity
    FROM public.purchase_orders o JOIN public.contacts c ON c.id=o.contact_id AND c.company_id=o.company_id WHERE o.company_id=_company AND
    (_status='all' OR o.status::text=_status OR (o.status='draft' AND o.approval_state=_status) OR (_status='late' AND o.status IN ('sent','partially_received') AND o.expected_delivery_date<current_date AND EXISTS(SELECT 1 FROM public.purchase_order_lines l WHERE l.company_id=_company AND l.order_id=o.id AND l.quantity_received<l.quantity)))
    AND (coalesce(o.order_number,'') ILIKE pattern OR c.name ILIKE pattern OR o.currency_code ILIKE pattern OR coalesce(o.supplier_reference,'') ILIKE pattern)), page AS(SELECT * FROM filtered ORDER BY order_date DESC,id DESC LIMIT _size OFFSET (_page-1)*_size)
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY order_date DESC,id DESC) FROM page),'[]'::jsonb),'total',(SELECT count(*) FROM filtered),'page',_page,'pageSize',_size) INTO result;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION private.manage_purchase_order(uuid,uuid,bigint,text,jsonb),public.manage_purchase_order(uuid,uuid,bigint,text,jsonb),private.receive_purchase_order(uuid,uuid,uuid,date,text,jsonb),public.receive_purchase_order(uuid,uuid,uuid,date,text,jsonb),private.reverse_purchase_receipt(uuid,uuid,uuid,uuid,text),public.reverse_purchase_receipt(uuid,uuid,uuid,uuid,text),public.get_purchase_order_activity(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.manage_purchase_order(uuid,uuid,bigint,text,jsonb),public.manage_purchase_order(uuid,uuid,bigint,text,jsonb),private.receive_purchase_order(uuid,uuid,uuid,date,text,jsonb),public.receive_purchase_order(uuid,uuid,uuid,date,text,jsonb),private.reverse_purchase_receipt(uuid,uuid,uuid,uuid,text),public.reverse_purchase_receipt(uuid,uuid,uuid,uuid,text),public.get_purchase_order_activity(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
