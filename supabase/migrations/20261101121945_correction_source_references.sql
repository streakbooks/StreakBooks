-- Keep correction preview and evidence aligned with advanced search source references.
-- Filters use exact base-currency ledger value, never mixed source minor units.
CREATE OR REPLACE VIEW private.correction_line_candidates WITH(security_invoker=true) AS
 SELECT l.id,l.company_id,l.journal_id,l.account_id,j.journal_date,j.journal_number,j.source_type::text AS source_type,j.source_id,
 a.code AS account_code,a.name AS account_name,a.account_type::text AS account_type,j.currency_code::text AS currency,
 l.description,j.memo,l.debit_minor,l.credit_minor,coalesce(si.invoice_number,pb.bill_number,sc.credit_number,pc.credit_number,md.reference,bt.reference,j.journal_number::text) AS source_reference,ct.name AS contact_name,
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
 LEFT JOIN public.sales_credit_notes sc ON j.source_type='sales_credit_note' AND sc.id=j.source_id AND sc.company_id=l.company_id
 LEFT JOIN public.purchase_credit_notes pc ON j.source_type='purchase_credit_note' AND pc.id=j.source_id AND pc.company_id=l.company_id
 LEFT JOIN public.money_documents md ON md.posted_journal_id=j.id AND md.company_id=l.company_id
 LEFT JOIN public.bank_transactions bt ON j.source_type='bank_transaction' AND bt.id=j.source_id AND bt.company_id=l.company_id
 LEFT JOIN public.contacts ct ON ct.id=coalesce(si.contact_id,pb.contact_id,sc.contact_id,pc.contact_id,md.contact_id,bt.contact_id) AND ct.company_id=l.company_id;

