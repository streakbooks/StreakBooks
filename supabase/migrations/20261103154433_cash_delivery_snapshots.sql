-- Freeze source facts at enqueue time; worker and browser share the same cash engine.
CREATE FUNCTION public.cash_reporting_capabilities(_company_id uuid) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM private.assert_reporting_feature(_company_id);
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company_id,'reports.view') THEN
  RAISE EXCEPTION 'Report view permission required' USING ERRCODE='42501'; END IF;
 RETURN 1;
END $$;
REVOKE ALL ON FUNCTION public.cash_reporting_capabilities(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cash_reporting_capabilities(uuid) TO authenticated;

CREATE FUNCTION public.capture_cash_report_source(_company_id uuid,_to date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb:='{}'; rows jsonb;
BEGIN
 PERFORM public.cash_reporting_capabilities(_company_id);
 IF _to IS NULL THEN RAISE EXCEPTION 'Cash snapshot requires an end date'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',l.id,'account_id',l.account_id,
 'debit_minor',l.debit_minor::text,'credit_minor',l.credit_minor::text,
 'journals',jsonb_build_object('id',j.id,'company_id',j.company_id,'journal_date',j.journal_date,
 'journal_number',j.journal_number,'source_type',j.source_type,'source_id',j.source_id,
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
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'company_id',t.company_id,'receipt_id',t.receipt_id,'invoice_id',t.invoice_id,'amount_minor',t.amount_minor::text,'reversed_on',t.reversed_on) ORDER BY t.id),'[]') INTO rows FROM public.sales_receipt_allocations t WHERE t.company_id=_company_id;
 result:=result||jsonb_build_object('sales_receipt_allocations',rows);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'company_id',t.company_id,'payment_id',t.payment_id,'bill_id',t.bill_id,'amount_minor',t.amount_minor::text) ORDER BY t.id),'[]') INTO rows FROM public.supplier_payment_allocations t WHERE t.company_id=_company_id;
 result:=result||jsonb_build_object('supplier_payment_allocations',rows);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'company_id',t.company_id,'kind',t.kind,'posted_journal_id',t.posted_journal_id,'void_journal_id',t.void_journal_id,'currency_code',t.currency_code,'fx_rate_to_base',t.fx_rate_to_base::text,'total_minor',t.total_minor::text) ORDER BY t.id),'[]') INTO rows FROM public.money_documents t WHERE t.company_id=_company_id AND t.document_date<=_to;
 result:=result||jsonb_build_object('money_documents',rows);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'document_id',t.document_id,'source_kind',t.source_kind,'source_id',t.source_id,'amount_minor',t.amount_minor::text) ORDER BY t.id),'[]') INTO rows FROM public.money_document_credit_uses t WHERE t.company_id=_company_id;
 result:=result||jsonb_build_object('money_document_credit_uses',rows);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'invoice_id',t.invoice_id,'credit_note_id',t.credit_note_id,'allocated_on',t.allocated_on,'reversed_on',t.reversed_on) ORDER BY t.id),'[]') INTO rows FROM public.sales_credit_allocations t WHERE t.company_id=_company_id;
 result:=result||jsonb_build_object('sales_credit_allocations',rows);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'bill_id',t.bill_id,'credit_note_id',t.credit_note_id) ORDER BY t.id),'[]') INTO rows FROM public.purchase_credit_allocations t WHERE t.company_id=_company_id;
 result:=result||jsonb_build_object('purchase_credit_allocations',rows);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'company_id',t.company_id,'source_table',t.source_table,'allocation_id',t.allocation_id,'operation',t.operation,'source_row',t.source_row) ORDER BY t.id),'[]') INTO rows FROM public.cash_allocation_history t WHERE t.company_id=_company_id;
 result:=result||jsonb_build_object('cash_allocation_history',rows);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.capture_cash_report_source(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.capture_cash_report_source(uuid,date) TO authenticated;

ALTER FUNCTION public.capture_standard_report_facts(uuid,date,date,text,jsonb)
 RENAME TO capture_standard_report_facts_accrual_v1;
CREATE FUNCTION public.capture_standard_report_facts(_company_id uuid,_from date,_to date,_report_id text,_settings jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE facts jsonb; last_date date;
BEGIN
 facts:=public.capture_standard_report_facts_accrual_v1(_company_id,_from,_to,_report_id,_settings);
 IF COALESCE(_settings->>'basis','accrual') NOT IN ('accrual','cash') THEN
  RAISE EXCEPTION 'Invalid accounting basis'; END IF;
 IF _settings->>'basis'='cash' THEN
  IF jsonb_array_length(COALESCE(_settings->'filters'->'clauses','[]'))>0 THEN
   RAISE EXCEPTION 'Clear accrual posted-line filters before running cash basis'; END IF;
  SELECT GREATEST(_to,max((p->>'to')::date)) INTO last_date FROM jsonb_array_elements(facts->'standardColumns') p;
  facts:=facts||jsonb_build_object('cashSource',public.capture_cash_report_source(_company_id,last_date),
   'cashSourceVersion',1);
 END IF;
 RETURN facts;
END $$;
REVOKE ALL ON FUNCTION public.capture_standard_report_facts(uuid,date,date,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.capture_standard_report_facts(uuid,date,date,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.queue_report_delivery(_company_id uuid, _payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE p public.report_packs; v public.report_saved_views; facts jsonb; definition jsonb; id uuid; recipient text; recipients jsonb;
BEGIN PERFORM private.assert_reporting_feature(_company_id);
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
  facts:=CASE WHEN v.config ? '_builder' THEN public.capture_custom_report_facts(_company_id,(_payload->>'from')::date,(_payload->>'to')::date,v.config->'_builder') WHEN (v.config ? 'settings' OR v.config->>'basis'='cash') AND v.report_id IN ('profit-and-loss','balance-sheet') THEN public.capture_standard_report_facts(_company_id,(_payload->>'from')::date,(_payload->>'to')::date,v.report_id,COALESCE((v.config->>'settings')::jsonb,'{}'::jsonb)||CASE WHEN v.config->>'basis'='cash' THEN '{"basis":"cash"}'::jsonb ELSE '{}'::jsonb END) ELSE public.capture_reporting_facts(_company_id,(_payload->>'from')::date,(_payload->>'to')::date) END;
  definition:=jsonb_build_object('name',v.name,'reportId',v.report_id,'config',CASE WHEN v.config->>'basis'='cash' AND NOT(v.config ? 'settings') THEN v.config||jsonb_build_object('settings','{"basis":"cash"}') ELSE v.config END);
 END IF;
 INSERT INTO public.report_deliveries(company_id,owner_id,pack_id,view_id,recipients,subject,message,facts,definition)
 VALUES(_company_id,auth.uid(),p.id,v.id,recipients,trim(_payload->>'subject'),COALESCE(_payload->>'message',''),facts,definition) RETURNING report_deliveries.id INTO id;
 PERFORM public.record_audit_event(_company_id,'report.delivery_queued','report_delivery',id,jsonb_build_object('pack_id',p.id,'view_id',v.id,'recipient_count',jsonb_array_length(recipients)));
 RETURN id;
END $function$
;
