-- Verified reporting metadata only. Accrual journals and the posting engine are unchanged.
CREATE TABLE public.cash_classification_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 source_account_id uuid NOT NULL REFERENCES public.accounts(id), recognition_account_id uuid NOT NULL REFERENCES public.accounts(id),
 equity_account_id uuid REFERENCES public.accounts(id), kind text NOT NULL CHECK(kind IN ('balance_sheet','conversion','inventory','prepaid','deferred','payroll_wages','payroll_employer_tax','payroll_deductions')),
 version integer NOT NULL CHECK(version>0), supersedes_id uuid REFERENCES public.cash_classification_policies(id),
 effective_from date NOT NULL, effective_to date CHECK(effective_to IS NULL OR effective_to>=effective_from),
 status text NOT NULL DEFAULT 'approved' CHECK(status='approved'), policy_note text NOT NULL CHECK(length(trim(policy_note)) BETWEEN 10 AND 4000),
 evidence_reference text NOT NULL CHECK(length(trim(evidence_reference)) BETWEEN 3 AND 500), evidence_journal_ids uuid[] NOT NULL,
 evidence_journal_snapshots jsonb NOT NULL CHECK(jsonb_typeof(evidence_journal_snapshots)='array'),
 approved_by uuid NOT NULL, approved_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,source_account_id,version)
);
CREATE TABLE public.cash_opening_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 source_kind text NOT NULL CHECK(source_kind IN ('sales_invoice','purchase_bill')), document_id uuid NOT NULL,
 posted_journal_id uuid NOT NULL REFERENCES public.journals(id), control_account_id uuid NOT NULL REFERENCES public.accounts(id),
 equity_account_id uuid NOT NULL REFERENCES public.accounts(id), currency_code text NOT NULL CHECK(currency_code~'^[A-Z]{3}$'),
 gross_minor bigint NOT NULL CHECK(gross_minor>0), components jsonb NOT NULL CHECK(jsonb_typeof(components)='array'),
 tax_lines jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(tax_lines)='array'),
 mode text NOT NULL CHECK(mode IN ('recognize_on_settlement','already_recognized')), version integer NOT NULL CHECK(version>0),
 supersedes_id uuid REFERENCES public.cash_opening_evidence(id), effective_from date NOT NULL, effective_to date,
 status text NOT NULL DEFAULT 'approved' CHECK(status='approved'), policy_note text NOT NULL CHECK(length(trim(policy_note)) BETWEEN 10 AND 4000),
 evidence_reference text NOT NULL CHECK(length(trim(evidence_reference)) BETWEEN 3 AND 500), source_journal_snapshot jsonb NOT NULL,
 approved_by uuid NOT NULL, approved_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,document_id,version)
);
CREATE TABLE public.cash_inventory_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 purchase_document_id uuid NOT NULL REFERENCES public.purchase_bills(id), purchase_journal_id uuid NOT NULL REFERENCES public.journals(id),
 inventory_account_id uuid NOT NULL REFERENCES public.accounts(id), movement_journal_id uuid NOT NULL REFERENCES public.journals(id),
 movement_kind text NOT NULL CHECK(movement_kind IN ('sale','customer_return','supplier_return')), cost_minor bigint NOT NULL CHECK(cost_minor>0),
 reverses_evidence_id uuid REFERENCES public.cash_inventory_evidence(id), version integer NOT NULL DEFAULT 1 CHECK(version>0),
 supersedes_id uuid REFERENCES public.cash_inventory_evidence(id), status text NOT NULL DEFAULT 'approved' CHECK(status='approved'),
 policy_note text NOT NULL CHECK(length(trim(policy_note)) BETWEEN 10 AND 4000), evidence_reference text NOT NULL CHECK(length(trim(evidence_reference)) BETWEEN 3 AND 500),
 purchase_journal_snapshot jsonb NOT NULL, movement_journal_snapshot jsonb NOT NULL, approved_by uuid NOT NULL, approved_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cash_classification_exceptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 exception_key text NOT NULL CHECK(length(exception_key) BETWEEN 1 AND 1000), code text NOT NULL,
 source_account_id uuid REFERENCES public.accounts(id), journal_id uuid REFERENCES public.journals(id), document_id uuid, document_kind text,
 amount_minor bigint NOT NULL, currency_code text NOT NULL CHECK(currency_code~'^[A-Z]{3}$'), source_date date,
 period_from date NOT NULL, period_to date NOT NULL CHECK(period_to>=period_from), missing_information text NOT NULL CHECK(length(missing_information) BETWEEN 1 AND 24000),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')), resolution_kind text CHECK(resolution_kind IN ('policy','opening','inventory')),
 resolution_id uuid, review_note text, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), resolved_by uuid, resolved_at timestamptz,
 UNIQUE(company_id,exception_key)
);
CREATE TABLE public.cash_classification_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 entity_kind text NOT NULL, entity_id uuid NOT NULL, action text NOT NULL, actor_id uuid NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(), details jsonb NOT NULL
);
CREATE INDEX cash_policy_company_account ON public.cash_classification_policies(company_id,source_account_id,effective_from,version DESC);
CREATE INDEX cash_opening_company_document ON public.cash_opening_evidence(company_id,document_id,version DESC);
CREATE INDEX cash_inventory_company_source ON public.cash_inventory_evidence(company_id,purchase_document_id,inventory_account_id);
CREATE INDEX cash_inventory_movement ON public.cash_inventory_evidence(movement_journal_id,inventory_account_id);
CREATE INDEX cash_exceptions_company_status ON public.cash_classification_exceptions(company_id,status,created_at);
CREATE INDEX cash_classification_audit_company ON public.cash_classification_audit(company_id,occurred_at);

