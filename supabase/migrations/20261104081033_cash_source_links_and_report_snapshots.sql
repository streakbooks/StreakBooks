-- Cash reporting metadata only: no journal, document total or posting logic changes.
-- Older AP allocations did not record their application date. Preserve the only
-- evidenced historic cash date; future applications record their own date.
ALTER TABLE public.supplier_payment_allocations ADD COLUMN allocated_on date;
-- This is metadata enrichment, not a financial reallocation. Do not create an
-- UPDATE-history event which the recognition engine would interpret as one.
ALTER TABLE public.supplier_payment_allocations DISABLE TRIGGER cash_archive_supplier_allocation;
UPDATE public.supplier_payment_allocations a SET allocated_on=p.payment_date
FROM public.supplier_payments p WHERE p.id=a.payment_id AND p.company_id=a.company_id;
ALTER TABLE public.supplier_payment_allocations ENABLE TRIGGER cash_archive_supplier_allocation;
ALTER TABLE public.supplier_payment_allocations ALTER COLUMN allocated_on SET NOT NULL;

CREATE FUNCTION private.date_supplier_cash_allocation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE payment_date date; payment_status text;
BEGIN
 SELECT p.payment_date,p.status::text INTO payment_date,payment_status
 FROM public.supplier_payments p WHERE p.id=NEW.payment_id AND p.company_id=NEW.company_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Supplier payment not found in this organisation'; END IF;
 IF NEW.allocated_on IS NULL THEN
  -- Initial allocations are inserted before the atomic payment RPC posts it.
  -- A later use of an already-paid advance is a new recognition event.
  NEW.allocated_on:=CASE WHEN payment_status='draft' THEN payment_date ELSE GREATEST(payment_date,CURRENT_DATE) END;
 END IF;
 IF NEW.allocated_on<payment_date THEN RAISE EXCEPTION 'Allocation date cannot precede payment date'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.date_supplier_cash_allocation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER date_supplier_cash_allocation BEFORE INSERT OR UPDATE OF allocated_on,payment_id,company_id
ON public.supplier_payment_allocations FOR EACH ROW EXECUTE FUNCTION private.date_supplier_cash_allocation();
COMMENT ON COLUMN public.supplier_payment_allocations.allocated_on IS
 'Date advance became applied. Legacy rows use their original payment date because an application date was not retained.';

ALTER TABLE public.purchase_credit_allocations ADD COLUMN allocated_on date;
UPDATE public.purchase_credit_allocations a SET allocated_on=c.credit_date
FROM public.purchase_credit_notes c WHERE c.id=a.credit_note_id AND c.company_id=a.company_id;
ALTER TABLE public.purchase_credit_allocations ALTER COLUMN allocated_on SET NOT NULL;
CREATE FUNCTION private.date_purchase_credit_allocation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE credit_date date;
BEGIN
 SELECT c.credit_date INTO credit_date FROM public.purchase_credit_notes c
 WHERE c.id=NEW.credit_note_id AND c.company_id=NEW.company_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Supplier credit not found in this organisation'; END IF;
 IF NEW.allocated_on IS NULL THEN NEW.allocated_on:=GREATEST(credit_date,CURRENT_DATE); END IF;
 IF NEW.allocated_on<credit_date THEN RAISE EXCEPTION 'Allocation date cannot precede credit date'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.date_purchase_credit_allocation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER date_purchase_credit_allocation BEFORE INSERT OR UPDATE OF allocated_on,credit_note_id,company_id
ON public.purchase_credit_allocations FOR EACH ROW EXECUTE FUNCTION private.date_purchase_credit_allocation();
COMMENT ON COLUMN public.purchase_credit_allocations.allocated_on IS
 'Date credit was applied. Legacy rows use the source credit date because no application date was retained.';

