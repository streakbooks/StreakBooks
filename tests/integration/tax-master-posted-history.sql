-- Run after tax-master-history baseline and migration.
-- Execute as postgres; mutation cases run with the simulated authenticated role.
CREATE OR REPLACE FUNCTION public.assert_tax_raises(_statement text, _pattern text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _statement;
  RAISE EXCEPTION 'ASSERT ERROR: the operation unexpectedly succeeded: %', _statement;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM ILIKE 'ASSERT ERROR:%' OR SQLERRM NOT ILIKE _pattern THEN
    RAISE;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.assert_tax_raises(text,text) TO authenticated;

SET ROLE authenticated;

-- Draft references are not posted history and should not freeze a rate/code.
UPDATE public.tax_rates SET rate_bps=2100
 WHERE id='20000000-0000-4000-8000-000000000001';
UPDATE public.tax_codes SET treatment='reduced'
 WHERE id='30000000-0000-4000-8000-000000000001';

-- Company B's rate and GL account cannot be assigned to company A's code.
SELECT public.assert_tax_raises(
 $$UPDATE public.tax_codes SET tax_rate_id='20000000-0000-4000-8000-000000000002'
   WHERE id='30000000-0000-4000-8000-000000000001'$$,
 '%must belong to this organisation%');
SELECT public.assert_tax_raises(
 $$UPDATE public.tax_codes SET tax_account_id='40000000-0000-4000-8000-000000000002'
   WHERE id='30000000-0000-4000-8000-000000000001'$$,
 '%must belong to this organisation%');

-- A draft cannot use a foreign-company code even when the code exists.
SELECT public.assert_tax_raises(
 $$UPDATE public.sales_invoice_lines
   SET tax_code_id='30000000-0000-4000-8000-000000000002'
   WHERE id='60000000-0000-4000-8000-000000000001'$$,
 '%must belong to the source organisation%');

-- Turn the existing draft into a posted source; no actual journals needed for
-- this fixture because the trigger only checks posted_journal_id presence.
UPDATE public.sales_invoices
SET status='authorised', posted_journal_id='70000000-0000-4000-8000-000000000001'
WHERE id='50000000-0000-4000-8000-000000000001';

SELECT public.assert_tax_raises(
 $$UPDATE public.tax_codes SET is_recoverable=false
   WHERE id='30000000-0000-4000-8000-000000000001'$$,
 '%posted documents%');
SELECT public.assert_tax_raises(
 $$UPDATE public.tax_codes SET treatment='reverse_charge'
   WHERE id='30000000-0000-4000-8000-000000000001'$$,
 '%posted documents%');
INSERT INTO public.tax_rates(id,company_id,name,rate_bps,effective_from)
VALUES ('20000000-0000-4000-8000-000000000003',
        '10000000-0000-4000-8000-000000000001','Replacement VAT',2200,'2026-03-01');
SELECT public.assert_tax_raises(
 $$UPDATE public.tax_codes SET tax_rate_id='20000000-0000-4000-8000-000000000003'
   WHERE id='30000000-0000-4000-8000-000000000001'$$,
 '%posted documents%');
SELECT public.assert_tax_raises(
 $$UPDATE public.tax_rates SET rate_bps=2200
   WHERE id='20000000-0000-4000-8000-000000000001'$$,
 '%posted documents%');
SELECT public.assert_tax_raises(
 $$UPDATE public.tax_rates SET effective_from='2025-12-01'
   WHERE id='20000000-0000-4000-8000-000000000001'$$,
 '%posted documents%');
SELECT public.assert_tax_raises(
 $$UPDATE public.tax_rates SET effective_to='2026-02-14'
   WHERE id='20000000-0000-4000-8000-000000000001'$$,
 '%last posted document date%');

-- Source-line amount/classification changes cannot bypass tax master history.
SELECT public.assert_tax_raises(
 $$UPDATE public.sales_invoice_lines SET tax_code_id=NULL
   WHERE id='60000000-0000-4000-8000-000000000001'$$,
 '%Posted tax source lines are immutable%');
SELECT public.assert_tax_raises(
 $$DELETE FROM public.sales_invoice_lines
   WHERE id='60000000-0000-4000-8000-000000000001'$$,
 '%Posted tax source lines are immutable%');
SELECT public.assert_tax_raises(
 $$INSERT INTO public.sales_invoice_lines(id,company_id,invoice_id,tax_code_id)
   VALUES ('60000000-0000-4000-8000-000000000003',
           '10000000-0000-4000-8000-000000000001',
           '50000000-0000-4000-8000-000000000001',
           '30000000-0000-4000-8000-000000000001')$$,
 '%Posted tax source lines are immutable%');
SELECT public.assert_tax_raises(
 $$UPDATE public.sales_invoices SET posted_journal_id=NULL
   WHERE id='50000000-0000-4000-8000-000000000001'$$,
 '%Cannot replace or remove posting evidence%');

-- Name corrections, deactivation and a valid end date remain available.
UPDATE public.tax_codes SET name='Renamed VAT', is_active=false
 WHERE id='30000000-0000-4000-8000-000000000001';
UPDATE public.tax_rates SET name='Historical VAT', is_active=false, effective_to='2026-02-15'
 WHERE id='20000000-0000-4000-8000-000000000001';

-- A void remains posted history; classification must still be protected.
UPDATE public.sales_invoices SET status='void'
 WHERE id='50000000-0000-4000-8000-000000000001';
SELECT public.assert_tax_raises(
 $$UPDATE public.tax_codes SET reporting_class='other'
   WHERE id='30000000-0000-4000-8000-000000000001'$$,
 '%posted documents%');

-- Purchase-side history is also protected (different source).
INSERT INTO public.purchase_bills(id,company_id,bill_date,status,posted_journal_id)
VALUES('50000000-0000-4000-8000-000000000002',
       '10000000-0000-4000-8000-000000000002',
       '2026-05-01','draft',NULL);
INSERT INTO public.purchase_bill_lines(id,company_id,bill_id,tax_code_id)
VALUES('60000000-0000-4000-8000-000000000002',
       '10000000-0000-4000-8000-000000000002',
       '50000000-0000-4000-8000-000000000002',
       '30000000-0000-4000-8000-000000000002');
UPDATE public.purchase_bills SET status='paid',
 posted_journal_id='70000000-0000-4000-8000-000000000002'
 WHERE id='50000000-0000-4000-8000-000000000002';
SELECT public.assert_tax_raises(
 $$UPDATE public.purchase_bill_lines SET tax_code_id=NULL
   WHERE id='60000000-0000-4000-8000-000000000002'$$,
 '%Posted tax source lines are immutable%');
SELECT public.assert_tax_raises(
 $$UPDATE public.tax_codes SET is_recoverable=false
   WHERE id='30000000-0000-4000-8000-000000000002'$$,
 '%posted documents%');
SELECT public.assert_tax_raises(
 $$UPDATE public.tax_rates SET rate_bps=1900
   WHERE id='20000000-0000-4000-8000-000000000002'$$,
 '%posted documents%');
RESET ROLE;

DO $$
BEGIN
  IF has_function_privilege(
    'authenticated', 'public.tax_code_has_posted_history(uuid,uuid)', 'EXECUTE'
  ) OR has_function_privilege(
    'anon', 'public.tax_rate_last_posted_date(uuid,uuid)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Internal tax history functions were exposed to clients';
  END IF;
  IF (SELECT rate_bps FROM public.tax_rates
    WHERE id='20000000-0000-4000-8000-000000000001')<>2100 THEN
    RAISE EXCEPTION 'Historical rate was mutated';
  END IF;
  IF (SELECT treatment FROM public.tax_codes
    WHERE id='30000000-0000-4000-8000-000000000001')<>'reduced' THEN
    RAISE EXCEPTION 'Historical code treatment was mutated';
  END IF;
END $$;