ALTER TABLE public.cash_classification_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cash_classification_policies FROM PUBLIC,anon,authenticated;
ALTER TABLE public.cash_opening_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cash_opening_evidence FROM PUBLIC,anon,authenticated;
ALTER TABLE public.cash_inventory_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cash_inventory_evidence FROM PUBLIC,anon,authenticated;
ALTER TABLE public.cash_classification_exceptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cash_classification_exceptions FROM PUBLIC,anon,authenticated;
ALTER TABLE public.cash_classification_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cash_classification_audit FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['cash_classification_policies','cash_opening_evidence','cash_inventory_evidence','cash_classification_exceptions','cash_classification_audit'] LOOP
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY company_read ON public.%I FOR SELECT TO authenticated USING(public.is_company_member(company_id))',t);
 END LOOP;
END $$;
CREATE FUNCTION private.cash_classification_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.companies WHERE id=OLD.company_id) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Approved classification evidence and audit history are immutable; create a reviewed revision';
END $$;
REVOKE ALL ON FUNCTION private.cash_classification_immutable() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['cash_classification_policies','cash_opening_evidence','cash_inventory_evidence','cash_classification_audit'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.cash_classification_immutable()',t);
 END LOOP;
END $$;
CREATE FUNCTION private.cash_classification_audit_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.cash_classification_audit(company_id,entity_kind,entity_id,action,actor_id,details)
 VALUES(NEW.company_id,TG_TABLE_NAME,NEW.id,CASE WHEN TG_OP='INSERT' THEN 'approved' ELSE 'reviewed' END,auth.uid(),to_jsonb(NEW));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.cash_classification_audit_insert() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['cash_classification_policies','cash_opening_evidence','cash_inventory_evidence'] LOOP
  EXECUTE format('CREATE TRIGGER approval_audit AFTER INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION private.cash_classification_audit_insert()',t);
 END LOOP;
END $$;

CREATE FUNCTION private.cash_journal_evidence(_company uuid,_journal uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 SELECT jsonb_build_object('id',j.id,'company_id',j.company_id,'journal_date',j.journal_date,'currency_code',trim(j.currency_code),
  'fx_rate_to_base',j.fx_rate_to_base::text,'source_type',j.source_type,'source_id',j.source_id,'status',j.status,
  'lines',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'account_id',l.account_id,'debit_minor',l.debit_minor::text,'credit_minor',l.credit_minor::text) ORDER BY l.id)
   FROM public.journal_lines l WHERE l.company_id=_company AND l.journal_id=j.id),'[]'::jsonb)) INTO result
 FROM public.journals j WHERE j.id=_journal AND j.company_id=_company AND j.status='posted';
 IF result IS NULL THEN RAISE EXCEPTION 'Supporting journal must be posted in this organisation'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.cash_journal_evidence(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.assert_cash_review(_company uuid,_payload jsonb) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'accounting.post') THEN
  RAISE EXCEPTION 'Accounting approval permission required' USING ERRCODE='42501'; END IF;
 IF _payload->'user_confirmed' IS DISTINCT FROM 'true'::jsonb OR length(trim(COALESCE(_payload->>'policy_note',''))) NOT BETWEEN 10 AND 4000 OR
  length(trim(COALESCE(_payload->>'evidence_reference',''))) NOT BETWEEN 3 AND 500 THEN
  RAISE EXCEPTION 'Confirm verified source records and provide the accounting policy and evidence reference'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.assert_cash_review(uuid,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.approve_cash_classification_policy(_company_id uuid,_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE src public.accounts; dst public.accounts; old public.cash_classification_policies; p public.cash_classification_policies;
 kind text:=_payload->>'kind'; ids uuid[]; snapshots jsonb:='[]'; jid uuid; snap jsonb; start_date date:=(_payload->>'effective_from')::date;
BEGIN
 PERFORM private.assert_cash_review(_company_id,_payload);
 SELECT * INTO src FROM public.accounts WHERE id=(_payload->>'source_account_id')::uuid AND company_id=_company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Source account is not in this organisation'; END IF;
 SELECT * INTO dst FROM public.accounts WHERE id=(_payload->>'recognition_account_id')::uuid AND company_id=_company_id AND is_postable;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recognition account is not postable in this organisation'; END IF;
 IF start_date IS NULL OR ((_payload->>'effective_to') IS NOT NULL AND (_payload->>'effective_to')::date<start_date) OR
  (CASE WHEN kind='balance_sheet' THEN src.id<>dst.id OR src.account_type::text NOT IN ('asset','liability','equity')
   WHEN kind='conversion' THEN dst.account_type::text<>'equity'
   WHEN kind IN ('inventory','prepaid') THEN src.account_type::text<>'asset' OR dst.account_type::text<>'expense'
   WHEN kind='deferred' THEN src.account_type::text<>'liability' OR dst.account_type::text<>'income'
   WHEN kind IN ('payroll_wages','payroll_employer_tax','payroll_deductions') THEN src.account_type::text<>'liability' OR dst.account_type::text<>'expense'
   ELSE true END) THEN RAISE EXCEPTION 'Cash policy source and recognition account types do not match'; END IF;
 SELECT * INTO old FROM public.cash_classification_policies WHERE company_id=_company_id AND source_account_id=src.id ORDER BY version DESC LIMIT 1;
 IF old.id IS DISTINCT FROM NULLIF(_payload->>'supersedes_id','')::uuid THEN RAISE EXCEPTION 'Policy changed; revise the latest approved version'; END IF;
 IF old.id IS NOT NULL AND start_date<old.effective_from THEN RAISE EXCEPTION 'A revision cannot start before the policy it replaces'; END IF;
 IF jsonb_typeof(_payload->'evidence_journal_ids')<>'array' OR jsonb_array_length(_payload->'evidence_journal_ids') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Select supporting posted journals'; END IF;
 SELECT array_agg(value::uuid) INTO ids FROM jsonb_array_elements_text(_payload->'evidence_journal_ids');
 IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'Duplicate journal evidence'; END IF;
 FOREACH jid IN ARRAY ids LOOP
  snap:=private.cash_journal_evidence(_company_id,jid);
  IF NOT EXISTS(SELECT 1 FROM public.journal_lines WHERE company_id=_company_id AND journal_id=jid AND account_id=src.id AND debit_minor<>credit_minor) THEN
   RAISE EXCEPTION 'Each supporting journal must evidence this source account'; END IF;
  snapshots:=snapshots||jsonb_build_array(snap);
 END LOOP;
 INSERT INTO public.cash_classification_policies(company_id,source_account_id,recognition_account_id,equity_account_id,kind,version,supersedes_id,effective_from,effective_to,
  policy_note,evidence_reference,evidence_journal_ids,evidence_journal_snapshots,approved_by)
 VALUES(_company_id,src.id,dst.id,NULL,kind,COALESCE(old.version,0)+1,old.id,start_date,(_payload->>'effective_to')::date,
  trim(_payload->>'policy_note'),trim(_payload->>'evidence_reference'),ids,snapshots,auth.uid()) RETURNING * INTO p;
 RETURN p.id;
END $$;

CREATE FUNCTION private.approve_cash_opening_evidence(_company_id uuid,_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.cash_opening_evidence; p public.cash_opening_evidence; doc record; snap jsonb; c jsonb; total bigint:=0; tax_total bigint:=0;
 kind text:=_payload->>'source_kind'; doc_id uuid:=(_payload->>'document_id')::uuid; control_id uuid:=(_payload->>'control_account_id')::uuid;
 equity_id uuid:=(_payload->>'equity_account_id')::uuid; gross bigint:=(_payload->>'gross_minor')::bigint; claimed bigint; available bigint;
BEGIN
 PERFORM private.assert_cash_review(_company_id,_payload);
 IF kind NOT IN ('sales_invoice','purchase_bill') THEN RAISE EXCEPTION 'Choose an opening invoice or bill'; END IF;
 EXECUTE format('SELECT id,total_minor,currency_code,posted_journal_id FROM public.%I WHERE id=$1 AND company_id=$2 AND status::text<>''void'' FOR UPDATE',
  CASE WHEN kind='sales_invoice' THEN 'sales_invoices' ELSE 'purchase_bills' END) INTO doc USING doc_id,_company_id;
 IF doc.id IS NULL OR doc.posted_journal_id IS DISTINCT FROM (_payload->>'posted_journal_id')::uuid OR doc.total_minor<>gross OR gross<=0 OR trim(doc.currency_code)<>_payload->>'currency_code' THEN
  RAISE EXCEPTION 'Opening evidence must match the actual document, amount, currency and posted journal'; END IF;
 snap:=private.cash_journal_evidence(_company_id,doc.posted_journal_id);
 IF snap->>'source_type'<>'opening_balance' OR snap->>'currency_code'<>trim(doc.currency_code) OR (_payload->>'effective_from')::date>(snap->>'journal_date')::date THEN
  RAISE EXCEPTION 'Verified opening evidence requires the posted conversion journal and its opening date'; END IF;
 PERFORM 1 FROM public.journals WHERE id=doc.posted_journal_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.accounts a WHERE a.id=control_id AND a.company_id=_company_id AND a.is_control AND
  a.account_type::text=CASE WHEN kind='sales_invoice' THEN 'asset' ELSE 'liability' END) OR
  NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=equity_id AND company_id=_company_id AND account_type::text='equity') OR
  NOT EXISTS(SELECT 1 FROM public.journal_lines WHERE company_id=_company_id AND journal_id=doc.posted_journal_id AND account_id=equity_id) THEN
  RAISE EXCEPTION 'Choose the evidenced trade control and posted opening-equity account'; END IF;
 SELECT * INTO old FROM public.cash_opening_evidence WHERE company_id=_company_id AND document_id=doc_id ORDER BY version DESC LIMIT 1;
 IF old.id IS DISTINCT FROM NULLIF(_payload->>'supersedes_id','')::uuid THEN RAISE EXCEPTION 'Opening evidence changed; revise its latest approved version'; END IF;
 SELECT COALESCE(sum(l.debit_minor-l.credit_minor),0)*CASE WHEN kind='sales_invoice' THEN 1 ELSE -1 END INTO available
 FROM public.journal_lines l WHERE l.company_id=_company_id AND l.journal_id=doc.posted_journal_id AND l.account_id=control_id;
 SELECT COALESCE(sum(e.gross_minor),0) INTO claimed FROM public.cash_opening_evidence e WHERE e.company_id=_company_id AND e.posted_journal_id=doc.posted_journal_id
 AND e.control_account_id=control_id AND e.document_id<>doc_id AND NOT EXISTS(SELECT 1 FROM public.cash_opening_evidence n WHERE n.supersedes_id=e.id);
 IF claimed+gross>available THEN RAISE EXCEPTION 'Opening documents exceed their verified posted control balance'; END IF;
 IF jsonb_typeof(_payload->'components')<>'array' OR jsonb_array_length(_payload->'components') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Enter verified source components'; END IF;
 FOR c IN SELECT * FROM jsonb_array_elements(_payload->'components') LOOP
  IF (c->>'amount_minor')::bigint<=0 OR (c->>'account_id')::uuid IN(control_id,equity_id) OR NOT EXISTS(
   SELECT 1 FROM public.accounts WHERE id=(c->>'account_id')::uuid AND company_id=_company_id AND is_postable) THEN RAISE EXCEPTION 'Invalid opening component'; END IF;
  total:=total+(c->>'amount_minor')::bigint;
 END LOOP;
 IF total<>gross OR (SELECT count(DISTINCT component.value->>'account_id') FROM jsonb_array_elements(_payload->'components') AS component(value))<>jsonb_array_length(_payload->'components') THEN
  RAISE EXCEPTION 'Verified components must reconcile exactly to the opening document gross'; END IF;
 IF jsonb_typeof(COALESCE(_payload->'tax_lines','[]'))<>'array' OR jsonb_array_length(COALESCE(_payload->'tax_lines','[]'))>100 THEN RAISE EXCEPTION 'Invalid opening tax details'; END IF;
 FOR c IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'tax_lines','[]')) LOOP
  IF (c->>'net_minor')::bigint<0 OR (c->>'tax_minor')::bigint<0 OR NOT EXISTS(SELECT 1 FROM public.tax_codes WHERE id=(c->>'tax_code_id')::uuid AND company_id=_company_id) THEN RAISE EXCEPTION 'Opening tax detail needs a company tax code and verified amounts'; END IF;
  tax_total:=tax_total+(c->>'net_minor')::bigint+(c->>'tax_minor')::bigint;
 END LOOP;
 IF jsonb_array_length(COALESCE(_payload->'tax_lines','[]'))>0 AND tax_total<>gross THEN RAISE EXCEPTION 'Opening tax details must equal the verified gross'; END IF;
 INSERT INTO public.cash_opening_evidence(company_id,source_kind,document_id,posted_journal_id,control_account_id,equity_account_id,currency_code,gross_minor,components,tax_lines,mode,
  version,supersedes_id,effective_from,policy_note,evidence_reference,source_journal_snapshot,approved_by)
 VALUES(_company_id,kind,doc_id,doc.posted_journal_id,control_id,equity_id,trim(doc.currency_code),gross,_payload->'components',COALESCE(_payload->'tax_lines','[]'),_payload->>'mode',
  COALESCE(old.version,0)+1,old.id,(_payload->>'effective_from')::date,trim(_payload->>'policy_note'),trim(_payload->>'evidence_reference'),snap,auth.uid()) RETURNING * INTO p;
 RETURN p.id;
