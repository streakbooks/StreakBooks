-- Search all ledger account classes. Correction writes remain additive and protect subledgers.
-- An account linked to a bank or asset lifecycle is protected even if its chart metadata is incomplete.
CREATE OR REPLACE FUNCTION private.correction_account_ok(a public.accounts) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT a.account_type IN ('asset','liability','equity','income','expense') AND a.is_active AND a.is_postable AND NOT a.is_control AND NOT a.is_header
 AND a.archived_at IS NULL AND a.system_key IS NULL AND NOT coalesce(a.is_payment_enabled,false)
 AND coalesce(a.subtype,'') NOT IN ('rounding','fx_gain','fx_loss','depreciation','bank','cash','credit_card','inventory','fixed_asset','accounts_receivable','accounts_payable','tax','tax_payable','retained_earnings')
 AND coalesce(a.account_kind,'') NOT IN ('depreciation','bank','cash','credit_card','inventory','fixed_asset','accounts_receivable','accounts_payable','tax','retained_earnings')
 AND NOT(a.is_system AND a.code='6900')
 AND NOT EXISTS(SELECT 1 FROM public.bank_accounts b WHERE b.company_id=a.company_id AND b.gl_account_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM public.fixed_assets f WHERE f.company_id=a.company_id AND a.id IN (f.asset_account_id,f.accumulated_account_id));
