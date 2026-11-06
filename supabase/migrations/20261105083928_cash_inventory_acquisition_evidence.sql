-- Reporting evidence only; no postings or journal mutations.
ALTER TABLE public.cash_inventory_evidence DROP CONSTRAINT cash_inventory_evidence_purchase_document_id_fkey;
ALTER TABLE public.cash_inventory_evidence DROP CONSTRAINT cash_inventory_evidence_movement_kind_check;
ALTER TABLE public.cash_inventory_evidence ADD CONSTRAINT cash_inventory_evidence_movement_kind_check CHECK(movement_kind IN ('sale','customer_return','supplier_return','opening_source'));
ALTER TABLE public.cash_inventory_evidence
 ADD COLUMN source_kind text NOT NULL DEFAULT 'purchase_bill' CHECK(source_kind IN ('purchase_bill','direct_cash','opening_inventory')),
 ADD COLUMN opening_equity_account_id uuid REFERENCES public.accounts(id),
 ADD COLUMN opening_paid_minor bigint CHECK(opening_paid_minor>=0 AND opening_paid_minor<=cost_minor),
 ADD COLUMN payment_evidence_journal_ids uuid[] NOT NULL DEFAULT '{}',
 ADD COLUMN payment_evidence_snapshots jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(payment_evidence_snapshots)='array');
ALTER TABLE public.cash_inventory_evidence ADD CONSTRAINT cash_inventory_source_identity CHECK(source_kind='purchase_bill' OR purchase_document_id=purchase_journal_id);
ALTER TABLE public.cash_inventory_evidence ADD CONSTRAINT cash_inventory_opening_source CHECK(
 (movement_kind='opening_source' AND source_kind='opening_inventory' AND opening_paid_minor IS NOT NULL AND opening_equity_account_id IS NOT NULL AND movement_journal_id=purchase_journal_id)
 OR (movement_kind<>'opening_source' AND opening_paid_minor IS NULL AND opening_equity_account_id IS NULL AND cardinality(payment_evidence_journal_ids)=0));

CREATE INDEX cash_inventory_opening_equity ON public.cash_inventory_evidence(opening_equity_account_id);