END $$;

CREATE FUNCTION private.approve_cash_inventory_evidence(_company_id uuid,_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE doc public.purchase_bills; movement public.journals; previous public.cash_inventory_evidence; original public.cash_inventory_evidence;
 inventory_id uuid:=(_payload->>'inventory_account_id')::uuid; amount bigint:=(_payload->>'cost_minor')::bigint; p public.cash_inventory_evidence; used bigint; movement_cost bigint;
BEGIN
 PERFORM private.assert_cash_review(_company_id,_payload);
 SELECT * INTO doc FROM public.purchase_bills WHERE id=(_payload->>'purchase_document_id')::uuid AND company_id=_company_id AND posted_journal_id=(_payload->>'purchase_journal_id')::uuid;
 IF NOT FOUND OR amount<=0 THEN RAISE EXCEPTION 'Select the actual posted purchase bill and positive verified cost'; END IF;
 SELECT * INTO movement FROM public.journals WHERE id=(_payload->>'movement_journal_id')::uuid AND company_id=_company_id AND status='posted' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Select the posted inventory movement'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cash_classification_policies WHERE company_id=_company_id AND source_account_id=inventory_id AND kind='inventory') THEN RAISE EXCEPTION 'Approve the inventory source account policy first'; END IF;
 PERFORM private.cash_journal_evidence(_company_id,doc.posted_journal_id);
 IF NOT EXISTS(SELECT 1 FROM public.journal_lines WHERE company_id=_company_id AND journal_id=doc.posted_journal_id AND account_id=inventory_id AND debit_minor>credit_minor) THEN RAISE EXCEPTION 'Purchase bill has no matching inventory cost'; END IF;
 SELECT * INTO previous FROM public.cash_inventory_evidence WHERE id=NULLIF(_payload->>'supersedes_id','')::uuid AND company_id=_company_id;
 IF NULLIF(_payload->>'supersedes_id','') IS NOT NULL AND (previous.id IS NULL OR EXISTS(SELECT 1 FROM public.cash_inventory_evidence WHERE supersedes_id=previous.id)) THEN RAISE EXCEPTION 'Revise the current approved cost evidence'; END IF;
 IF previous.id IS NOT NULL AND (previous.movement_journal_id<>movement.id OR previous.inventory_account_id<>inventory_id) THEN RAISE EXCEPTION 'A revision must retain its evidenced movement and account'; END IF;
 SELECT COALESCE(sum(public.ops_minor_to_base(_company_id,l.debit_minor-l.credit_minor,movement.currency_code,movement.fx_rate_to_base)),0) INTO movement_cost
 FROM public.journal_lines l WHERE l.company_id=_company_id AND l.journal_id=movement.id AND l.account_id=inventory_id;
 IF (_payload->>'movement_kind'='customer_return' AND movement_cost<=0) OR (_payload->>'movement_kind'<>'customer_return' AND movement_cost>=0) OR
  (_payload->>'movement_kind'='supplier_return' AND movement.source_type<>'purchase_credit_note') THEN RAISE EXCEPTION 'Cost evidence does not match the posted inventory direction and return source'; END IF;
 SELECT COALESCE(sum(e.cost_minor),0) INTO used FROM public.cash_inventory_evidence e WHERE company_id=_company_id AND movement_journal_id=movement.id AND inventory_account_id=inventory_id
  AND e.id IS DISTINCT FROM previous.id AND NOT EXISTS(SELECT 1 FROM public.cash_inventory_evidence n WHERE n.supersedes_id=e.id);
 IF used+amount>abs(movement_cost) THEN RAISE EXCEPTION 'Approved cost allocations exceed the actual inventory movement'; END IF;
 IF _payload->>'movement_kind'='customer_return' THEN
  SELECT * INTO original FROM public.cash_inventory_evidence WHERE id=(_payload->>'reverses_evidence_id')::uuid AND company_id=_company_id AND movement_kind='sale'
   AND purchase_document_id=doc.id AND inventory_account_id=inventory_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'A customer return must identify its original approved sale cost'; END IF;
  SELECT COALESCE(sum(cost_minor),0) INTO used FROM public.cash_inventory_evidence e WHERE company_id=_company_id AND reverses_evidence_id=original.id AND id IS DISTINCT FROM previous.id
   AND NOT EXISTS(SELECT 1 FROM public.cash_inventory_evidence n WHERE n.supersedes_id=e.id);
  IF used+amount>original.cost_minor THEN RAISE EXCEPTION 'Customer returns exceed their original sale cost'; END IF;
 ELSIF NULLIF(_payload->>'reverses_evidence_id','') IS NOT NULL THEN RAISE EXCEPTION 'Only customer returns reverse approved sale costs'; END IF;
 INSERT INTO public.cash_inventory_evidence(company_id,purchase_document_id,purchase_journal_id,inventory_account_id,movement_journal_id,movement_kind,cost_minor,reverses_evidence_id,
  version,supersedes_id,policy_note,evidence_reference,purchase_journal_snapshot,movement_journal_snapshot,approved_by)
 VALUES(_company_id,doc.id,doc.posted_journal_id,inventory_id,movement.id,_payload->>'movement_kind',amount,NULLIF(_payload->>'reverses_evidence_id','')::uuid,
  COALESCE(previous.version,0)+1,previous.id,trim(_payload->>'policy_note'),trim(_payload->>'evidence_reference'),
  private.cash_journal_evidence(_company_id,doc.posted_journal_id),private.cash_journal_evidence(_company_id,movement.id),auth.uid()) RETURNING * INTO p;
 RETURN p.id;
END $$;

CREATE FUNCTION private.record_cash_classification_exception(_company_id uuid,_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.cash_classification_exceptions; aid uuid:=NULLIF(_payload->>'source_account_id','')::uuid; jid uuid:=NULLIF(_payload->>'journal_id','')::uuid; did uuid:=NULLIF(_payload->>'document_id','')::uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_company_permission(_company_id,'reports.view') OR public.has_company_permission(_company_id,'accounting.view')) THEN RAISE EXCEPTION 'Reporting permission required' USING ERRCODE='42501'; END IF;
 IF (aid IS NULL AND jid IS NULL AND did IS NULL) OR (aid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=aid AND company_id=_company_id)) OR
  (jid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.journals WHERE id=jid AND company_id=_company_id AND status='posted')) OR
  (did IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sales_invoices WHERE id=did AND company_id=_company_id) AND NOT EXISTS(SELECT 1 FROM public.purchase_bills WHERE id=did AND company_id=_company_id)
   AND NOT EXISTS(SELECT 1 FROM public.journals WHERE id=jid AND company_id=_company_id AND source_id=did)) THEN RAISE EXCEPTION 'Exception source is not in this organisation'; END IF;
 INSERT INTO public.cash_classification_exceptions(company_id,exception_key,code,source_account_id,journal_id,document_id,document_kind,amount_minor,currency_code,source_date,period_from,period_to,missing_information,created_by)
 VALUES(_company_id,_payload->>'exception_key',_payload->>'code',aid,jid,did,_payload->>'document_kind',(_payload->>'amount_minor')::bigint,_payload->>'currency_code',(_payload->>'source_date')::date,
  (_payload->>'period_from')::date,(_payload->>'period_to')::date,_payload->>'missing_information',auth.uid()) ON CONFLICT(company_id,exception_key) DO NOTHING RETURNING * INTO e;
 IF e.id IS NULL THEN SELECT * INTO e FROM public.cash_classification_exceptions WHERE company_id=_company_id AND exception_key=_payload->>'exception_key' FOR UPDATE;
  IF e.status='resolved' THEN UPDATE public.cash_classification_exceptions SET status='open',resolution_kind=NULL,resolution_id=NULL,resolved_at=NULL,resolved_by=NULL WHERE id=e.id; END IF;
 END IF;
 INSERT INTO public.cash_classification_audit(company_id,entity_kind,entity_id,action,actor_id,details) VALUES(_company_id,'exception',e.id,'observed',auth.uid(),_payload);
 RETURN e.id;
