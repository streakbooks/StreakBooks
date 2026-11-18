-- Original LinkBooks PO billing allocation and lifecycle controls.
-- No posted values are rewritten. Ambiguous historical source matches fail closed.
ALTER TABLE public.purchase_bill_lines
  ADD COLUMN IF NOT EXISTS purchase_order_line_id uuid REFERENCES public.purchase_order_lines(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS po_rounding_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS po_tax_rounding_minor bigint NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_bills ADD COLUMN IF NOT EXISTS po_allocation_verified boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS purchase_bill_lines_po_source ON public.purchase_bill_lines(company_id,purchase_order_line_id) WHERE purchase_order_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS purchase_bills_po_active ON public.purchase_bills(company_id,purchase_order_id) WHERE purchase_order_id IS NOT NULL;

-- Map historical lines only when identity is unique on both sides of a bill.
WITH matches AS (
 SELECT bl.id, min(ol.id::text)::uuid AS source_id
 FROM public.purchase_bill_lines bl
 JOIN public.purchase_bills b ON b.id=bl.bill_id AND b.company_id=bl.company_id
 JOIN public.purchase_order_lines ol ON ol.order_id=b.purchase_order_id AND ol.company_id=b.company_id
   AND ol.account_id=bl.account_id AND lower(trim(ol.description))=lower(trim(bl.description))
   AND ol.unit_price_minor=bl.unit_price_minor AND ol.tax_rate_bps=bl.tax_rate_bps
 WHERE bl.purchase_order_line_id IS NULL
 GROUP BY bl.id HAVING count(*)=1
), unique_bill_matches AS (
 SELECT m.* FROM matches m JOIN public.purchase_bill_lines bl ON bl.id=m.id
 WHERE NOT EXISTS(SELECT 1 FROM matches m2 JOIN public.purchase_bill_lines bl2 ON bl2.id=m2.id
   WHERE m2.id<>m.id AND bl2.bill_id=bl.bill_id AND m2.source_id=m.source_id)
)
UPDATE public.purchase_bill_lines bl SET purchase_order_line_id=m.source_id FROM unique_bill_matches m WHERE bl.id=m.id;
UPDATE public.purchase_bills b SET po_allocation_verified=true
WHERE b.purchase_order_id IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.purchase_bill_lines bl WHERE bl.bill_id=b.id)
 AND NOT EXISTS(SELECT 1 FROM public.purchase_bill_lines bl WHERE bl.bill_id=b.id AND bl.purchase_order_line_id IS NULL);