CREATE OR REPLACE FUNCTION private.approve_cash_inventory_evidence(_company_id uuid,_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE doc public.purchase_bills; acquisition public.journals; movement public.journals; proof public.journals; source_kind text:=COALESCE(_payload->>'source_kind','purchase_bill'); source_id uuid:=(_payload->>'purchase_document_id')::uuid; carry bigint:=NULLIF(_payload->>'opening_paid_minor','')::bigint; proof_ids uuid[]; proof_snapshots jsonb:='[]'; proof_stock numeric:=0; proof_cash numeric:=0; stock_cost bigint; cash_out bigint; previous public.cash_inventory_evidence; original public.cash_inventory_evidence;
 inventory_id uuid:=(_payload->>'inventory_account_id')::uuid; amount bigint:=(_payload->>'cost_minor')::bigint; p public.cash_inventory_evidence; used bigint; movement_cost bigint;
BEGIN
 PERFORM private.assert_cash_review(_company_id,_payload);
 SELECT * INTO acquisition FROM public.journals WHERE id=(_payload->>'purchase_journal_id')::uuid AND company_id=_company_id AND status='posted' FOR UPDATE;
 IF NOT FOUND OR amount<=0 THEN RAISE EXCEPTION 'Select the actual posted acquisition and positive verified cost'; END IF;
 IF source_kind='purchase_bill' THEN
  SELECT * INTO doc FROM public.purchase_bills WHERE id=source_id AND company_id=_company_id AND posted_journal_id=acquisition.id;
  IF NOT FOUND OR acquisition.source_type<>'purchase_bill' THEN RAISE EXCEPTION 'Select the actual posted purchase bill'; END IF;
 ELSIF source_kind NOT IN ('direct_cash','opening_inventory') OR source_id<>acquisition.id THEN RAISE EXCEPTION 'Non-bill sources must identify the original posted acquisition journal'; END IF;
 SELECT COALESCE(sum(public.ops_minor_to_base(_company_id,l.debit_minor-l.credit_minor,acquisition.currency_code,acquisition.fx_rate_to_base)),0) INTO stock_cost FROM public.journal_lines l WHERE l.company_id=_company_id AND l.journal_id=acquisition.id AND l.account_id=inventory_id;
 IF stock_cost<=0 THEN RAISE EXCEPTION 'Acquisition has no positive inventory source cost'; END IF;
 IF source_kind='direct_cash' THEN
  IF acquisition.source_type IN ('opening_balance','purchase_bill','purchase_credit_note','sales_invoice','sales_credit_note') THEN RAISE EXCEPTION 'Source is not a direct-cash acquisition'; END IF;
  SELECT COALESCE(sum(public.ops_minor_to_base(_company_id,l.credit_minor-l.debit_minor,acquisition.currency_code,acquisition.fx_rate_to_base)),0) INTO cash_out
   FROM public.journal_lines l WHERE l.company_id=_company_id AND l.journal_id=acquisition.id AND EXISTS(SELECT 1 FROM public.bank_accounts b WHERE b.company_id=_company_id AND b.gl_account_id=l.account_id);
  IF cash_out<stock_cost THEN RAISE EXCEPTION 'Direct inventory acquisition needs its full posted cash payment'; END IF;
 ELSIF source_kind='opening_inventory' AND acquisition.source_type<>'opening_balance' THEN RAISE EXCEPTION 'Opening stock must reference its actual opening journal'; END IF;
 SELECT * INTO movement FROM public.journals WHERE id=(_payload->>'movement_journal_id')::uuid AND company_id=_company_id AND status='posted' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Select the posted inventory movement'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cash_classification_policies WHERE company_id=_company_id AND source_account_id=inventory_id AND kind='inventory') THEN RAISE EXCEPTION 'Approve the inventory source account policy first'; END IF;
 PERFORM private.cash_journal_evidence(_company_id,acquisition.id);
 IF NOT EXISTS(SELECT 1 FROM public.journal_lines WHERE company_id=_company_id AND journal_id=acquisition.id AND account_id=inventory_id AND debit_minor>credit_minor) THEN RAISE EXCEPTION 'Purchase bill has no matching inventory cost'; END IF;
 SELECT * INTO previous FROM public.cash_inventory_evidence WHERE id=NULLIF(_payload->>'supersedes_id','')::uuid AND company_id=_company_id;
 IF NULLIF(_payload->>'supersedes_id','') IS NOT NULL AND (previous.id IS NULL OR EXISTS(SELECT 1 FROM public.cash_inventory_evidence WHERE supersedes_id=previous.id)) THEN RAISE EXCEPTION 'Revise the current approved cost evidence'; END IF;
 IF previous.id IS NOT NULL AND (previous.movement_journal_id<>movement.id OR previous.inventory_account_id<>inventory_id) THEN RAISE EXCEPTION 'A revision must retain its evidenced movement and account'; END IF;
 SELECT COALESCE(sum(public.ops_minor_to_base(_company_id,l.debit_minor-l.credit_minor,movement.currency_code,movement.fx_rate_to_base)),0) INTO movement_cost
 FROM public.journal_lines l WHERE l.company_id=_company_id AND l.journal_id=movement.id AND l.account_id=inventory_id;
 IF _payload->>'movement_kind'<>'opening_source' AND ((_payload->>'movement_kind'='customer_return' AND movement_cost<=0) OR (_payload->>'movement_kind'<>'customer_return' AND movement_cost>=0) OR
  (_payload->>'movement_kind'='supplier_return' AND movement.source_type<>'purchase_credit_note')) THEN RAISE EXCEPTION 'Cost evidence does not match the posted inventory direction and return source'; END IF;
 SELECT COALESCE(sum(e.cost_minor),0) INTO used FROM public.cash_inventory_evidence e WHERE company_id=_company_id AND movement_journal_id=movement.id AND inventory_account_id=inventory_id
  AND e.id IS DISTINCT FROM previous.id AND NOT EXISTS(SELECT 1 FROM public.cash_inventory_evidence n WHERE n.supersedes_id=e.id);
 IF used+amount>abs(movement_cost) THEN RAISE EXCEPTION 'Approved cost allocations exceed the actual inventory movement'; END IF;
 IF _payload->>'movement_kind'='opening_source' THEN
  IF source_kind<>'opening_inventory' OR movement.id<>acquisition.id OR amount<>stock_cost OR carry IS NULL OR carry<0 OR carry>amount OR NOT EXISTS(SELECT 1 FROM public.accounts a JOIN public.journal_lines l ON l.account_id=a.id AND l.journal_id=acquisition.id AND l.company_id=_company_id WHERE a.id=(_payload->>'opening_equity_account_id')::uuid AND a.company_id=_company_id AND a.account_type='equity') THEN RAISE EXCEPTION 'Opening stock needs an exact verified paid-cost carry'; END IF;
  SELECT COALESCE(array_agg(value::uuid),'{}') INTO proof_ids FROM jsonb_array_elements_text(COALESCE(_payload->'payment_evidence_journal_ids','[]'));
  IF cardinality(proof_ids)>100 OR cardinality(proof_ids)<>(SELECT count(DISTINCT x) FROM unnest(proof_ids) x) THEN RAISE EXCEPTION 'Select unique historical evidence journals'; END IF;
  FOR proof IN SELECT * FROM public.journals WHERE id=ANY(proof_ids) AND company_id=_company_id AND status='posted' AND journal_date<=acquisition.journal_date AND source_type<>'opening_balance' LOOP
   proof_snapshots:=proof_snapshots||jsonb_build_array(private.cash_journal_evidence(_company_id,proof.id));
   SELECT proof_stock+COALESCE(sum(public.ops_minor_to_base(_company_id,l.debit_minor-l.credit_minor,proof.currency_code,proof.fx_rate_to_base)),0) INTO proof_stock FROM public.journal_lines l WHERE l.company_id=_company_id AND l.journal_id=proof.id AND l.account_id=inventory_id;
   SELECT proof_cash+COALESCE(sum(public.ops_minor_to_base(_company_id,l.credit_minor-l.debit_minor,proof.currency_code,proof.fx_rate_to_base)),0) INTO proof_cash FROM public.journal_lines l WHERE l.company_id=_company_id AND l.journal_id=proof.id AND EXISTS(SELECT 1 FROM public.bank_accounts b WHERE b.company_id=_company_id AND b.gl_account_id=l.account_id);
  END LOOP;
  IF jsonb_array_length(proof_snapshots)<>cardinality(proof_ids) OR acquisition.id=ANY(proof_ids) OR (carry>0 AND (cardinality(proof_ids)=0 OR carry>proof_stock OR carry>proof_cash)) THEN RAISE EXCEPTION 'Opening paid cost exceeds its verified historical source/payment evidence'; END IF;
 ELSE
  IF carry IS NOT NULL OR NULLIF(_payload->>'opening_equity_account_id','') IS NOT NULL OR jsonb_array_length(COALESCE(_payload->'payment_evidence_journal_ids','[]'))<>0 THEN RAISE EXCEPTION 'Historical paid carry belongs only to opening-source evidence'; END IF;
  proof_ids:='{}';
  IF source_kind='opening_inventory' AND NOT EXISTS(SELECT 1 FROM public.cash_inventory_evidence e WHERE e.company_id=_company_id AND e.purchase_journal_id=acquisition.id AND e.inventory_account_id=inventory_id AND e.movement_kind='opening_source' AND NOT EXISTS(SELECT 1 FROM public.cash_inventory_evidence n WHERE n.supersedes_id=e.id)) THEN RAISE EXCEPTION 'Approve opening stock paid-cost evidence first'; END IF;
 END IF;
 IF _payload->>'movement_kind'='customer_return' THEN
  SELECT * INTO original FROM public.cash_inventory_evidence WHERE id=(_payload->>'reverses_evidence_id')::uuid AND company_id=_company_id AND movement_kind='sale'
   AND purchase_document_id=source_id AND inventory_account_id=inventory_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'A customer return must identify its original approved sale cost'; END IF;
  SELECT COALESCE(sum(cost_minor),0) INTO used FROM public.cash_inventory_evidence e WHERE company_id=_company_id AND reverses_evidence_id=original.id AND id IS DISTINCT FROM previous.id
   AND NOT EXISTS(SELECT 1 FROM public.cash_inventory_evidence n WHERE n.supersedes_id=e.id);
  IF used+amount>original.cost_minor THEN RAISE EXCEPTION 'Customer returns exceed their original sale cost'; END IF;
 ELSIF NULLIF(_payload->>'reverses_evidence_id','') IS NOT NULL THEN RAISE EXCEPTION 'Only customer returns reverse approved sale costs'; END IF;
 INSERT INTO public.cash_inventory_evidence(company_id,purchase_document_id,purchase_journal_id,inventory_account_id,movement_journal_id,movement_kind,cost_minor,reverses_evidence_id,
  version,supersedes_id,policy_note,evidence_reference,purchase_journal_snapshot,movement_journal_snapshot,approved_by,source_kind,opening_paid_minor,payment_evidence_journal_ids,payment_evidence_snapshots,opening_equity_account_id)
 VALUES(_company_id,source_id,acquisition.id,inventory_id,movement.id,_payload->>'movement_kind',amount,NULLIF(_payload->>'reverses_evidence_id','')::uuid,
  COALESCE(previous.version,0)+1,previous.id,trim(_payload->>'policy_note'),trim(_payload->>'evidence_reference'),
  private.cash_journal_evidence(_company_id,acquisition.id),private.cash_journal_evidence(_company_id,movement.id),auth.uid(),source_kind,carry,proof_ids,proof_snapshots,NULLIF(_payload->>'opening_equity_account_id','')::uuid) RETURNING * INTO p;
 RETURN p.id;
END $$;

CREATE OR REPLACE FUNCTION public.capture_cash_report_source(_company_id uuid,_to date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; rows jsonb;
BEGIN
 result:=public.capture_cash_report_source_before_classification(_company_id,_to);
 SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]') INTO rows FROM public.cash_classification_policies p WHERE p.company_id=_company_id;
 result:=result||jsonb_build_object('cash_classification_policies',rows);
 SELECT COALESCE(jsonb_agg(to_jsonb(p)||jsonb_build_object('gross_minor',p.gross_minor::text) ORDER BY p.id),'[]') INTO rows FROM public.cash_opening_evidence p WHERE p.company_id=_company_id;
 result:=result||jsonb_build_object('cash_opening_evidence',rows);
 SELECT COALESCE(jsonb_agg(to_jsonb(p)||jsonb_build_object('cost_minor',p.cost_minor::text,'opening_paid_minor',p.opening_paid_minor::text) ORDER BY p.id),'[]') INTO rows FROM public.cash_inventory_evidence p WHERE p.company_id=_company_id;
 RETURN result||jsonb_build_object('cash_inventory_evidence',rows);
END $$;
REVOKE ALL ON FUNCTION public.capture_cash_report_source(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.capture_cash_report_source(uuid,date) TO authenticated;

CREATE OR REPLACE FUNCTION private.record_cash_classification_exception(_company_id uuid,_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.cash_classification_exceptions; aid uuid:=NULLIF(_payload->>'source_account_id','')::uuid; jid uuid:=NULLIF(_payload->>'journal_id','')::uuid; did uuid:=NULLIF(_payload->>'document_id','')::uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_company_permission(_company_id,'reports.view') OR public.has_company_permission(_company_id,'accounting.view')) THEN RAISE EXCEPTION 'Reporting permission required' USING ERRCODE='42501'; END IF;
 IF (aid IS NULL AND jid IS NULL AND did IS NULL) OR (aid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=aid AND company_id=_company_id)) OR
  (jid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.journals WHERE id=jid AND company_id=_company_id AND status='posted')) OR
  (did IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sales_invoices WHERE id=did AND company_id=_company_id) AND NOT EXISTS(SELECT 1 FROM public.purchase_bills WHERE id=did AND company_id=_company_id)
   AND NOT EXISTS(SELECT 1 FROM public.journals WHERE id=jid AND company_id=_company_id AND (source_id=did OR id=did))) THEN RAISE EXCEPTION 'Exception source is not in this organisation'; END IF;
 INSERT INTO public.cash_classification_exceptions(company_id,exception_key,code,source_account_id,journal_id,document_id,document_kind,amount_minor,currency_code,source_date,period_from,period_to,missing_information,created_by)
 VALUES(_company_id,_payload->>'exception_key',_payload->>'code',aid,jid,did,_payload->>'document_kind',(_payload->>'amount_minor')::bigint,_payload->>'currency_code',(_payload->>'source_date')::date,
  (_payload->>'period_from')::date,(_payload->>'period_to')::date,_payload->>'missing_information',auth.uid()) ON CONFLICT(company_id,exception_key) DO NOTHING RETURNING * INTO e;
 IF e.id IS NULL THEN SELECT * INTO e FROM public.cash_classification_exceptions WHERE company_id=_company_id AND exception_key=_payload->>'exception_key' FOR UPDATE;
  IF e.status='resolved' THEN UPDATE public.cash_classification_exceptions SET status='open',resolution_kind=NULL,resolution_id=NULL,resolved_at=NULL,resolved_by=NULL WHERE id=e.id; END IF;
 END IF;
 INSERT INTO public.cash_classification_audit(company_id,entity_kind,entity_id,action,actor_id,details) VALUES(_company_id,'exception',e.id,'observed',auth.uid(),_payload);
 RETURN e.id;
END $$;