END $$;
CREATE FUNCTION private.resolve_cash_classification_exception(_company_id uuid,_exception_id uuid,_resolution_kind text,_resolution_id uuid,_review_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.cash_classification_exceptions; valid boolean:=false;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company_id,'accounting.post') THEN RAISE EXCEPTION 'Accounting approval permission required' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.cash_classification_exceptions WHERE id=_exception_id AND company_id=_company_id AND status='open' FOR UPDATE;
 IF NOT FOUND OR length(trim(COALESCE(_review_note,''))) NOT BETWEEN 10 AND 4000 THEN RAISE EXCEPTION 'Select an open exception and explain the verified resolution'; END IF;
 IF _resolution_kind='policy' THEN SELECT EXISTS(SELECT 1 FROM public.cash_classification_policies WHERE id=_resolution_id AND company_id=_company_id AND source_account_id=e.source_account_id AND effective_from<=e.period_to) INTO valid;
 ELSIF _resolution_kind='opening' THEN SELECT EXISTS(SELECT 1 FROM public.cash_opening_evidence WHERE id=_resolution_id AND company_id=_company_id AND document_id=e.document_id) INTO valid;
 ELSIF _resolution_kind='inventory' THEN SELECT EXISTS(SELECT 1 FROM public.cash_inventory_evidence WHERE id=_resolution_id AND company_id=_company_id AND inventory_account_id=e.source_account_id AND (e.document_id IS NULL OR purchase_document_id=e.document_id)) INTO valid; END IF;
 IF NOT valid THEN RAISE EXCEPTION 'Resolution must use approved evidence for this exception source in this organisation'; END IF;
 UPDATE public.cash_classification_exceptions SET status='resolved',resolution_kind=_resolution_kind,resolution_id=_resolution_id,review_note=trim(_review_note),resolved_by=auth.uid(),resolved_at=now() WHERE id=e.id;
 INSERT INTO public.cash_classification_audit(company_id,entity_kind,entity_id,action,actor_id,details) VALUES(_company_id,'exception',e.id,'resolved',auth.uid(),jsonb_build_object('resolution_kind',_resolution_kind,'resolution_id',_resolution_id,'review_note',trim(_review_note)));