CREATE OR REPLACE FUNCTION private.sync_po_bill_allocations(_company uuid,_order uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE full_bill boolean; first_bill uuid; has_receipts boolean;
BEGIN
 PERFORM 1 FROM public.purchase_orders WHERE company_id=_company AND id=_order FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 -- Never erase unknown historic reservations: they require explicit source reconciliation.
 IF EXISTS(SELECT 1 FROM public.purchase_bills b WHERE b.company_id=_company AND b.purchase_order_id=_order AND b.status::text<>'void' AND NOT b.po_allocation_verified) THEN RETURN; END IF;
 UPDATE public.purchase_order_lines ol SET quantity_billed=coalesce((
  SELECT sum(bl.quantity) FROM public.purchase_bill_lines bl JOIN public.purchase_bills b ON b.id=bl.bill_id AND b.company_id=bl.company_id
  WHERE bl.company_id=_company AND bl.purchase_order_line_id=ol.id AND b.purchase_order_id=_order AND b.status::text<>'void'
 ),0) WHERE ol.company_id=_company AND ol.order_id=_order;
 SELECT coalesce(bool_and(quantity_billed>=quantity),false),coalesce(bool_or(quantity_received>0),false)
 INTO full_bill,has_receipts FROM public.purchase_order_lines WHERE company_id=_company AND order_id=_order;
 SELECT id INTO first_bill FROM public.purchase_bills WHERE company_id=_company AND purchase_order_id=_order AND status::text<>'void' ORDER BY bill_date,id LIMIT 1;
 UPDATE public.purchase_orders SET billed_bill_id=first_bill,
  status=CASE WHEN full_bill THEN 'billed'::public.po_status WHEN has_receipts THEN 'partially_received'::public.po_status ELSE status END,
  version=version+1,updated_at=now() WHERE company_id=_company AND id=_order;
END $$;
REVOKE ALL ON FUNCTION private.sync_po_bill_allocations(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.guard_po_bill_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.purchase_bills; o public.purchase_orders; s public.purchase_order_lines; prior_qty numeric; prior_net numeric; prior_tax numeric; target_net numeric; target_tax numeric; raw_net numeric;
BEGIN
 IF TG_OP='DELETE' THEN
  IF private.po_reset_active(OLD.company_id) THEN RETURN OLD; END IF;
  SELECT * INTO b FROM public.purchase_bills WHERE id=OLD.bill_id;
  -- Cascade of a whole draft bill is allowed; individual source lines are fixed snapshots.
  IF FOUND AND b.purchase_order_id IS NOT NULL THEN RAISE EXCEPTION 'Purchase-order bill lines are fixed; delete the unposted bill and regenerate from the order'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND OLD.purchase_order_line_id IS NOT NULL THEN
  IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Purchase-order bill lines are fixed; delete the unposted bill and regenerate from the order'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO b FROM public.purchase_bills WHERE id=NEW.bill_id;
 IF b.purchase_order_id IS NULL THEN
  IF NEW.purchase_order_line_id IS NOT NULL OR NEW.po_rounding_minor<>0 OR NEW.po_tax_rounding_minor<>0 THEN RAISE EXCEPTION 'Order allocation requires a linked bill'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Purchase-order bill lines are fixed'; END IF;
 IF auth.uid() IS NULL OR NOT public.has_company_permission(b.company_id,'purchases.draft') THEN RAISE EXCEPTION 'Purchase access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.purchase_orders WHERE id=b.purchase_order_id AND company_id=b.company_id FOR UPDATE;
 IF NOT FOUND OR NEW.company_id<>b.company_id OR b.status::text<>'draft' OR NOT b.po_allocation_verified OR b.contact_id<>o.contact_id OR b.currency_code<>o.currency_code THEN RAISE EXCEPTION 'Invalid purchase-order bill header'; END IF;
 IF o.status::text NOT IN ('sent','partially_received') THEN RAISE EXCEPTION 'Order is not open for received-goods billing'; END IF;
 SELECT * INTO s FROM public.purchase_order_lines WHERE company_id=b.company_id AND order_id=o.id AND id=NEW.purchase_order_line_id FOR UPDATE;
 IF NOT FOUND OR NEW.account_id<>s.account_id OR NEW.description<>s.description OR NEW.unit_price_minor<>s.unit_price_minor OR NEW.tax_rate_bps<>s.tax_rate_bps OR NEW.quantity<=0 THEN RAISE EXCEPTION 'Bill line must retain its source order identity and rate'; END IF;
 SELECT coalesce(sum(bl.quantity),0),coalesce(sum(bl.net_minor),0),coalesce(sum(bl.tax_minor),0)
 INTO prior_qty,prior_net,prior_tax FROM public.purchase_bill_lines bl JOIN public.purchase_bills pb ON pb.id=bl.bill_id AND pb.company_id=bl.company_id
 WHERE bl.company_id=b.company_id AND bl.purchase_order_line_id=s.id AND pb.status::text<>'void';
 IF prior_qty+NEW.quantity>least(s.quantity,s.quantity_received) THEN RAISE EXCEPTION 'Cumulative billed quantity exceeds received order quantity'; END IF;
 target_net:=trunc(s.net_minor::numeric*(prior_qty+NEW.quantity)/s.quantity)-prior_net;
 target_tax:=round(s.tax_minor::numeric*(prior_qty+NEW.quantity)/s.quantity)-prior_tax;
 raw_net:=trunc(NEW.quantity*s.unit_price_minor);
 IF NEW.net_minor<>target_net OR NEW.tax_minor<>target_tax OR target_net<0 OR target_tax<0
  OR NEW.discount_minor<>greatest(0,raw_net-target_net)
  OR NEW.po_rounding_minor<>target_net-(raw_net-NEW.discount_minor)
  OR NEW.po_tax_rounding_minor<>target_tax-round(target_net*s.tax_rate_bps/10000)
  OR to_jsonb(NEW)->>'tax_code_id' IS NOT NULL
 THEN RAISE EXCEPTION 'Bill amounts must equal the cumulative purchase-order allocation'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_po_bill_line() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_po_bill_line BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_bill_lines FOR EACH ROW EXECUTE FUNCTION private.guard_po_bill_line();

CREATE OR REPLACE FUNCTION private.after_po_bill_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source uuid; tenant uuid; ord uuid;
BEGIN
 source:=CASE WHEN TG_OP='DELETE' THEN OLD.purchase_order_line_id ELSE NEW.purchase_order_line_id END;
 tenant:=CASE WHEN TG_OP='DELETE' THEN OLD.company_id ELSE NEW.company_id END;
 IF source IS NOT NULL THEN
  SELECT order_id INTO ord FROM public.purchase_order_lines WHERE id=source AND company_id=tenant;
  IF ord IS NOT NULL THEN PERFORM private.sync_po_bill_allocations(tenant,ord); END IF;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.after_po_bill_line() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER after_po_bill_line AFTER INSERT OR UPDATE OR DELETE ON public.purchase_bill_lines FOR EACH ROW EXECUTE FUNCTION private.after_po_bill_line();

CREATE OR REPLACE FUNCTION private.guard_po_bill_header()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF private.po_reset_active(OLD.company_id) THEN RETURN OLD; END IF;
  IF OLD.purchase_order_id IS NOT NULL AND (OLD.posted_journal_id IS NOT NULL OR OLD.status::text NOT IN ('draft','awaiting_approval')) THEN RAISE EXCEPTION 'Only unposted purchase-order drafts may be deleted'; END IF;
  RETURN OLD;
 END IF;
 IF OLD.purchase_order_id IS NOT NULL AND OLD.posted_journal_id IS NOT NULL AND (
  NEW.posted_journal_id IS DISTINCT FROM OLD.posted_journal_id OR NEW.bill_date IS DISTINCT FROM OLD.bill_date
  OR NEW.fx_rate_to_base IS DISTINCT FROM OLD.fx_rate_to_base OR NEW.status::text IN ('draft','awaiting_approval')
 ) THEN RAISE EXCEPTION 'Posted purchase-order bill journal, date and exchange-rate snapshot are immutable'; END IF;
 IF OLD.purchase_order_id IS NOT NULL AND OLD.void_journal_id IS NOT NULL
  AND NEW.void_journal_id IS DISTINCT FROM OLD.void_journal_id THEN RAISE EXCEPTION 'Purchase-order bill reversal link is immutable'; END IF;
 IF OLD.purchase_order_id IS NOT NULL AND (
  NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
  OR NEW.contact_id IS DISTINCT FROM OLD.contact_id OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
  OR NEW.tax_calculation IS DISTINCT FROM OLD.tax_calculation OR NEW.subtotal_minor IS DISTINCT FROM OLD.subtotal_minor
  OR NEW.tax_minor IS DISTINCT FROM OLD.tax_minor OR NEW.total_minor IS DISTINCT FROM OLD.total_minor
  OR NEW.po_allocation_verified IS DISTINCT FROM OLD.po_allocation_verified
 ) THEN RAISE EXCEPTION 'Purchase-order bill supplier, currency and commercial amounts are fixed'; END IF;
 IF OLD.purchase_order_id IS NULL AND NEW.purchase_order_id IS NOT NULL THEN RAISE EXCEPTION 'Create linked bills through purchase-order conversion'; END IF;
 IF OLD.purchase_order_id IS NOT NULL AND OLD.status::text='void' AND NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'A void purchase-order bill cannot be reactivated'; END IF;
 IF OLD.purchase_order_id IS NOT NULL AND (
    NEW.posted_journal_id IS DISTINCT FROM OLD.posted_journal_id OR NEW.void_journal_id IS DISTINCT FROM OLD.void_journal_id
    OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text IN ('authorised','void'))
 ) AND (auth.uid() IS NULL OR NOT public.has_company_permission(OLD.company_id,'purchases.authorise')) THEN
  RAISE EXCEPTION 'Purchase authorisation denied' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_po_bill_header() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_po_bill_header BEFORE UPDATE OR DELETE ON public.purchase_bills FOR EACH ROW EXECUTE FUNCTION private.guard_po_bill_header();

CREATE OR REPLACE FUNCTION private.after_po_bill_header()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.purchase_order_id IS NOT NULL THEN PERFORM private.sync_po_bill_allocations(OLD.company_id,OLD.purchase_order_id); END IF;
 ELSIF NEW.purchase_order_id IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status THEN
  PERFORM private.sync_po_bill_allocations(NEW.company_id,NEW.purchase_order_id);
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.after_po_bill_header() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER after_po_bill_header AFTER UPDATE OR DELETE ON public.purchase_bills FOR EACH ROW EXECUTE FUNCTION private.after_po_bill_header();

-- Deferred verification allows one atomic header+line insert, but never a committed
-- linked bill whose totals or line allocations disagree with its order.
CREATE OR REPLACE FUNCTION private.check_po_bill_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.purchase_bills; target uuid; tenant uuid;
BEGIN
 IF TG_TABLE_NAME='purchase_bills' THEN
  target:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 ELSE target:=CASE WHEN TG_OP='DELETE' THEN OLD.bill_id ELSE NEW.bill_id END; END IF;
 SELECT * INTO b FROM public.purchase_bills WHERE id=target;
 IF NOT FOUND OR b.purchase_order_id IS NULL THEN RETURN NULL; END IF;
 IF b.po_allocation_verified AND (NOT EXISTS(SELECT 1 FROM public.purchase_bill_lines WHERE bill_id=b.id)
 OR EXISTS(SELECT 1 FROM public.purchase_bill_lines WHERE bill_id=b.id AND (company_id<>b.company_id OR purchase_order_line_id IS NULL))
 OR b.subtotal_minor<>(SELECT coalesce(sum(net_minor),0) FROM public.purchase_bill_lines WHERE bill_id=b.id)
 OR b.tax_minor<>(SELECT coalesce(sum(tax_minor),0) FROM public.purchase_bill_lines WHERE bill_id=b.id)
 ) THEN RAISE EXCEPTION 'Purchase-order bill lines and header totals do not reconcile'; END IF;
 IF b.status::text IN ('authorised','partly_paid','paid') AND b.posted_journal_id IS NULL THEN
  RAISE EXCEPTION 'Purchase-order bill authorisation must post and link its journal atomically';
 END IF;
 IF b.posted_journal_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.journals j WHERE j.company_id=b.company_id AND j.id=b.posted_journal_id
    AND j.source_type::text='purchase_bill' AND j.source_id=b.id AND j.currency_code=b.currency_code
    AND j.journal_date=b.bill_date AND j.fx_rate_to_base IS NOT DISTINCT FROM b.fx_rate_to_base
 ) THEN RAISE EXCEPTION 'Purchase-order bill journal source is invalid'; END IF;
 IF b.status::text='void' AND b.posted_journal_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.journals j JOIN public.journals original ON original.id=b.posted_journal_id
  WHERE j.company_id=b.company_id AND j.id=b.void_journal_id AND j.reverses_journal_id=b.posted_journal_id
    AND j.source_type::text='reversal' AND j.journal_date=b.void_date
    AND original.reversed_by_journal_id=j.id
 ) THEN RAISE EXCEPTION 'Void the purchase-order bill and reverse its journal atomically'; END IF;
 IF b.status::text IN ('draft','awaiting_approval') AND b.posted_journal_id IS NOT NULL THEN
  RAISE EXCEPTION 'A posted purchase-order bill cannot return to draft';
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.check_po_bill_totals() FROM PUBLIC,anon,authenticated;
CREATE CONSTRAINT TRIGGER check_po_bill_totals_header AFTER INSERT OR UPDATE ON public.purchase_bills DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_po_bill_totals();
CREATE CONSTRAINT TRIGGER check_po_bill_totals_lines AFTER INSERT OR UPDATE OR DELETE ON public.purchase_bill_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_po_bill_totals();

