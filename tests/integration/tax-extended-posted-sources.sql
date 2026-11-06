-- Execute after baseline, tax master guard migration and tax-master-posted-history.sql.
-- Separate fixtures cover posted credit-note tax rows and direct-expense amounts.
INSERT INTO public.sales_credit_notes (
 id, company_id, credit_date, subtotal_minor, tax_minor, total_minor
) VALUES (
 '50000000-0000-4000-8000-000000000008',
 '10000000-0000-4000-8000-000000000001',
 '2026-02-01', 1000, 200, 1200
);
INSERT INTO public.sales_credit_note_lines (
 id, company_id, credit_note_id, net_minor, tax_minor
) VALUES (
 '60000000-0000-4000-8000-000000000008',
 '10000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000008', 1000, 200
);

INSERT INTO public.purchase_credit_notes (
 id, company_id, credit_date, subtotal_minor, tax_minor, total_minor
) VALUES (
 '50000000-0000-4000-8000-000000000009',
 '10000000-0000-4000-8000-000000000001',
 '2026-02-02', 500, 100, 600
);
INSERT INTO public.purchase_credit_note_lines (
 id, company_id, credit_note_id, net_minor, tax_minor
) VALUES (
 '60000000-0000-4000-8000-000000000009',
 '10000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000009', 500, 100
);

INSERT INTO public.purchase_expenses (
 id, company_id, expense_date, expense_account_id, payment_account_id,
 net_minor, tax_minor, total_minor
) VALUES (
 '50000000-0000-4000-8000-000000000010',
 '10000000-0000-4000-8000-000000000001',
 '2026-02-03',
 '40000000-0000-4000-8000-000000000001',
 '40000000-0000-4000-8000-000000000001',
 250, 50, 300
);

SET ROLE authenticated;

-- Drafts remain editable before posting, including their tax amounts.
UPDATE public.sales_credit_note_lines SET tax_minor=210
 WHERE id='60000000-0000-4000-8000-000000000008';
UPDATE public.purchase_credit_note_lines SET tax_minor=110
 WHERE id='60000000-0000-4000-8000-000000000009';
UPDATE public.purchase_expenses SET net_minor=260, total_minor=310
 WHERE id='50000000-0000-4000-8000-000000000010';

-- Foreign-organisation lines may never be attached to an unrelated parent.
SELECT public.assert_tax_raises(
 $$INSERT INTO public.sales_credit_note_lines
   (id,company_id,credit_note_id,net_minor,tax_minor)
   VALUES ('60000000-0000-4000-8000-000000000018',
   '10000000-0000-4000-8000-000000000002',
   '50000000-0000-4000-8000-000000000008',100,20)$$,
 '%source organisation%');
SELECT public.assert_tax_raises(
 $$INSERT INTO public.purchase_credit_note_lines
   (id,company_id,credit_note_id,net_minor,tax_minor)
   VALUES ('60000000-0000-4000-8000-000000000019',
   '10000000-0000-4000-8000-000000000002',
   '50000000-0000-4000-8000-000000000009',100,20)$$,
 '%source organisation%');

UPDATE public.sales_credit_notes SET status='authorised',
 posted_journal_id='70000000-0000-4000-8000-000000000008'
 WHERE id='50000000-0000-4000-8000-000000000008';
UPDATE public.purchase_credit_notes SET status='authorised',
 posted_journal_id='70000000-0000-4000-8000-000000000009'
 WHERE id='50000000-0000-4000-8000-000000000009';
UPDATE public.purchase_expenses SET status='paid',
 posted_journal_id='70000000-0000-4000-8000-000000000010'
 WHERE id='50000000-0000-4000-8000-000000000010';

-- Posted sales credit note cannot be silently changed after posting.
SELECT public.assert_tax_raises(
 $$UPDATE public.sales_credit_note_lines SET tax_minor=100
   WHERE id='60000000-0000-4000-8000-000000000008'$$,
 '%Posted credit-note tax lines are immutable%');
SELECT public.assert_tax_raises(
 $$DELETE FROM public.sales_credit_note_lines
   WHERE id='60000000-0000-4000-8000-000000000008'$$,
 '%Posted credit-note tax lines are immutable%');
SELECT public.assert_tax_raises(
 $$INSERT INTO public.sales_credit_note_lines
   (id,company_id,credit_note_id,net_minor,tax_minor)
   VALUES ('60000000-0000-4000-8000-000000000028',
   '10000000-0000-4000-8000-000000000001',
   '50000000-0000-4000-8000-000000000008',100,20)$$,
 '%Posted credit-note tax lines are immutable%');
SELECT public.assert_tax_raises(
 $$UPDATE public.sales_credit_notes
   SET subtotal_minor=900, total_minor=1100
   WHERE id='50000000-0000-4000-8000-000000000008'$$,
 '%Posted credit-note tax amounts and dates are immutable%');
SELECT public.assert_tax_raises(
 $$UPDATE public.sales_credit_notes SET posted_journal_id=NULL
   WHERE id='50000000-0000-4000-8000-000000000008'$$,
 '%Cannot replace or remove posted tax source journal evidence%');