-- Existing same-timestamp history must not be assigned an invented ordering.
-- New trigger writes receive a durable sequence; legacy events remain NULL.
CREATE SEQUENCE private.cash_allocation_event_seq AS bigint;
REVOKE ALL ON SEQUENCE private.cash_allocation_event_seq FROM PUBLIC,anon,authenticated;
ALTER TABLE public.cash_allocation_history ADD COLUMN event_seq bigint;
ALTER TABLE public.cash_allocation_history ALTER COLUMN event_seq
 SET DEFAULT nextval('private.cash_allocation_event_seq'::regclass);
CREATE UNIQUE INDEX cash_allocation_history_event_seq_idx
 ON public.cash_allocation_history(event_seq) WHERE event_seq IS NOT NULL;
COMMENT ON COLUMN public.cash_allocation_history.event_seq IS
 'Stable order of newly archived versions. NULL for preexisting events whose same-transaction order was not retained.';

ALTER TABLE public.cash_allocation_history DROP CONSTRAINT cash_allocation_history_source_table_check;
ALTER TABLE public.cash_allocation_history ADD CONSTRAINT cash_allocation_history_source_table_check
 CHECK (source_table IN ('supplier_payment_allocations','money_document_credit_uses','purchase_credit_allocations'));
CREATE OR REPLACE FUNCTION private.archive_cash_allocation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb;
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME NOT IN
  ('supplier_payment_allocations','money_document_credit_uses','purchase_credit_allocations') THEN
  RAISE EXCEPTION 'Invalid cash history source'; END IF;
 IF TG_OP='UPDATE' AND to_jsonb(OLD)=to_jsonb(NEW) THEN RETURN NEW; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id=OLD.company_id) THEN
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 snapshot:=to_jsonb(OLD)||jsonb_build_object('amount_minor',OLD.amount_minor::text);
 INSERT INTO public.cash_allocation_history(company_id,source_table,allocation_id,operation,source_row)
 VALUES(OLD.company_id,TG_TABLE_NAME,OLD.id,TG_OP,snapshot);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.archive_cash_allocation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER cash_archive_purchase_credit_allocation BEFORE UPDATE OR DELETE
ON public.purchase_credit_allocations FOR EACH ROW EXECUTE FUNCTION private.archive_cash_allocation();