CREATE OR REPLACE FUNCTION private.convert_purchase_order_atomic(_company uuid,_order uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.purchase_orders; bill uuid; terms integer; r record; line_no integer:=0; inputs jsonb:='[]'; item jsonb; prior_qty numeric; prior_net numeric; prior_tax numeric; q numeric; n bigint; t bigint; discount bigint; rounding bigint; tax_rounding bigint; subtotal bigint:=0; taxes bigint:=0; full_bill boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'purchases.draft') THEN RAISE EXCEPTION 'Purchase access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(_company::text||':workflow-reset',0));
 SELECT * INTO o FROM public.purchase_orders WHERE company_id=_company AND id=_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
 IF o.status::text='billed' AND o.billed_bill_id IS NOT NULL THEN RETURN jsonb_build_object('billId',o.billed_bill_id,'fullyBilled',true,'status','billed'); END IF;
 IF coalesce(to_jsonb(o)->>'approval_state','approved')<>'approved' THEN RAISE EXCEPTION 'Order approval is required before billing'; END IF;
 IF o.status::text NOT IN ('sent','partially_received') THEN RAISE EXCEPTION 'Bill received goods only on sent or partially received purchase orders'; END IF;
 IF EXISTS(SELECT 1 FROM public.purchase_bills b WHERE b.company_id=_company AND b.purchase_order_id=_order AND b.status::text<>'void' AND NOT b.po_allocation_verified) THEN RAISE EXCEPTION 'Historical bill source lines require reconciliation before further conversion'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.contacts WHERE company_id=_company AND id=o.contact_id AND is_active AND kind::text IN ('supplier','both')) THEN RAISE EXCEPTION 'Active supplier required'; END IF;
 SELECT greatest(0,coalesce(payment_terms_days,30)) INTO terms FROM public.contacts WHERE company_id=_company AND id=o.contact_id;
 FOR r IN SELECT * FROM public.purchase_order_lines WHERE company_id=_company AND order_id=_order ORDER BY line_no FOR UPDATE LOOP
  IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE company_id=_company AND id=r.account_id AND is_active AND is_postable AND archived_at IS NULL) THEN RAISE EXCEPTION 'Order account is inactive'; END IF;
  SELECT coalesce(sum(bl.quantity),0),coalesce(sum(bl.net_minor),0),coalesce(sum(bl.tax_minor),0) INTO prior_qty,prior_net,prior_tax
  FROM public.purchase_bill_lines bl JOIN public.purchase_bills b ON b.id=bl.bill_id AND b.company_id=bl.company_id
  WHERE bl.company_id=_company AND bl.purchase_order_line_id=r.id AND b.status::text<>'void';
  q:=least(r.quantity,r.quantity_received)-prior_qty;
  IF q<=0 THEN CONTINUE; END IF;
  n:=trunc(r.net_minor::numeric*(prior_qty+q)/r.quantity)-prior_net;
  t:=round(r.tax_minor::numeric*(prior_qty+q)/r.quantity)-prior_tax;
  discount:=greatest(0,trunc(q*r.unit_price_minor)-n);
  rounding:=n-(trunc(q*r.unit_price_minor)-discount);
  tax_rounding:=t-round(n::numeric*r.tax_rate_bps/10000);
  IF n<0 OR t<0 THEN RAISE EXCEPTION 'Prior bill amounts exceed cumulative order allocation; reconcile source bills'; END IF;
  line_no:=line_no+1;
  inputs:=inputs||jsonb_build_array(jsonb_build_object('source',r.id,'lineNo',line_no,'description',r.description,'account',r.account_id,'quantity',q,'price',r.unit_price_minor,'discount',discount,'rate',r.tax_rate_bps,'net',n,'tax',t,'rounding',rounding,'taxRounding',tax_rounding));
  subtotal:=subtotal+n; taxes:=taxes+t;
 END LOOP;
 IF line_no=0 THEN RAISE EXCEPTION 'Nothing to bill. Receive goods before converting, or all received quantities are already billed.'; END IF;
 IF subtotal+taxes<=0 THEN RAISE EXCEPTION 'No payable amount in the received allocation. Accumulate more received goods before billing; zero-value procurement requires a nonfinancial close.'; END IF;
 INSERT INTO public.purchase_bills(company_id,contact_id,bill_number,bill_date,due_date,payment_terms_days,tax_calculation,currency_code,memo,status,subtotal_minor,tax_minor,total_minor,purchase_order_id,created_by,po_allocation_verified)
 VALUES(_company,o.contact_id,public.allocate_document_number(_company,'purchase_bill'),o.order_date,o.order_date+terms,terms,'exclusive',o.currency_code,o.memo,'draft',subtotal,taxes,subtotal+taxes,o.id,auth.uid(),true) RETURNING id INTO bill;
 FOR item IN SELECT value FROM jsonb_array_elements(inputs) LOOP
  INSERT INTO public.purchase_bill_lines(company_id,bill_id,line_no,description,account_id,quantity,unit_price_minor,discount_minor,tax_rate_bps,net_minor,tax_minor,purchase_order_line_id,po_rounding_minor,po_tax_rounding_minor)
  VALUES(_company,bill,(item->>'lineNo')::integer,item->>'description',(item->>'account')::uuid,(item->>'quantity')::numeric,(item->>'price')::bigint,(item->>'discount')::bigint,(item->>'rate')::integer,(item->>'net')::bigint,(item->>'tax')::bigint,(item->>'source')::uuid,(item->>'rounding')::bigint,(item->>'taxRounding')::bigint);
 END LOOP;
 SELECT bool_and(quantity_billed>=quantity) INTO full_bill FROM public.purchase_order_lines WHERE company_id=_company AND order_id=_order;
 PERFORM public.record_audit_event(_company,'purchase_order_converted','purchase_order',_order,jsonb_build_object('bill_id',bill,'mode','received_unbilled','fully_billed',full_bill,'posts',false));
 RETURN jsonb_build_object('billId',bill,'fullyBilled',full_bill,'status',CASE WHEN full_bill THEN 'billed' ELSE 'partially_received' END);
