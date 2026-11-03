-- Filters use exact base-currency ledger value, never mixed source minor units.
CREATE OR REPLACE VIEW private.correction_line_candidates WITH(security_invoker=true) AS
 SELECT l.id,l.company_id,l.journal_id,l.account_id,j.journal_date,j.journal_number,j.source_type::text AS source_type,j.source_id,
 a.code AS account_code,a.name AS account_name,a.account_type::text AS account_type,j.currency_code::text AS currency,
 l.description,j.memo,l.debit_minor,l.credit_minor,coalesce(si.invoice_number,pb.bill_number,j.journal_number::text) AS source_reference,ct.name AS contact_name,
 md5((to_jsonb(l)||jsonb_build_object('date',j.journal_date,'currency',j.currency_code,'fx',j.fx_rate_to_base,'reversed',j.reversed_by_journal_id,'status',j.status))::text) AS fingerprint,
 CASE WHEN j.status<>'posted' OR j.reversed_by_journal_id IS NOT NULL THEN 'Source journal is not posted or has been reversed'
 WHEN j.source_type::text NOT IN ('manual','sales_invoice','sales_credit_note','purchase_bill','purchase_credit_note','expense','bank_transaction') THEN 'This source requires its own correction workflow'
 WHEN coalesce(j.idempotency_key,'') LIKE 'transaction_correction:%' OR coalesce(j.idempotency_key,'') LIKE 'merge:%' OR coalesce(j.idempotency_key,'') LIKE 'year_end_close:%' THEN 'Generated accounting adjustment; use its original workflow'
 WHEN EXISTS(SELECT 1 FROM public.journal_auto_reversals r WHERE r.journal_id=j.id AND r.status IN ('pending','failed')) THEN 'Scheduled reversal must be resolved first'
 WHEN NOT private.correction_account_ok(a) THEN 'Protected or inactive account; use the source workflow'
 WHEN j.currency_code<>c.base_currency OR j.fx_rate_to_base<>1 OR (a.currency_code IS NOT NULL AND a.currency_code<>c.base_currency) THEN 'Foreign-currency corrections require the source workflow'
 WHEN EXISTS(SELECT 1 FROM public.transaction_correction_items i WHERE i.source_line_id=l.id AND i.active) THEN 'Already corrected; undo the active batch before correcting again'
 ELSE NULL END AS blocked_reason,
 public.fx_to_base_minor(greatest(l.debit_minor,l.credit_minor),j.fx_rate_to_base,j.currency_code,c.base_currency) AS base_gross_minor
 FROM public.journal_lines l JOIN public.journals j ON j.id=l.journal_id AND j.company_id=l.company_id
 JOIN public.accounts a ON a.id=l.account_id AND a.company_id=l.company_id JOIN public.companies c ON c.id=l.company_id
 LEFT JOIN public.sales_invoices si ON j.source_type='sales_invoice' AND si.id=j.source_id AND si.company_id=l.company_id
 LEFT JOIN public.purchase_bills pb ON j.source_type='purchase_bill' AND pb.id=j.source_id AND pb.company_id=l.company_id
 LEFT JOIN public.contacts ct ON ct.id=coalesce(si.contact_id,pb.contact_id) AND ct.company_id=l.company_id;

CREATE OR REPLACE FUNCTION public.find_correction_lines(_company_id uuid,_filters jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE rows jsonb; page integer:=coalesce((_filters->>'page')::integer,0); d1 date:=(_filters->>'from')::date; d2 date:=(_filters->>'to')::date;
BEGIN
 IF auth.uid() IS NULL OR NOT private.mfa_requirement_met() OR NOT public.has_company_permission(_company_id,'accounting.view') THEN RAISE EXCEPTION 'Accounting access required' USING ERRCODE='42501'; END IF;
 IF d1 IS NULL OR d2 IS NULL OR d1>d2 OR d2-d1>3660 OR page NOT BETWEEN 0 AND 100000 OR length(coalesce(_filters->>'query',''))>200 THEN RAISE EXCEPTION 'Invalid search range or page'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.journal_date DESC,r.id),'[]') INTO rows FROM (
  SELECT v.id,v.journal_id,v.journal_date,v.journal_number::text,v.source_type,v.source_id,v.account_id,v.account_code,v.account_name,v.account_type,v.currency,
   v.description,v.memo,v.source_reference,v.contact_name,v.base_gross_minor::text,v.debit_minor::text,v.credit_minor::text,v.fingerprint,v.blocked_reason
  FROM private.correction_line_candidates v WHERE v.company_id=_company_id AND v.account_type IN ('income','expense') AND v.journal_date BETWEEN d1 AND d2
   AND (nullif(_filters->>'account_id','') IS NULL OR v.account_id=(_filters->>'account_id')::uuid)
   AND (nullif(_filters->>'source_type','') IS NULL OR v.source_type=_filters->>'source_type')
   AND (nullif(_filters->>'query','') IS NULL OR position(lower(_filters->>'query') IN lower(concat_ws(' ',v.description,v.memo,v.journal_number::text,v.source_reference,v.contact_name)))>0)
   AND (nullif(_filters->>'min_minor','') IS NULL OR v.base_gross_minor>=(_filters->>'min_minor')::numeric)
   AND (nullif(_filters->>'max_minor','') IS NULL OR v.base_gross_minor<=(_filters->>'max_minor')::numeric)
  ORDER BY v.journal_date DESC,v.id LIMIT 201 OFFSET page*200
 )r;
 RETURN jsonb_build_object('rows',coalesce((SELECT jsonb_agg(value ORDER BY ordinality) FROM jsonb_array_elements(rows) WITH ORDINALITY WHERE ordinality<=200),'[]'),'has_more',jsonb_array_length(rows)>200,'page',page);
END $$;