CREATE OR REPLACE FUNCTION public.capture_cash_report_source(_company_id uuid,_to date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb:='{}'; rows jsonb;
BEGIN
 PERFORM public.cash_reporting_capabilities(_company_id);
 IF _to IS NULL THEN RAISE EXCEPTION 'Cash snapshot requires an end date'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',l.id,'account_id',l.account_id,
 'debit_minor',l.debit_minor::text,'credit_minor',l.credit_minor::text,'description',l.description,
 'journals',jsonb_build_object('id',j.id,'company_id',j.company_id,'journal_date',j.journal_date,
 'journal_number',j.journal_number,'memo',j.memo,'source_type',j.source_type,'source_id',j.source_id,
 'currency_code',j.currency_code,'fx_rate_to_base',j.fx_rate_to_base::text,
 'reverses_journal_id',j.reverses_journal_id)) ORDER BY l.id),'[]') INTO rows
 FROM public.journal_lines l JOIN public.journals j ON j.id=l.journal_id AND j.company_id=l.company_id
 WHERE l.company_id=_company_id AND j.status='posted' AND j.journal_date<=_to;
 result:=jsonb_build_object('journal_lines',rows);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'gl_account_id',t.gl_account_id) ORDER BY t.id),'[]') INTO rows FROM public.bank_accounts t WHERE t.company_id=_company_id;
 result:=result||jsonb_build_object('bank_accounts',rows);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'company_id',t.company_id,'posted_journal_id',t.posted_journal_id,'void_journal_id',t.void_journal_id,'currency_code',t.currency_code,'fx_rate_to_base',t.fx_rate_to_base::text,'amount_minor',t.amount_minor::text) ORDER BY t.id),'[]') INTO rows FROM public.sales_receipts t WHERE t.company_id=_company_id AND t.receipt_date<=_to;
 result:=result||jsonb_build_object('sales_receipts',rows);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'company_id',t.company_id,'posted_journal_id',t.posted_journal_id,'void_journal_id',t.void_journal_id,'currency_code',t.currency_code,'fx_rate_to_base',t.fx_rate_to_base::text,'amount_minor',t.amount_minor::text) ORDER BY t.id),'[]') INTO rows FROM public.supplier_payments t WHERE t.company_id=_company_id AND t.payment_date<=_to;
 result:=result||jsonb_build_object('supplier_payments',rows);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'company_id',t.company_id,'receipt_id',t.receipt_id,'invoice_id',t.invoice_id,'amount_minor',t.amount_minor::text,'allocated_on',t.allocated_on,'reversed_on',t.reversed_on) ORDER BY t.id),'[]') INTO rows FROM public.sales_receipt_allocations t WHERE t.company_id=_company_id;
 result:=result||jsonb_build_object('sales_receipt_allocations',rows);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'company_id',t.company_id,'payment_id',t.payment_id,'bill_id',t.bill_id,'amount_minor',t.amount_minor::text,'allocated_on',t.allocated_on) ORDER BY t.id),'[]') INTO rows FROM public.supplier_payment_allocations t WHERE t.company_id=_company_id;
 result:=result||jsonb_build_object('supplier_payment_allocations',rows);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'company_id',t.company_id,'kind',t.kind,'posted_journal_id',t.posted_journal_id,'void_journal_id',t.void_journal_id,'currency_code',t.currency_code,'fx_rate_to_base',t.fx_rate_to_base::text,'total_minor',t.total_minor::text) ORDER BY t.id),'[]') INTO rows FROM public.money_documents t WHERE t.company_id=_company_id AND t.document_date<=_to;
 result:=result||jsonb_build_object('money_documents',rows);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'document_id',t.document_id,'source_kind',t.source_kind,'source_id',t.source_id,'amount_minor',t.amount_minor::text) ORDER BY t.id),'[]') INTO rows FROM public.money_document_credit_uses t WHERE t.company_id=_company_id;
 result:=result||jsonb_build_object('money_document_credit_uses',rows);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'invoice_id',t.invoice_id,'credit_note_id',t.credit_note_id,'amount_minor',t.amount_minor::text,'allocated_on',t.allocated_on,'reversed_on',t.reversed_on) ORDER BY t.id),'[]') INTO rows FROM public.sales_credit_allocations t WHERE t.company_id=_company_id;
 result:=result||jsonb_build_object('sales_credit_allocations',rows);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'bill_id',t.bill_id,'credit_note_id',t.credit_note_id,'amount_minor',t.amount_minor::text,'allocated_on',t.allocated_on) ORDER BY t.id),'[]') INTO rows FROM public.purchase_credit_allocations t WHERE t.company_id=_company_id;
 result:=result||jsonb_build_object('purchase_credit_allocations',rows);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'company_id',t.company_id,'source_table',t.source_table,'allocation_id',t.allocation_id,'operation',t.operation,'source_row',t.source_row,'recorded_at',t.recorded_at,'event_seq',t.event_seq::text) ORDER BY t.id),'[]') INTO rows FROM public.cash_allocation_history t WHERE t.company_id=_company_id;
 result:=result||jsonb_build_object('cash_allocation_history',rows);
 -- Include future document dates even when their source journals are beyond the
 -- snapshot cutoff, so recognition keeps an early payment as an advance.
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'company_id',t.company_id,'posted_journal_id',t.posted_journal_id,'invoice_date',t.invoice_date) ORDER BY t.id),'[]') INTO rows FROM public.sales_invoices t WHERE t.company_id=_company_id AND t.posted_journal_id IS NOT NULL;
 result:=result||jsonb_build_object('sales_invoices',rows);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'company_id',t.company_id,'posted_journal_id',t.posted_journal_id,'bill_date',t.bill_date) ORDER BY t.id),'[]') INTO rows FROM public.purchase_bills t WHERE t.company_id=_company_id AND t.posted_journal_id IS NOT NULL;
 result:=result||jsonb_build_object('purchase_bills',rows);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'company_id',t.company_id,'posted_journal_id',t.posted_journal_id,'credit_date',t.credit_date) ORDER BY t.id),'[]') INTO rows FROM public.sales_credit_notes t WHERE t.company_id=_company_id AND t.posted_journal_id IS NOT NULL;
 result:=result||jsonb_build_object('sales_credit_notes',rows);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'company_id',t.company_id,'posted_journal_id',t.posted_journal_id,'credit_date',t.credit_date) ORDER BY t.id),'[]') INTO rows FROM public.purchase_credit_notes t WHERE t.company_id=_company_id AND t.posted_journal_id IS NOT NULL;
 result:=result||jsonb_build_object('purchase_credit_notes',rows);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.capture_cash_report_source(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.capture_cash_report_source(uuid,date) TO authenticated;

-- Resolve the existing company default only when capturing new facts. A frozen
-- delivery/pack keeps its captured definition even if this setting later changes.
CREATE FUNCTION private.resolve_reporting_basis(_company_id uuid,_override text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE selected_basis text;
BEGIN
 selected_basis:=_override;
 IF selected_basis IS NULL THEN
  SELECT document->>'reporting_basis' INTO selected_basis FROM public.organisation_config
   WHERE company_id=_company_id AND category='accounting';
 END IF;
 selected_basis:=COALESCE(selected_basis,'accrual');
 IF selected_basis NOT IN ('cash','accrual') THEN RAISE EXCEPTION 'Invalid accounting basis'; END IF;
 RETURN selected_basis;
END $$;
REVOKE ALL ON FUNCTION private.resolve_reporting_basis(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.resolve_reporting_basis(uuid,text) TO authenticated;

-- Reuse the established custom-column validation/period construction. Cash
-- balances are derived by the same application/worker recognition engine as the
-- statements, never by relabelling these accrual aggregates.
ALTER FUNCTION public.capture_custom_report_facts(uuid,date,date,jsonb)
RENAME TO capture_custom_report_facts_accrual_v2;
CREATE FUNCTION public.capture_custom_report_facts(_company_id uuid,_from date,_to date,_definition jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE facts jsonb; last_date date; cols jsonb;
BEGIN
 _definition:=COALESCE(_definition,'{}'::jsonb)||jsonb_build_object('basis',
  private.resolve_reporting_basis(_company_id,_definition->>'basis'));
 facts:=public.capture_custom_report_facts_accrual_v2(_company_id,_from,_to,_definition);
 IF _definition->>'basis'='cash' THEN
  SELECT GREATEST(_to,max((c->>'to')::date)),
   COALESCE(jsonb_agg(c||jsonb_build_object('balances','[]'::jsonb)),'[]'::jsonb)
  INTO last_date,cols FROM jsonb_array_elements(facts->'customColumns') c;
  facts:=facts||jsonb_build_object('customColumns',cols,
   'cashSource',public.capture_cash_report_source(_company_id,last_date),'cashSourceVersion',1);
 END IF;
 RETURN facts;
END $$;
REVOKE ALL ON FUNCTION public.capture_custom_report_facts(uuid,date,date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.capture_custom_report_facts(uuid,date,date,jsonb) TO authenticated;


CREATE OR REPLACE FUNCTION public.queue_report_delivery(_company_id uuid, _payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE p public.report_packs; v public.report_saved_views; facts jsonb; definition jsonb; id uuid; recipient text; recipients jsonb; cash_basis boolean; last_date date; selected_basis text; selected_settings jsonb; view_config jsonb;
BEGIN PERFORM private.assert_reporting_feature(_company_id);
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company_id,'reports.export') THEN RAISE EXCEPTION 'Report export permission required' USING ERRCODE='42501'; END IF;
 recipients:=_payload->'recipients';
 IF jsonb_typeof(recipients)<>'array' OR jsonb_array_length(recipients) NOT BETWEEN 1 AND 25 OR length(trim(_payload->>'subject')) NOT BETWEEN 1 AND 200 OR length(COALESCE(_payload->>'message',''))>10000 THEN RAISE EXCEPTION 'Invalid delivery message'; END IF;
 FOR recipient IN SELECT jsonb_array_elements_text(recipients) LOOP IF recipient !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' OR length(recipient)>254 THEN RAISE EXCEPTION 'Invalid recipient address'; END IF;END LOOP;
 IF _payload ? 'packId' THEN
  SELECT * INTO p FROM public.report_packs WHERE report_packs.id=(_payload->>'packId')::uuid AND company_id=_company_id FOR UPDATE;
  IF NOT FOUND OR p.status NOT IN ('published','delivered') OR p.owner_id<>auth.uid() THEN RAISE EXCEPTION 'Only the owner can deliver a published pack' USING ERRCODE='42501'; END IF;
  IF p.config->>'basis'='cash' AND p.snapshot->>'cashSourceVersion' IS DISTINCT FROM '1' THEN
   RAISE EXCEPTION 'Resubmit and approve this cash pack to capture its cash source facts'; END IF;
  facts:=p.snapshot;definition:=jsonb_build_object('name',p.name,'config',p.config);
 ELSE
  SELECT * INTO v FROM public.report_saved_views WHERE report_saved_views.id=(_payload->>'viewId')::uuid AND company_id=_company_id;
  IF NOT FOUND OR NOT private.report_access(v.id,false) OR v.user_id<>auth.uid() THEN RAISE EXCEPTION 'Only the report owner can deliver this report' USING ERRCODE='42501'; END IF;
  IF v.report_id NOT IN ('profit-and-loss','balance-sheet','trial-balance','cash-summary','cash-flow-indirect') AND NOT (v.config ? '_builder') THEN RAISE EXCEPTION 'Email export is not supported for this report type'; END IF;
  selected_settings:=COALESCE((v.config->>'settings')::jsonb,'{}'::jsonb);
  selected_basis:=private.resolve_reporting_basis(_company_id,
   COALESCE(v.config->'_builder'->>'basis',v.config->>'basis',selected_settings->>'basis'));
  selected_settings:=selected_settings||jsonb_build_object('basis',selected_basis);
  view_config:=v.config||jsonb_build_object('basis',selected_basis);
  IF v.config ? '_builder' THEN
   view_config:=view_config||jsonb_build_object('_builder',(v.config->'_builder')||jsonb_build_object('basis',selected_basis));
  END IF;
  IF NOT(v.config ? '_builder') AND v.report_id IN ('profit-and-loss','balance-sheet') AND
   (v.config ? 'settings' OR selected_basis='cash') THEN
   view_config:=view_config||jsonb_build_object('settings',selected_settings::text);
  END IF;
  facts:=CASE WHEN v.config ? '_builder' THEN public.capture_custom_report_facts(_company_id,(_payload->>'from')::date,(_payload->>'to')::date,view_config->'_builder') WHEN (v.config ? 'settings' OR selected_basis='cash') AND v.report_id IN ('profit-and-loss','balance-sheet') THEN public.capture_standard_report_facts(_company_id,(_payload->>'from')::date,(_payload->>'to')::date,v.report_id,selected_settings) ELSE public.capture_reporting_facts(_company_id,(_payload->>'from')::date,(_payload->>'to')::date) END;
  cash_basis:=selected_basis='cash';
  IF cash_basis AND NOT(v.config ? '_builder') AND v.report_id IN ('trial-balance','cash-summary','cash-flow-indirect') THEN
   last_date:=GREATEST((_payload->>'to')::date,(facts->>'priorTo')::date);
   facts:=facts||jsonb_build_object('cashSource',public.capture_cash_report_source(_company_id,last_date),'cashSourceVersion',1);
  END IF;
  definition:=jsonb_build_object('name',v.name,'reportId',v.report_id,'config',view_config);
 END IF;
 INSERT INTO public.report_deliveries(company_id,owner_id,pack_id,view_id,recipients,subject,message,facts,definition)
 VALUES(_company_id,auth.uid(),p.id,v.id,recipients,trim(_payload->>'subject'),COALESCE(_payload->>'message',''),facts,definition) RETURNING report_deliveries.id INTO id;
 PERFORM public.record_audit_event(_company_id,'report.delivery_queued','report_delivery',id,jsonb_build_object('pack_id',p.id,'view_id',v.id,'recipient_count',jsonb_array_length(recipients)));
 RETURN id;
END $function$
;


CREATE OR REPLACE FUNCTION public.capture_standard_report_facts(_company_id uuid,_from date,_to date,_report_id text,_settings jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE facts jsonb; last_date date;
BEGIN
 _settings:=COALESCE(_settings,'{}'::jsonb)||jsonb_build_object('basis',
  private.resolve_reporting_basis(_company_id,_settings->>'basis'));
 facts:=public.capture_standard_report_facts_accrual_v1(_company_id,_from,_to,_report_id,_settings);
 IF _settings->>'basis'='cash' THEN
  SELECT GREATEST(_to,max((p->>'to')::date)) INTO last_date FROM jsonb_array_elements(facts->'standardColumns') p;
  facts:=facts||jsonb_build_object('cashSource',public.capture_cash_report_source(_company_id,last_date),
   'cashSourceVersion',1);
 END IF;
 RETURN facts;
END $$;
REVOKE ALL ON FUNCTION public.capture_standard_report_facts(uuid,date,date,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.capture_standard_report_facts(uuid,date,date,text,jsonb) TO authenticated;

-- Preserve all existing preparation/reviewer/feature checks. Extend only the
-- authoritative capture at submission so approval hashes freeze cash sources.
DO $migration$
DECLARE definition text; original text:=
 'facts:=public.capture_reporting_facts(p.company_id,p.from_date,p.to_date);next_status:=''ready_for_review'';';
 replacement text:=
 'facts:=public.capture_reporting_facts(p.company_id,p.from_date,p.to_date);
  p.config:=p.config||jsonb_build_object(''basis'',private.resolve_reporting_basis(p.company_id,p.config->>''basis''));
  IF p.config->>''basis''=''cash'' THEN
   facts:=facts||jsonb_build_object(''cashSource'',public.capture_cash_report_source(p.company_id,
    GREATEST(p.to_date,(facts->>''priorTo'')::date)),''cashSourceVersion'',1);
  END IF;
  next_status:=''ready_for_review'';';
BEGIN
 definition:=pg_get_functiondef('public.transition_report_pack(uuid,integer,text,text)'::regprocedure);
 IF position(original IN definition)=0 THEN
  RAISE EXCEPTION 'Report pack capture changed; review migration before applying'; END IF;
 IF position('snapshot=CASE WHEN _action=''submit'' THEN facts ELSE snapshot END,' IN definition)=0 THEN
  RAISE EXCEPTION 'Report pack persistence changed; review migration before applying'; END IF;
 definition:=replace(definition,original,replacement);
 -- Freeze the resolved basis in the same update and hash as the new snapshot.
 -- Approving, publishing and delivering existing snapshots never resolves it anew.
 definition:=replace(definition,'snapshot=CASE WHEN _action=''submit'' THEN facts ELSE snapshot END,',
  'config=CASE WHEN _action=''submit'' THEN p.config ELSE config END,
 snapshot=CASE WHEN _action=''submit'' THEN facts ELSE snapshot END,');
 EXECUTE definition;
END $migration$;