END $$;

CREATE OR REPLACE FUNCTION private.validate_purchase_order_bill(_company uuid,_bill uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.purchase_bills; o public.purchase_orders; issues jsonb:='[]'; r record; qty numeric; net numeric; tax numeric;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'purchases.view') THEN RAISE EXCEPTION 'Purchase access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO b FROM public.purchase_bills WHERE company_id=_company AND id=_bill;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found'; END IF;
 IF b.purchase_order_id IS NULL THEN RETURN jsonb_build_object('applicable',false,'status','na','issues','[]'::jsonb); END IF;
 SELECT * INTO o FROM public.purchase_orders WHERE company_id=_company AND id=b.purchase_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Source order not found'; END IF;
 IF NOT b.po_allocation_verified THEN issues:=issues||jsonb_build_array('Historical bill source lines require reconciliation.'); END IF;
 IF b.contact_id<>o.contact_id OR b.currency_code<>o.currency_code THEN issues:=issues||jsonb_build_array('Bill supplier or currency differs from its order.'); END IF;
 IF EXISTS(SELECT 1 FROM public.purchase_bill_lines WHERE bill_id=b.id AND purchase_order_line_id IS NULL) THEN issues:=issues||jsonb_build_array('Bill source order lines are missing.'); END IF;
 FOR r IN SELECT * FROM public.purchase_order_lines WHERE company_id=_company AND order_id=o.id LOOP
  SELECT coalesce(sum(bl.quantity),0),coalesce(sum(bl.net_minor),0),coalesce(sum(bl.tax_minor),0) INTO qty,net,tax
  FROM public.purchase_bill_lines bl JOIN public.purchase_bills pb ON pb.id=bl.bill_id AND pb.company_id=bl.company_id
  WHERE bl.company_id=_company AND bl.purchase_order_line_id=r.id AND pb.status::text<>'void';
  IF qty>least(r.quantity,r.quantity_received) OR net>r.net_minor OR tax>r.tax_minor THEN issues:=issues||jsonb_build_array('Cumulative billed quantities or amounts exceed received order allocation.'); END IF;
 END LOOP;
 IF b.subtotal_minor<>(SELECT coalesce(sum(net_minor),0) FROM public.purchase_bill_lines WHERE bill_id=b.id) OR b.tax_minor<>(SELECT coalesce(sum(tax_minor),0) FROM public.purchase_bill_lines WHERE bill_id=b.id) THEN issues:=issues||jsonb_build_array('Bill header and line amounts differ.'); END IF;
 RETURN jsonb_build_object('applicable',true,'status',CASE WHEN jsonb_array_length(issues)=0 THEN 'pass' ELSE 'fail' END,'issues',issues,'lines','[]'::jsonb,
  'totals',jsonb_build_object(
    'orderedQuantity',(SELECT coalesce(sum(quantity),0) FROM public.purchase_order_lines WHERE company_id=_company AND order_id=o.id),
    'receivedQuantity',(SELECT coalesce(sum(quantity_received),0) FROM public.purchase_order_lines WHERE company_id=_company AND order_id=o.id),
    'billedQuantity',(SELECT coalesce(sum(quantity),0) FROM public.purchase_bill_lines WHERE company_id=_company AND bill_id=b.id),
    'orderedNetMinor',o.subtotal_minor,'billedNetMinor',b.subtotal_minor));
