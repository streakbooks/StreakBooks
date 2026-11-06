-- Verify installed posted-tax guards and restricted execution surface.
-- Run after 20261106120000_tax_master_posted_history_guard.sql.
DO $$
DECLARE
  missing text := '';
  t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('tax_codes','tax_codes_guard_posted_history'),
    ('tax_rates','tax_rates_guard_posted_history'),
    ('sales_invoices','sales_invoice_tax_master_post_lock'),
    ('purchase_bills','purchase_bill_tax_master_post_lock'),
    ('sales_invoice_lines','sales_invoice_lines_tax_post_guard'),
    ('purchase_bill_lines','purchase_bill_lines_tax_post_guard'),
    ('sales_credit_notes','sales_credit_tax_posted_header_guard'),
    ('purchase_credit_notes','purchase_credit_tax_posted_header_guard'),
    ('purchase_expenses','purchase_expense_tax_posted_header_guard'),
    ('sales_credit_note_lines','sales_credit_tax_posted_lines_guard'),
    ('purchase_credit_note_lines','purchase_credit_tax_posted_lines_guard')
  ) AS expected(table_name, trigger_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger tr
        JOIN pg_class cl ON cl.oid=tr.tgrelid
        JOIN pg_namespace ns ON ns.oid=cl.relnamespace
      WHERE ns.nspname='public' AND cl.relname=t.table_name
        AND tr.tgname=t.trigger_name AND NOT tr.tgisinternal
        AND tr.tgenabled IN ('O','A')
    ) THEN
      missing := missing || t.table_name || '.' || t.trigger_name || E'\n';
    END IF;
  END LOOP;
  IF missing<>'' THEN
    RAISE EXCEPTION 'Tax migration postflight: required triggers missing/disabled:%',
      E'\n'||missing;
  END IF;

  IF has_function_privilege('authenticated',
      'public.guard_tax_source_line_after_posting()', 'EXECUTE')
    OR has_function_privilege('anon',
      'public.guard_posted_credit_note_tax_lines()', 'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.tax_code_has_posted_history(uuid,uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Tax history internal functions exposed to client roles';
  END IF;

  RAISE NOTICE 'PASS: 11 tax history triggers installed and internal execute permissions restricted';
END $$;
