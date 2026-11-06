-- Read-only schema compatibility preflight for Tax master/history migration.
-- Run on staging before 20261106120000_tax_master_posted_history_guard.sql.
-- This does not write user data or install triggers.
DO $$
DECLARE
  t record;
  c record;
  missing text := '';
BEGIN
  FOR t IN
    SELECT table_name FROM (VALUES
      ('companies'), ('accounts'), ('tax_rates'), ('tax_codes'),
      ('sales_invoices'), ('sales_invoice_lines'), ('purchase_bills'),
      ('purchase_bill_lines'), ('sales_credit_notes'),
      ('sales_credit_note_lines'), ('purchase_credit_notes'),
      ('purchase_credit_note_lines'), ('purchase_expenses')
    ) AS required(table_name)
  LOOP
    IF to_regclass('public.' || quote_ident(t.table_name)) IS NULL THEN
      missing := missing || 'missing table public.' || t.table_name || E'\n';
    END IF;
  END LOOP;

  FOR c IN SELECT * FROM (VALUES
    ('tax_rates','id'), ('tax_rates','company_id'),
    ('tax_rates','rate_bps'), ('tax_rates','effective_from'),
    ('tax_rates','effective_to'), ('tax_rates','code'),
    ('tax_rates','treatment'), ('tax_rates','applies_to'),
    ('tax_rates','jurisdiction_code'),
    ('tax_codes','id'), ('tax_codes','company_id'),
    ('tax_codes','tax_rate_id'), ('tax_codes','tax_account_id'),
    ('tax_codes','code'), ('tax_codes','applies_to'),
    ('tax_codes','treatment'), ('tax_codes','is_recoverable'),
    ('tax_codes','reporting_class'),
    ('sales_invoices','id'), ('sales_invoices','company_id'),
    ('sales_invoices','posted_journal_id'), ('sales_invoices','invoice_date'),
    ('sales_invoice_lines','id'), ('sales_invoice_lines','company_id'),
    ('sales_invoice_lines','invoice_id'), ('sales_invoice_lines','tax_code_id'),
    ('purchase_bills','id'), ('purchase_bills','company_id'),
    ('purchase_bills','posted_journal_id'), ('purchase_bills','bill_date'),
    ('purchase_bill_lines','id'), ('purchase_bill_lines','company_id'),
    ('purchase_bill_lines','bill_id'), ('purchase_bill_lines','tax_code_id'),
    ('sales_credit_notes','id'), ('sales_credit_notes','company_id'),
    ('sales_credit_notes','posted_journal_id'), ('sales_credit_notes','credit_date'),
    ('sales_credit_notes','currency_code'), ('sales_credit_notes','subtotal_minor'),
    ('sales_credit_notes','tax_minor'), ('sales_credit_notes','total_minor'),
    ('sales_credit_note_lines','id'), ('sales_credit_note_lines','company_id'),
    ('sales_credit_note_lines','credit_note_id'),
    ('purchase_credit_notes','id'), ('purchase_credit_notes','company_id'),
    ('purchase_credit_notes','posted_journal_id'), ('purchase_credit_notes','credit_date'),
    ('purchase_credit_notes','currency_code'), ('purchase_credit_notes','subtotal_minor'),
    ('purchase_credit_notes','tax_minor'), ('purchase_credit_notes','total_minor'),
    ('purchase_credit_note_lines','id'), ('purchase_credit_note_lines','company_id'),
    ('purchase_credit_note_lines','credit_note_id'),
    ('purchase_expenses','id'), ('purchase_expenses','company_id'),
    ('purchase_expenses','posted_journal_id'), ('purchase_expenses','expense_date'),
    ('purchase_expenses','expense_account_id'), ('purchase_expenses','payment_account_id'),
    ('purchase_expenses','currency_code'), ('purchase_expenses','net_minor'),
    ('purchase_expenses','tax_minor'), ('purchase_expenses','total_minor')
  ) AS required(table_name, column_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns x
      WHERE x.table_schema='public' AND x.table_name=c.table_name
        AND x.column_name=c.column_name
    ) THEN
      missing := missing || 'missing public.' || c.table_name ||
        '.' || c.column_name || E'\n';
    END IF;
  END LOOP;

  IF missing<>'' THEN
    RAISE EXCEPTION 'Tax history migration schema mismatch:%', E'\n'||missing;
  END IF;

  RAISE NOTICE 'PASS: Tax master/history migration prerequisites exist';
END $$;
