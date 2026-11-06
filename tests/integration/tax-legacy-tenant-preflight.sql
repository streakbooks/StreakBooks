-- Read-only check for historical organisation mismatches before Tax guards.
-- Run after tax-schema-preflight.sql and before the migration in staging.
-- Existing violations need manual analysis; never silently rewrite tax history.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tax_codes c
      LEFT JOIN public.tax_rates r ON r.id=c.tax_rate_id
    WHERE r.id IS NULL OR c.company_id IS DISTINCT FROM r.company_id
  ) THEN
    RAISE EXCEPTION 'Tax preflight: legacy tax codes reference rates in another organisation or missing rates';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tax_codes c
      LEFT JOIN public.accounts a ON a.id=c.tax_account_id
    WHERE c.tax_account_id IS NOT NULL
      AND (a.id IS NULL OR c.company_id IS DISTINCT FROM a.company_id)
  ) THEN
    RAISE EXCEPTION 'Tax preflight: legacy tax codes reference accounts in another organisation or missing accounts';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sales_invoice_lines l
      JOIN public.sales_invoices h ON h.id=l.invoice_id
      LEFT JOIN public.tax_codes c ON c.id=l.tax_code_id
    WHERE l.company_id IS DISTINCT FROM h.company_id
      OR (l.tax_code_id IS NOT NULL AND
        (c.id IS NULL OR l.company_id IS DISTINCT FROM c.company_id))
  ) THEN
    RAISE EXCEPTION 'Tax preflight: legacy invoice lines have cross-company document or tax code references';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.purchase_bill_lines l
      JOIN public.purchase_bills h ON h.id=l.bill_id
      LEFT JOIN public.tax_codes c ON c.id=l.tax_code_id
    WHERE l.company_id IS DISTINCT FROM h.company_id
      OR (l.tax_code_id IS NOT NULL AND
        (c.id IS NULL OR l.company_id IS DISTINCT FROM c.company_id))
  ) THEN
    RAISE EXCEPTION 'Tax preflight: legacy bill lines have cross-company document or tax code references';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sales_credit_note_lines l
      JOIN public.sales_credit_notes h ON h.id=l.credit_note_id
    WHERE l.company_id IS DISTINCT FROM h.company_id
  ) THEN
    RAISE EXCEPTION 'Tax preflight: legacy sales credit lines belong to another organisation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.purchase_credit_note_lines l
      JOIN public.purchase_credit_notes h ON h.id=l.credit_note_id
    WHERE l.company_id IS DISTINCT FROM h.company_id
  ) THEN
    RAISE EXCEPTION 'Tax preflight: legacy purchase credit lines belong to another organisation';
  END IF;

  RAISE NOTICE 'PASS: tax source references match organisation boundaries';
END $$;