-- Equivalent historical protection for supplier credit notes.
SELECT public.assert_tax_raises(
 $$UPDATE public.purchase_credit_note_lines SET tax_minor=10
   WHERE id='60000000-0000-4000-8000-000000000009'$$,
 '%Posted credit-note tax lines are immutable%');
SELECT public.assert_tax_raises(
 $$DELETE FROM public.purchase_credit_note_lines
   WHERE id='60000000-0000-4000-8000-000000000009'$$,
 '%Posted credit-note tax lines are immutable%');
SELECT public.assert_tax_raises(
 $$UPDATE public.purchase_credit_notes SET credit_date='2026-02-10'
   WHERE id='50000000-0000-4000-8000-000000000009'$$,
 '%Posted credit-note tax amounts and dates are immutable%');
SELECT public.assert_tax_raises(
 $$UPDATE public.purchase_credit_notes SET posted_journal_id=NULL
   WHERE id='50000000-0000-4000-8000-000000000009'$$,
 '%Cannot replace or remove posted tax source journal evidence%');

-- Direct expenses are header-only tax sources; protect their tax amount,
-- date, currency, expense and payment GL account IDs after posting.
SELECT public.assert_tax_raises(
 $$UPDATE public.purchase_expenses SET tax_minor=100, total_minor=360
   WHERE id='50000000-0000-4000-8000-000000000010'$$,
 '%Posted tax source amounts and accounts are immutable%');
SELECT public.assert_tax_raises(
 $$UPDATE public.purchase_expenses SET expense_date='2026-02-10'
   WHERE id='50000000-0000-4000-8000-000000000010'$$,
 '%Posted tax source amounts and accounts are immutable%');
SELECT public.assert_tax_raises(
 $$UPDATE public.purchase_expenses SET posted_journal_id=NULL
   WHERE id='50000000-0000-4000-8000-000000000010'$$,
 '%Cannot replace or remove posted tax source journal evidence%');

-- A posted header cannot be deleted by a client or a privileged posting
-- workflow even if the caller can otherwise DELETE the table.
SELECT public.assert_tax_raises(
 $DELETE FROM public.sales_credit_notes
   WHERE id='50000000-0000-4000-8000-000000000008'$,
 '%Posted tax sources cannot be deleted%');
SELECT public.assert_tax_raises(
 $DELETE FROM public.purchase_credit_notes
   WHERE id='50000000-0000-4000-8000-000000000009'$,
 '%Posted tax sources cannot be deleted%');
SELECT public.assert_tax_raises(
 $DELETE FROM public.purchase_expenses
   WHERE id='50000000-0000-4000-8000-000000000010'$,
 '%Posted tax sources cannot be deleted%');

-- Deleting unposted draft credit notes is still supported, including their
-- ON DELETE CASCADE children. The posted-header guard must not block drafts.
INSERT INTO public.sales_credit_notes(id,company_id,credit_date)
VALUES ('50000000-0000-4000-8000-000000000018',
        '10000000-0000-4000-8000-000000000001','2026-02-08');
INSERT INTO public.sales_credit_note_lines(id,company_id,credit_note_id)
VALUES ('60000000-0000-4000-8000-000000000018',
        '10000000-0000-4000-8000-000000000001',
        '50000000-0000-4000-8000-000000000018');
DELETE FROM public.sales_credit_notes
WHERE id='50000000-0000-4000-8000-000000000018';

INSERT INTO public.purchase_credit_notes(id,company_id,credit_date)
VALUES ('50000000-0000-4000-8000-000000000019',
        '10000000-0000-4000-8000-000000000001','2026-02-09');
INSERT INTO public.purchase_credit_note_lines(id,company_id,credit_note_id)
VALUES ('60000000-0000-4000-8000-000000000019',
        '10000000-0000-4000-8000-000000000001',
        '50000000-0000-4000-8000-000000000019');
DELETE FROM public.purchase_credit_notes
WHERE id='50000000-0000-4000-8000-000000000019';

-- Legitimate lifecycle transitions and allocations remain possible, even
-- after historical journal posting (do not block refunds or void workflows).
UPDATE public.sales_credit_notes SET status='void', amount_allocated_minor=50
 WHERE id='50000000-0000-4000-8000-000000000008';
UPDATE public.purchase_credit_notes SET status='void', amount_allocated_minor=20
 WHERE id='50000000-0000-4000-8000-000000000009';
UPDATE public.purchase_expenses SET status='void'
 WHERE id='50000000-0000-4000-8000-000000000010';

RESET ROLE;

DO $$
BEGIN
  IF (SELECT net_minor FROM public.purchase_expenses
      WHERE id='50000000-0000-4000-8000-000000000010')<>260 THEN
    RAISE EXCEPTION 'Failed expense update changed posted tax amount';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sales_credit_note_lines
      WHERE id='60000000-0000-4000-8000-000000000018')
    OR EXISTS (SELECT 1 FROM public.purchase_credit_note_lines
      WHERE id='60000000-0000-4000-8000-000000000019') THEN
    RAISE EXCEPTION 'Draft credit-note cascade removal failed';
  END IF;
  IF (SELECT tax_minor FROM public.sales_credit_note_lines
      WHERE id='60000000-0000-4000-8000-000000000008')<>210 THEN
    RAISE EXCEPTION 'Posted credit note line was altered';
  END IF;
END $$;