END $$;

-- Public invoker wrappers reuse existing company authorization in private review functions.
CREATE FUNCTION public.approve_cash_classification_policy(_company_id uuid,_payload jsonb) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.approve_cash_classification_policy(_company_id,_payload) $$;
CREATE FUNCTION public.approve_cash_opening_evidence(_company_id uuid,_payload jsonb) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.approve_cash_opening_evidence(_company_id,_payload) $$;
CREATE FUNCTION public.approve_cash_inventory_evidence(_company_id uuid,_payload jsonb) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.approve_cash_inventory_evidence(_company_id,_payload) $$;
CREATE FUNCTION public.record_cash_classification_exception(_company_id uuid,_payload jsonb) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.record_cash_classification_exception(_company_id,_payload) $$;
CREATE FUNCTION public.resolve_cash_classification_exception(_company_id uuid,_exception_id uuid,_resolution_kind text,_resolution_id uuid,_review_note text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.resolve_cash_classification_exception(_company_id,_exception_id,_resolution_kind,_resolution_id,_review_note) $$;
GRANT USAGE ON SCHEMA private TO authenticated;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.proname IN
 ('approve_cash_classification_policy','approve_cash_opening_evidence','approve_cash_inventory_evidence','record_cash_classification_exception','resolve_cash_classification_exception') LOOP
  EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon'; EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.signature||' TO authenticated';
 END LOOP;
END $$;

ALTER FUNCTION public.capture_cash_report_source(uuid,date) RENAME TO capture_cash_report_source_before_classification;
REVOKE ALL ON FUNCTION public.capture_cash_report_source_before_classification(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.capture_cash_report_source_before_classification(uuid,date) TO authenticated;
CREATE FUNCTION public.capture_cash_report_source(_company_id uuid,_to date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; rows jsonb;
BEGIN
 result:=public.capture_cash_report_source_before_classification(_company_id,_to);
 SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]') INTO rows FROM public.cash_classification_policies p WHERE p.company_id=_company_id;
 result:=result||jsonb_build_object('cash_classification_policies',rows);
 SELECT COALESCE(jsonb_agg(to_jsonb(p)||jsonb_build_object('gross_minor',p.gross_minor::text) ORDER BY p.id),'[]') INTO rows FROM public.cash_opening_evidence p WHERE p.company_id=_company_id;
 result:=result||jsonb_build_object('cash_opening_evidence',rows);
 SELECT COALESCE(jsonb_agg(to_jsonb(p)||jsonb_build_object('cost_minor',p.cost_minor::text) ORDER BY p.id),'[]') INTO rows FROM public.cash_inventory_evidence p WHERE p.company_id=_company_id;
 RETURN result||jsonb_build_object('cash_inventory_evidence',rows);
END $$;
REVOKE ALL ON FUNCTION public.capture_cash_report_source(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.capture_cash_report_source(uuid,date) TO authenticated;