END $$;
CREATE OR REPLACE FUNCTION public.validate_purchase_order_bill(_company uuid,_bill uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.validate_purchase_order_bill(_company,_bill) $$;

CREATE OR REPLACE FUNCTION private.delete_purchase_order_bill_atomic(_company uuid,_bill uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.purchase_bills; ord uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'purchases.draft') THEN RAISE EXCEPTION 'Purchase access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(_company::text||':workflow-reset',0));
 SELECT purchase_order_id INTO ord FROM public.purchase_bills WHERE company_id=_company AND id=_bill;
 IF ord IS NULL THEN RAISE EXCEPTION 'Linked purchase-order bill not found'; END IF;
 PERFORM 1 FROM public.purchase_orders WHERE company_id=_company AND id=ord FOR UPDATE;
 SELECT * INTO b FROM public.purchase_bills WHERE company_id=_company AND id=_bill FOR UPDATE;
 IF NOT FOUND OR b.status::text NOT IN ('draft','awaiting_approval') OR b.posted_journal_id IS NOT NULL THEN RAISE EXCEPTION 'Only unposted purchase-order draft bills may be deleted'; END IF;
 DELETE FROM public.document_attachments WHERE company_id=_company AND entity_type='purchase_bill' AND entity_id=_bill;
 DELETE FROM public.purchase_bills WHERE company_id=_company AND id=_bill;
 PERFORM private.sync_po_bill_allocations(_company,ord);
 PERFORM public.record_audit_event(_company,'bill.draft.delete','purchase_bill',_bill,jsonb_build_object('purchase_order_id',ord,'posts',false));
 RETURN jsonb_build_object('ok',true);
END $$;
CREATE OR REPLACE FUNCTION public.delete_purchase_order_bill_atomic(_company uuid,_bill uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.delete_purchase_order_bill_atomic(_company,_bill) $$;

CREATE OR REPLACE FUNCTION private.update_po_bill_details(_company uuid,_bill uuid,_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.purchase_bills; ord uuid; base text; fx numeric; v_bill_date date; v_due_date date; invoice text; expected timestamptz;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'purchases.draft') THEN RAISE EXCEPTION 'Purchase access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(_company::text||':workflow-reset',0));
 SELECT purchase_order_id INTO ord FROM public.purchase_bills WHERE company_id=_company AND id=_bill;
 IF ord IS NULL THEN RAISE EXCEPTION 'Linked purchase-order bill not found'; END IF;
 PERFORM 1 FROM public.purchase_orders WHERE company_id=_company AND id=ord FOR UPDATE;
 SELECT * INTO b FROM public.purchase_bills WHERE company_id=_company AND id=_bill FOR UPDATE;
 IF NOT FOUND OR b.status::text NOT IN ('draft','awaiting_approval') OR b.posted_journal_id IS NOT NULL THEN RAISE EXCEPTION 'Only unposted purchase-order draft details may be edited'; END IF;
 expected:=nullif(_payload->>'expectedUpdatedAt','')::timestamptz;
 IF expected IS NULL OR b.updated_at IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Bill changed; reload before saving' USING ERRCODE='40001'; END IF;
 v_bill_date:=(_payload->>'billDate')::date; v_due_date:=(_payload->>'dueDate')::date; invoice:=nullif(trim(_payload->>'supplierInvoiceNumber'),''); fx:=nullif(_payload->>'fxRateToBase','')::numeric;
 IF v_bill_date IS NULL OR v_due_date IS NULL OR v_due_date<v_bill_date OR length(coalesce(invoice,''))>80 OR length(coalesce(_payload->>'memo',''))>500 THEN RAISE EXCEPTION 'Invalid bill dates, invoice reference or memo'; END IF;
 SELECT base_currency INTO base FROM public.companies WHERE id=_company;
 IF b.currency_code=base THEN fx:=NULL; ELSIF fx IS NULL OR round(fx,8)<=0 OR fx>1000000000 OR fx::text='NaN' THEN RAISE EXCEPTION 'Positive exchange rate with up to eight decimal places required for foreign-currency bill'; END IF;
 IF invoice IS NOT NULL AND EXISTS(SELECT 1 FROM public.purchase_bills WHERE company_id=_company AND contact_id=b.contact_id AND id<>_bill AND status::text<>'void' AND lower(supplier_invoice_number)=lower(invoice)) THEN RAISE EXCEPTION 'Supplier invoice number already exists'; END IF;
 UPDATE public.purchase_bills SET bill_date=v_bill_date,due_date=v_due_date,supplier_invoice_number=invoice,memo=nullif(trim(_payload->>'memo'),''),fx_rate_to_base=fx,updated_at=clock_timestamp() WHERE company_id=_company AND id=_bill RETURNING * INTO b;
 PERFORM public.record_audit_event(_company,'purchase_order_bill_details_updated','purchase_bill',_bill,jsonb_build_object('purchase_order_id',ord));
 RETURN jsonb_build_object('id',b.id,'updatedAt',b.updated_at);
END $$;
CREATE OR REPLACE FUNCTION public.update_po_bill_details(_company uuid,_bill uuid,_payload jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.update_po_bill_details(_company,_bill,_payload) $$;

REVOKE ALL ON FUNCTION private.convert_purchase_order_atomic(uuid,uuid),public.convert_purchase_order_atomic(uuid,uuid),private.validate_purchase_order_bill(uuid,uuid),public.validate_purchase_order_bill(uuid,uuid),private.delete_purchase_order_bill_atomic(uuid,uuid),public.delete_purchase_order_bill_atomic(uuid,uuid),private.update_po_bill_details(uuid,uuid,jsonb),public.update_po_bill_details(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.convert_purchase_order_atomic(uuid,uuid),public.convert_purchase_order_atomic(uuid,uuid),private.validate_purchase_order_bill(uuid,uuid),public.validate_purchase_order_bill(uuid,uuid),private.delete_purchase_order_bill_atomic(uuid,uuid),public.delete_purchase_order_bill_atomic(uuid,uuid),private.update_po_bill_details(uuid,uuid,jsonb),public.update_po_bill_details(uuid,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';

-- Atomic PO bill authorisation reuses the shared posting engine and derives every
-- commercial debit/credit from stored source allocations, never a client payload.
CREATE OR REPLACE FUNCTION private.authorise_purchase_order_bill_atomic(_company uuid,_bill uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.purchase_bills; ord uuid; ap uuid; vat uuid; base text; fx numeric; r record; journal uuid; lines jsonb:='[]'; verdict jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'purchases.authorise') THEN RAISE EXCEPTION 'Purchase authorisation denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(_company::text||':workflow-reset',0));
 SELECT purchase_order_id INTO ord FROM public.purchase_bills WHERE company_id=_company AND id=_bill;
 IF ord IS NULL THEN RAISE EXCEPTION 'Linked purchase-order bill not found'; END IF;
 PERFORM 1 FROM public.purchase_orders WHERE company_id=_company AND id=ord FOR UPDATE;
 SELECT * INTO b FROM public.purchase_bills WHERE company_id=_company AND id=_bill FOR UPDATE;
 IF b.posted_journal_id IS NOT NULL AND b.status::text IN ('authorised','partly_paid','paid') THEN RETURN jsonb_build_object('journalId',b.posted_journal_id); END IF;
 IF NOT FOUND OR b.status::text NOT IN ('draft','awaiting_approval') OR b.posted_journal_id IS NOT NULL THEN RAISE EXCEPTION 'Only unposted purchase-order drafts can be authorised'; END IF;
 verdict:=private.validate_purchase_order_bill(_company,_bill);
 IF verdict->>'status'<>'pass' THEN RAISE EXCEPTION 'Purchase-order matching failed: %',verdict->'issues'; END IF;
 IF b.tax_calculation<>'exclusive' THEN RAISE EXCEPTION 'Unsupported purchase-order tax calculation'; END IF;
 SELECT id INTO ap FROM public.accounts WHERE company_id=_company AND is_active AND is_postable AND archived_at IS NULL AND (system_key='ap' OR code='2000') ORDER BY (system_key='ap') DESC NULLS LAST,id LIMIT 1;
 IF ap IS NULL THEN RAISE EXCEPTION 'Active accounts payable control account is required'; END IF;
 IF b.tax_minor>0 THEN
  SELECT input_tax_account_id INTO vat FROM public.company_tax_settings WHERE company_id=_company;
  IF vat IS NULL THEN SELECT id INTO vat FROM public.accounts WHERE company_id=_company AND code='1200' AND is_active AND is_postable AND archived_at IS NULL LIMIT 1; END IF;
  IF vat IS NULL OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE company_id=_company AND id=vat AND is_active AND is_postable AND archived_at IS NULL) THEN RAISE EXCEPTION 'Active input tax control account is required'; END IF;
 END IF;
 FOR r IN SELECT * FROM public.purchase_bill_lines WHERE company_id=_company AND bill_id=_bill ORDER BY line_no LOOP
  IF r.net_minor>0 THEN lines:=lines||jsonb_build_array(jsonb_build_object('account_id',r.account_id,'description',r.description,'debit_minor',r.net_minor,'credit_minor',0)); END IF;
 END LOOP;
 IF b.tax_minor>0 THEN lines:=lines||jsonb_build_array(jsonb_build_object('account_id',vat,'description','Input tax','debit_minor',b.tax_minor,'credit_minor',0)); END IF;
 lines:=lines||jsonb_build_array(jsonb_build_object('account_id',ap,'description','Accounts payable','debit_minor',0,'credit_minor',b.total_minor));
 SELECT base_currency INTO base FROM public.companies WHERE id=_company;
 fx:=CASE WHEN b.currency_code=base THEN 1 ELSE b.fx_rate_to_base END;
 IF fx IS NULL THEN fx:=public.lookup_fx_rate_to_base(_company,b.currency_code,b.bill_date); END IF;
 IF fx IS NULL OR fx<=0 OR fx>1000000000 OR fx::text='NaN' THEN RAISE EXCEPTION 'Valid exchange rate required'; END IF;
 journal:=public.post_journal(jsonb_build_object('company_id',_company,'journal_date',b.bill_date,'currency_code',b.currency_code,'fx_rate_to_base',fx,'source_type','purchase_bill','source_id',_bill,'idempotency_key','purchase_bill:'||_bill||':authorise','memo',b.memo,'lines',lines));
 UPDATE public.purchase_bills SET status='authorised',posted_journal_id=journal,authorised_at=now(),authorised_by=auth.uid(),fx_rate_to_base=fx,updated_at=clock_timestamp() WHERE company_id=_company AND id=_bill;
 PERFORM public.record_audit_event(_company,'bill.authorise','purchase_bill',_bill,jsonb_build_object('journal_id',journal,'purchase_order_id',ord));
 RETURN jsonb_build_object('journalId',journal);
END $$;
CREATE OR REPLACE FUNCTION public.authorise_purchase_order_bill_atomic(_company uuid,_bill uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.authorise_purchase_order_bill_atomic(_company,_bill) $$;

CREATE OR REPLACE FUNCTION private.void_purchase_order_bill_atomic(_company uuid,_bill uuid,_reason text,_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.purchase_bills; ord uuid; journal uuid; today date;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'purchases.authorise') THEN RAISE EXCEPTION 'Purchase authorisation denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(_company::text||':workflow-reset',0));
 SELECT purchase_order_id INTO ord FROM public.purchase_bills WHERE company_id=_company AND id=_bill;
 IF ord IS NULL THEN RAISE EXCEPTION 'Linked purchase-order bill not found'; END IF;
 PERFORM 1 FROM public.purchase_orders WHERE company_id=_company AND id=ord FOR UPDATE;
 SELECT * INTO b FROM public.purchase_bills WHERE company_id=_company AND id=_bill FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found'; END IF;
 SELECT (now() AT TIME ZONE timezone)::date INTO today FROM public.companies WHERE id=_company;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found'; END IF;
 IF b.status::text='void' THEN
  IF b.void_date=_date AND b.void_reason=trim(_reason) THEN RETURN jsonb_build_object('ok',true,'journalId',b.void_journal_id); END IF;
  RAISE EXCEPTION 'Bill already void with different details';
 END IF;
 IF b.amount_paid_minor>0 OR b.amount_credited_minor>0 THEN RAISE EXCEPTION 'Reverse bill payments and credits before voiding'; END IF;
 IF length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 500 OR _date IS NULL OR _date<b.bill_date OR _date>today THEN RAISE EXCEPTION 'Valid reason and void date on or after bill date, through today, required'; END IF;
 IF b.posted_journal_id IS NOT NULL THEN journal:=public.reverse_journal_on(b.posted_journal_id,_date,'purchase_bill:'||_bill||':void'); END IF;
 UPDATE public.purchase_bills SET status='void',void_journal_id=journal,void_date=_date,void_reason=trim(_reason),updated_at=clock_timestamp() WHERE company_id=_company AND id=_bill;
 PERFORM public.record_audit_event(_company,'bill.void','purchase_bill',_bill,jsonb_build_object('void_journal_id',journal,'purchase_order_id',ord,'reason',trim(_reason),'void_date',_date));
 RETURN jsonb_build_object('ok',true,'journalId',journal);
END $$;
CREATE OR REPLACE FUNCTION public.void_purchase_order_bill_atomic(_company uuid,_bill uuid,_reason text,_date date) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.void_purchase_order_bill_atomic(_company,_bill,_reason,_date) $$;

-- A direct legacy post_journal call cannot commit an unlinked PO journal. The
-- source order/bill lock serializes deletion and metadata edits with posting.
CREATE OR REPLACE FUNCTION private.lock_po_bill_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.purchase_bills; ord uuid;
BEGIN
 IF NEW.source_type::text<>'purchase_bill' THEN RETURN NEW; END IF;
 SELECT purchase_order_id INTO ord FROM public.purchase_bills WHERE company_id=NEW.company_id AND id=NEW.source_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Purchase bill source no longer exists'; END IF;
 IF ord IS NULL THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL OR NOT public.has_company_permission(NEW.company_id,'purchases.authorise') THEN RAISE EXCEPTION 'Purchase authorisation denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.purchase_orders WHERE company_id=NEW.company_id AND id=ord FOR UPDATE;
 SELECT * INTO b FROM public.purchase_bills WHERE company_id=NEW.company_id AND id=NEW.source_id FOR UPDATE;
 IF NOT FOUND OR b.status::text NOT IN ('draft','awaiting_approval') OR b.posted_journal_id IS NOT NULL THEN RAISE EXCEPTION 'Bill is no longer available for authorisation'; END IF;
 IF NEW.journal_date<>b.bill_date OR NEW.currency_code<>b.currency_code OR NEW.idempotency_key IS DISTINCT FROM 'purchase_bill:'||b.id||':authorise' THEN RAISE EXCEPTION 'Journal must retain its bill source and currency snapshot'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.lock_po_bill_journal() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER lock_po_bill_journal BEFORE INSERT ON public.journals FOR EACH ROW EXECUTE FUNCTION private.lock_po_bill_journal();

CREATE OR REPLACE FUNCTION private.check_po_bill_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.purchase_bills; ap uuid; vat uuid; debits numeric; credits numeric; r record;
BEGIN
 -- Generic journal reversal must not leave a PO bill looking authorised. The
 -- shared engine still performs the reversal; this deferred check requires its
 -- accounting and operational documents to commit as the same transaction.
 IF NEW.reverses_journal_id IS NOT NULL THEN
  SELECT pb.* INTO b FROM public.purchase_bills pb JOIN public.journals original
    ON original.id=NEW.reverses_journal_id AND original.company_id=pb.company_id
    AND original.source_type::text='purchase_bill' AND original.source_id=pb.id
  WHERE pb.company_id=NEW.company_id AND pb.purchase_order_id IS NOT NULL;
  IF FOUND THEN
   IF b.status::text<>'void' OR b.void_journal_id IS DISTINCT FROM NEW.id
     OR NEW.source_type::text<>'reversal' OR NEW.journal_date IS DISTINCT FROM b.void_date
     OR NEW.currency_code IS DISTINCT FROM b.currency_code
     OR NEW.fx_rate_to_base IS DISTINCT FROM b.fx_rate_to_base THEN
    RAISE EXCEPTION 'Reverse purchase-order bill journals through atomic bill voiding';
   END IF;
   IF EXISTS(
    SELECT 1 FROM (
      SELECT account_id,sum(debit_minor) AS debit,sum(credit_minor) AS credit
      FROM public.journal_lines WHERE company_id=b.company_id AND journal_id=NEW.reverses_journal_id GROUP BY account_id
    ) original FULL JOIN (
      SELECT account_id,sum(debit_minor) AS debit,sum(credit_minor) AS credit
      FROM public.journal_lines WHERE company_id=b.company_id AND journal_id=NEW.id GROUP BY account_id
    ) reversal USING(account_id)
    WHERE coalesce(original.debit,0)<>coalesce(reversal.credit,0) OR coalesce(original.credit,0)<>coalesce(reversal.debit,0)
   ) THEN RAISE EXCEPTION 'Purchase-order bill reversal must exactly reverse its source accounts and amounts'; END IF;
  END IF;
  RETURN NULL;
 END IF;
 IF NEW.source_type::text<>'purchase_bill' THEN RETURN NULL; END IF;
 SELECT * INTO b FROM public.purchase_bills WHERE company_id=NEW.company_id AND id=NEW.source_id;
 IF NOT FOUND OR b.purchase_order_id IS NULL THEN RETURN NULL; END IF;
 IF b.posted_journal_id IS DISTINCT FROM NEW.id OR b.status::text NOT IN ('authorised','partly_paid','paid','void') OR b.fx_rate_to_base IS DISTINCT FROM NEW.fx_rate_to_base THEN RAISE EXCEPTION 'Post purchase-order bills through atomic authorisation'; END IF;
 SELECT id INTO ap FROM public.accounts WHERE company_id=b.company_id AND is_active AND is_postable AND archived_at IS NULL AND (system_key='ap' OR code='2000') ORDER BY (system_key='ap') DESC NULLS LAST,id LIMIT 1;
 SELECT input_tax_account_id INTO vat FROM public.company_tax_settings WHERE company_id=b.company_id;
 IF vat IS NULL THEN SELECT id INTO vat FROM public.accounts WHERE company_id=b.company_id AND code='1200' AND is_active AND is_postable AND archived_at IS NULL LIMIT 1; END IF;
 SELECT coalesce(sum(debit_minor),0),coalesce(sum(credit_minor),0) INTO debits,credits FROM public.journal_lines WHERE company_id=b.company_id AND journal_id=NEW.id;
 IF debits<>b.total_minor OR credits<>b.total_minor
 OR NOT EXISTS(SELECT 1 FROM public.journal_lines WHERE journal_id=NEW.id AND company_id=b.company_id AND account_id=ap AND credit_minor=b.total_minor AND debit_minor=0)
 OR EXISTS(SELECT 1 FROM public.journal_lines jl WHERE jl.journal_id=NEW.id AND jl.company_id=b.company_id AND jl.credit_minor>0 AND jl.account_id<>ap)
 THEN RAISE EXCEPTION 'Journal accounts or amounts do not match the purchase-order bill'; END IF;
 FOR r IN SELECT account_id,sum(net_minor) AS amount FROM public.purchase_bill_lines WHERE bill_id=b.id GROUP BY account_id LOOP
  IF coalesce((SELECT sum(debit_minor) FROM public.journal_lines WHERE company_id=b.company_id AND journal_id=NEW.id AND account_id=r.account_id),0)<>(r.amount+CASE WHEN r.account_id=vat THEN b.tax_minor ELSE 0 END) THEN RAISE EXCEPTION 'Journal expense accounts do not match source bill lines'; END IF;
 END LOOP;
 IF b.tax_minor>0 AND coalesce((SELECT sum(debit_minor) FROM public.journal_lines WHERE company_id=b.company_id AND journal_id=NEW.id AND account_id=vat),0)<>b.tax_minor+coalesce((SELECT sum(net_minor) FROM public.purchase_bill_lines WHERE bill_id=b.id AND account_id=vat),0) THEN RAISE EXCEPTION 'Journal input tax account does not match the bill'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.check_po_bill_journal() FROM PUBLIC,anon,authenticated;
CREATE CONSTRAINT TRIGGER check_po_bill_journal AFTER INSERT ON public.journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_po_bill_journal();
REVOKE ALL ON FUNCTION private.authorise_purchase_order_bill_atomic(uuid,uuid),public.authorise_purchase_order_bill_atomic(uuid,uuid),private.void_purchase_order_bill_atomic(uuid,uuid,text,date),public.void_purchase_order_bill_atomic(uuid,uuid,text,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.authorise_purchase_order_bill_atomic(uuid,uuid),public.authorise_purchase_order_bill_atomic(uuid,uuid),private.void_purchase_order_bill_atomic(uuid,uuid,text,date),public.void_purchase_order_bill_atomic(uuid,uuid,text,date) TO authenticated;
NOTIFY pgrst,'reload schema';