$$;
CREATE FUNCTION private.correction_financial_impact(rows jsonb,target public.accounts) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 WITH changes AS (
  SELECT (v->>'source_account_id')::uuid id,-((v->>'debit_minor')::numeric-(v->>'credit_minor')::numeric) amount FROM jsonb_array_elements(rows)v
  UNION ALL SELECT target.id,(v->>'debit_minor')::numeric-(v->>'credit_minor')::numeric FROM jsonb_array_elements(rows)v
 ), totals AS (SELECT id,sum(amount) amount FROM changes GROUP BY id), joined AS (
 SELECT a.id,a.code,a.name,a.account_type,t.amount FROM totals t JOIN public.accounts a ON a.id=t.id AND a.company_id=target.company_id)
 SELECT jsonb_build_object('profit_change_minor',coalesce((SELECT -sum(amount) FROM joined WHERE account_type IN ('income','expense')),0)::text,
 'cross_statement_lines',(SELECT count(*) FROM jsonb_array_elements(rows)v WHERE ((v->>'source_account_type') IN ('income','expense'))<>(target.account_type IN ('income','expense'))),
 'account_changes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'type',account_type,'debit_change_minor',amount::text) ORDER BY code) FROM joined),'[]'));
$$;
REVOKE ALL ON FUNCTION private.correction_financial_impact(jsonb,public.accounts) FROM PUBLIC,anon,authenticated;

-- Metadata is company-scoped and computed from authoritative source and reconciliation records.
-- Tax filters identify source lines coded to the selected GL account; they never infer tax from amounts.
CREATE VIEW private.correction_search_candidates WITH(security_invoker=true) AS
 SELECT v.*,jsonb_build_object(
 'source_type',v.source_type,'journal_status',j.status,'source_status',coalesce(si.status::text,pb.status::text,sc.status::text,pc.status::text,md.status,bt.status::text,j.status::text),
 'account_type',v.account_type,'account_code',v.account_code,'account_name',v.account_name,'subtype',a.subtype,
 'currency',v.currency,'description',v.description,'memo',v.memo,'reference',coalesce(si.invoice_number,pb.bill_number,sc.credit_number,pc.credit_number,md.reference,bt.reference,v.source_reference),
 'contact',coalesce(ct.name,v.contact_name),'entered_by',j.created_by,'posted_by',j.posted_by,
 'side',CASE WHEN v.debit_minor>0 THEN 'debit' ELSE 'credit' END,
 'eligibility',CASE WHEN v.blocked_reason IS NULL THEN 'eligible' ELSE 'blocked' END,
 'line_amount',v.base_gross_minor::text,'document_total',public.fx_to_base_minor(coalesce(si.total_minor,pb.total_minor,sc.total_minor,pc.total_minor,md.total_minor,abs(bt.amount_minor),jt.total),j.fx_rate_to_base,j.currency_code,c.base_currency)::text,
 'date',v.journal_date,'reconciled_date',recon.completed_date,
 'bank_account',banks.names,'tax_code',tax.codes,'tax_rate',tax.rates
 ) metadata
 FROM private.correction_line_candidates v
 JOIN public.journals j ON j.id=v.journal_id AND j.company_id=v.company_id
 JOIN public.accounts a ON a.id=v.account_id AND a.company_id=v.company_id
 JOIN public.companies c ON c.id=v.company_id
 LEFT JOIN public.sales_invoices si ON j.source_type='sales_invoice' AND si.id=j.source_id AND si.company_id=v.company_id
 LEFT JOIN public.purchase_bills pb ON j.source_type='purchase_bill' AND pb.id=j.source_id AND pb.company_id=v.company_id
 LEFT JOIN public.sales_credit_notes sc ON j.source_type='sales_credit_note' AND sc.id=j.source_id AND sc.company_id=v.company_id
 LEFT JOIN public.purchase_credit_notes pc ON j.source_type='purchase_credit_note' AND pc.id=j.source_id AND pc.company_id=v.company_id
 LEFT JOIN public.money_documents md ON md.posted_journal_id=j.id AND md.company_id=v.company_id
 LEFT JOIN public.bank_transactions bt ON j.source_type='bank_transaction' AND bt.id=j.source_id AND bt.company_id=v.company_id
 LEFT JOIN public.contacts ct ON ct.id=coalesce(si.contact_id,pb.contact_id,sc.contact_id,pc.contact_id,md.contact_id,bt.contact_id) AND ct.company_id=v.company_id
 LEFT JOIN LATERAL (SELECT sum(l.debit_minor)::bigint total FROM public.journal_lines l WHERE l.journal_id=j.id AND l.company_id=v.company_id)jt ON true
 LEFT JOIN LATERAL (
 SELECT jsonb_agg(DISTINCT b.name) names FROM public.bank_accounts b WHERE b.company_id=v.company_id
 AND (b.id=bt.bank_account_id OR b.id=md.bank_account_id OR EXISTS(SELECT 1 FROM public.journal_lines l WHERE l.journal_id=j.id AND l.company_id=v.company_id AND l.account_id=b.gl_account_id))
 )banks ON true
 LEFT JOIN LATERAL (
 SELECT max(rs.completed_at::date) completed_date FROM public.reconciliation_session_lines rl
 JOIN public.reconciliation_sessions rs ON rs.id=rl.session_id AND rs.company_id=v.company_id
 JOIN public.journal_lines l ON l.id=rl.journal_line_id AND l.company_id=v.company_id
 WHERE rl.company_id=v.company_id AND l.journal_id=j.id AND rs.status='completed' AND rs.voided_at IS NULL
 )recon ON true
 LEFT JOIN LATERAL (
 SELECT jsonb_agg(DISTINCT tc.code) FILTER(WHERE tc.code IS NOT NULL) codes,jsonb_agg(DISTINCT (src.rate::numeric/100)::text) FILTER(WHERE src.rate IS NOT NULL) rates FROM (
 SELECT l.tax_code_id,l.tax_rate_bps rate FROM public.sales_invoice_lines l WHERE l.company_id=v.company_id AND l.invoice_id=si.id AND l.account_id=v.account_id
 UNION ALL SELECT l.tax_code_id,l.tax_rate_bps FROM public.purchase_bill_lines l WHERE l.company_id=v.company_id AND l.bill_id=pb.id AND l.account_id=v.account_id
 UNION ALL SELECT l.tax_code_id,l.tax_rate_bps FROM public.sales_credit_note_lines l WHERE l.company_id=v.company_id AND l.credit_note_id=sc.id AND l.account_id=v.account_id
 )src LEFT JOIN public.tax_codes tc ON tc.id=src.tax_code_id AND tc.company_id=v.company_id
 )tax ON true;
REVOKE ALL ON private.correction_search_candidates FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.validate_correction_conditions(conditions jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE c jsonb; f text; op text; val text; kind text;
BEGIN
 IF jsonb_typeof(conditions) IS DISTINCT FROM 'array' OR jsonb_array_length(conditions)>30 THEN RAISE EXCEPTION 'Use at most 30 search conditions'; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(conditions) LOOP
  f:=c->>'field'; op:=c->>'operator';
  IF f IS NULL OR f NOT IN ('source_type','journal_status','source_status','account_type','account_code','account_name','subtype','currency','description','memo','reference','contact','entered_by','posted_by','side','eligibility','line_amount','document_total','date','reconciled_date','bank_account','tax_code','tax_rate') THEN RAISE EXCEPTION 'Unknown condition field'; END IF;
  kind:=CASE WHEN f IN ('line_amount','document_total') THEN 'money' WHEN f IN ('date','reconciled_date') THEN 'date' WHEN f='tax_rate' THEN 'rate' ELSE 'text' END;
  IF op IS NULL OR op NOT IN ('is','is_not','contains','not_contains','gte','lte','between','empty','not_empty') OR (kind='text' AND op IN ('gte','lte','between')) OR (kind<>'text' AND op IN ('contains','not_contains')) THEN RAISE EXCEPTION 'Unsupported condition operator'; END IF;
  IF op IN ('empty','not_empty') THEN CONTINUE; END IF;
  FOREACH val IN ARRAY (CASE WHEN op='between' THEN ARRAY[c->>'value',c->>'value_to'] ELSE ARRAY[c->>'value'] END) LOOP
   IF val IS NULL OR length(trim(val)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Condition value required (maximum 200 characters)'; END IF;
   IF kind='money' THEN
    IF val!~'^\d{1,19}$' OR val::numeric>9223372036854775807 THEN RAISE EXCEPTION 'Invalid condition amount'; END IF;
   ELSIF kind='date' THEN
    IF val!~'^\d{4}-\d{2}-\d{2}$' OR to_char(val::date,'YYYY-MM-DD')<>val THEN RAISE EXCEPTION 'Invalid condition date'; END IF;
   ELSIF kind='rate' THEN
    IF val!~'^\d{1,3}(\.\d{1,2})?$' OR val::numeric>100 THEN RAISE EXCEPTION 'Invalid tax rate'; END IF;
   END IF;
  END LOOP;
  IF op='between' AND (CASE WHEN kind='date' THEN (c->>'value')::date>(c->>'value_to')::date ELSE (c->>'value')::numeric>(c->>'value_to')::numeric END) THEN RAISE EXCEPTION 'Condition range is reversed'; END IF;
 END LOOP;
END $$;
CREATE FUNCTION private.correction_conditions_match(metadata jsonb,conditions jsonb,mode text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE c jsonb; v jsonb; values_json jsonb; op text; f text; wanted text; got text; matched boolean; item_match boolean; is_empty boolean;
BEGIN
 IF jsonb_array_length(conditions)=0 THEN RETURN true; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(conditions) LOOP
  f:=c->>'field';op:=c->>'operator';wanted:=c->>'value';v:=metadata->f;
  values_json:=CASE WHEN jsonb_typeof(v)='array' THEN v WHEN v IS NULL OR v='null'::jsonb THEN '[]'::jsonb ELSE jsonb_build_array(v) END;
  is_empty:=jsonb_array_length(values_json)=0 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(values_json)x WHERE nullif(x,'') IS NOT NULL);
  matched:=false;
  IF op='empty' THEN matched:=is_empty;
  ELSIF op='not_empty' THEN matched:=NOT is_empty;
  ELSIF NOT is_empty THEN
   FOR got IN SELECT value FROM jsonb_array_elements_text(values_json) WHERE value IS NOT NULL LOOP
    item_match:=CASE
     WHEN op IN ('is','is_not') AND f IN ('line_amount','document_total','tax_rate') THEN got::numeric=wanted::numeric
     WHEN op IN ('is','is_not') THEN lower(got)=lower(wanted)
     WHEN op IN ('contains','not_contains') THEN position(lower(wanted) IN lower(got))>0
     WHEN f IN ('date','reconciled_date') THEN CASE op WHEN 'gte' THEN got::date>=wanted::date WHEN 'lte' THEN got::date<=wanted::date WHEN 'between' THEN got::date BETWEEN wanted::date AND (c->>'value_to')::date ELSE false END
     ELSE CASE op WHEN 'gte' THEN got::numeric>=wanted::numeric WHEN 'lte' THEN got::numeric<=wanted::numeric WHEN 'between' THEN got::numeric BETWEEN wanted::numeric AND (c->>'value_to')::numeric ELSE false END END;
    matched:=matched OR item_match;
   END LOOP;
   IF op IN ('is_not','not_contains') THEN matched:=NOT matched; END IF;
  END IF;
  IF mode='all' AND NOT matched THEN RETURN false; END IF;
  IF mode='any' AND matched THEN RETURN true; END IF;
 END LOOP;
 RETURN mode='all';
END $$;
REVOKE ALL ON FUNCTION private.validate_correction_conditions(jsonb),private.correction_conditions_match(jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.find_correction_lines(_company_id uuid,_filters jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE rows jsonb; page integer:=coalesce((_filters->>'page')::integer,0); d1 date:=(_filters->>'from')::date; d2 date:=(_filters->>'to')::date;
 conditions jsonb:=coalesce(_filters->'conditions','[]'); scope text:=coalesce(_filters->>'scope','all'); mode text:=coalesce(_filters->>'match','all'); lo numeric; hi numeric;
BEGIN
 IF auth.uid() IS NULL OR NOT private.mfa_requirement_met() OR NOT public.has_company_permission(_company_id,'accounting.view') THEN RAISE EXCEPTION 'Accounting access required' USING ERRCODE='42501'; END IF;
 IF d1 IS NULL OR d2 IS NULL OR d1>d2 OR d2-d1>3660 OR page NOT BETWEEN 0 AND 100000 OR length(coalesce(_filters->>'query',''))>200 OR scope NOT IN ('all','profit_loss','balance_sheet') OR mode NOT IN ('all','any') THEN RAISE EXCEPTION 'Invalid search range, scope or mode'; END IF;
 PERFORM private.validate_correction_conditions(conditions);
 lo:=nullif(_filters->>'min_minor','')::numeric;hi:=nullif(_filters->>'max_minor','')::numeric;
 IF lo<0 OR hi<0 OR lo>9223372036854775807 OR hi>9223372036854775807 OR trunc(lo)<>lo OR trunc(hi)<>hi OR lo>hi THEN RAISE EXCEPTION 'Invalid amount range'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.journal_date DESC,r.id),'[]') INTO rows FROM (
  SELECT v.id,v.journal_id,v.journal_date,v.journal_number::text,v.source_type,v.source_id,v.account_id,v.account_code,v.account_name,v.account_type,v.currency,
   v.description,v.memo,v.metadata->>'reference' source_reference,v.metadata->>'contact' contact_name,v.base_gross_minor::text,v.debit_minor::text,v.credit_minor::text,v.fingerprint,v.blocked_reason,v.metadata
  FROM private.correction_search_candidates v WHERE v.company_id=_company_id AND v.journal_date BETWEEN d1 AND d2
   AND (scope='all' OR (scope='profit_loss' AND v.account_type IN ('income','expense')) OR (scope='balance_sheet' AND v.account_type IN ('asset','liability','equity')))
   AND (nullif(_filters->>'account_id','') IS NULL OR v.account_id=(_filters->>'account_id')::uuid)
   AND (nullif(_filters->>'source_type','') IS NULL OR v.source_type=_filters->>'source_type')
   AND (nullif(_filters->>'query','') IS NULL OR position(lower(_filters->>'query') IN lower(concat_ws(' ',v.description,v.memo,v.journal_number::text,v.metadata->>'reference',v.metadata->>'contact')))>0)
   AND (lo IS NULL OR v.base_gross_minor>=lo) AND (hi IS NULL OR v.base_gross_minor<=hi)
   AND private.correction_conditions_match(v.metadata,conditions,mode)
  ORDER BY v.journal_date DESC,v.id LIMIT 201 OFFSET page*200
 )r;
 RETURN jsonb_build_object('rows',coalesce((SELECT jsonb_agg(value ORDER BY ordinality) FROM jsonb_array_elements(rows) WITH ORDINALITY WHERE ordinality<=200),'[]'),'has_more',jsonb_array_length(rows)>200,'page',page);
END $$;
CREATE OR REPLACE FUNCTION private.correction_plan(_company_id uuid,_items jsonb,_target_id uuid,_mode text,_date date,_reason text) RETURNS jsonb
 LANGUAGE plpgsql SET search_path='' AS $$
DECLARE target public.accounts; item jsonb; ln record; posting_date date; rows jsonb:='[]'; gross numeric:=0; base text; dates date[]:='{}';
BEGIN
 IF _items IS NULL OR jsonb_typeof(_items)<>'array' OR jsonb_array_length(_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Select between 1 and 100 lines'; END IF;
 IF (SELECT count(DISTINCT v->>'id') FROM jsonb_array_elements(_items)v)<>jsonb_array_length(_items) THEN RAISE EXCEPTION 'Duplicate or missing selected line'; END IF;
 IF _mode IS NULL OR _mode NOT IN ('original','adjustment') OR (_mode='adjustment' AND _date IS NULL) OR (_mode='original' AND _date IS NOT NULL) THEN RAISE EXCEPTION 'Choose a valid correction date policy'; END IF;
 IF _reason IS NULL OR length(trim(_reason)) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'A reason of 5 to 1000 characters is required'; END IF;
 SELECT * INTO target FROM public.accounts WHERE company_id=_company_id AND id=_target_id;
 SELECT base_currency::text INTO base FROM public.companies WHERE id=_company_id;
 IF target.id IS NULL OR NOT private.correction_account_ok(target) OR (target.currency_code IS NOT NULL AND target.currency_code::text<>base) THEN RAISE EXCEPTION 'Choose an active, ordinary destination account'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(_items) ORDER BY value->>'id' LOOP
  SELECT * INTO ln FROM private.correction_line_candidates WHERE company_id=_company_id AND id=(item->>'id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'A selected line is missing or inaccessible'; END IF;
  IF ln.fingerprint IS DISTINCT FROM item->>'fingerprint' THEN RAISE EXCEPTION 'A selected line changed. Search and preview again' USING ERRCODE='40001'; END IF;
  IF ln.blocked_reason IS NOT NULL THEN RAISE EXCEPTION '%',ln.blocked_reason; END IF;
  IF ln.account_id=_target_id THEN RAISE EXCEPTION 'Destination equals a selected source account'; END IF;
  posting_date:=CASE WHEN _mode='original' THEN ln.journal_date ELSE _date END;
  IF posting_date<ln.journal_date THEN RAISE EXCEPTION 'The adjustment date cannot precede any selected transaction'; END IF;
  PERFORM 1 FROM public.accounting_periods WHERE company_id=_company_id AND start_date<=posting_date AND end_date>=posting_date AND status='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'No open accounting period covers %',posting_date; END IF;
  PERFORM public.assert_journal_date_unlocked(_company_id,posting_date);
  gross:=gross+greatest(ln.debit_minor,ln.credit_minor);
  IF gross>9007199254740991 THEN RAISE EXCEPTION 'Batch exceeds the supported monetary range; split the selection'; END IF;
  dates:=array_append(dates,posting_date);
  rows:=rows||jsonb_build_array(jsonb_build_object('id',ln.id,'journal_id',ln.journal_id,'journal_number',ln.journal_number::text,'journal_date',ln.journal_date,
   'source_type',ln.source_type,'source_reference',ln.source_reference,'contact_name',ln.contact_name,'description',ln.description,'memo',ln.memo,'source_account_id',ln.account_id,'source_account_code',ln.account_code,'source_account_name',ln.account_name,'source_account_type',ln.account_type,
   'debit_minor',ln.debit_minor::text,'credit_minor',ln.credit_minor::text,'posting_date',posting_date,'fingerprint',ln.fingerprint));
 END LOOP;
 RETURN jsonb_build_object('company_id',_company_id,'currency',base,'rows',rows,'gross_minor',gross::text,'line_count',jsonb_array_length(rows),
  'journal_count',(SELECT count(DISTINCT d) FROM unnest(dates)d),'date_mode',_mode,'adjustment_date',_date,'reason',trim(_reason),
  'impact',private.correction_financial_impact(rows,target),
  'target',jsonb_build_object('id',target.id,'code',target.code,'name',target.name,'updated_at',target.updated_at));
END $$;
REVOKE ALL ON FUNCTION private.correction_plan(uuid,jsonb,uuid,text,date,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.transaction_correction_setup(_company_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE base text; decimals integer; accounts jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.mfa_requirement_met() OR NOT public.has_company_permission(_company_id,'accounting.view') THEN RAISE EXCEPTION 'Accounting access required' USING ERRCODE='42501'; END IF;
 SELECT c.base_currency::text,d.decimal_places INTO base,decimals FROM public.companies c JOIN public.currency_decimals d ON d.code=c.base_currency WHERE c.id=_company_id;
 IF base IS NULL THEN RAISE EXCEPTION 'Company currency is not configured'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'code',a.code,'name',a.name,'type',a.account_type,'eligible',private.correction_account_ok(a) AND (a.currency_code IS NULL OR a.currency_code::text=base)) ORDER BY a.code),'[]') INTO accounts
 FROM public.accounts a WHERE a.company_id=_company_id;
 RETURN jsonb_build_object('currency',base,'decimals',decimals,'accounts',accounts,'can_apply',public.has_company_permission(_company_id,'accounting.post') AND public.has_company_permission(_company_id,'journals.manual'));
END $$;
REVOKE ALL ON FUNCTION public.transaction_correction_setup(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transaction_correction_setup(uuid) TO authenticated;
