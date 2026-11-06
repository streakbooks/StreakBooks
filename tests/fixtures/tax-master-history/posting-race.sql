-- Dedicated untouched sources for deterministic, two-connection lock tests.
-- Execute AFTER the normal tax history integration fixture.
INSERT INTO public.tax_rates (id,company_id,name,rate_bps,effective_from)
VALUES (
 '20000000-0000-4000-8000-000000000004',
 '10000000-0000-4000-8000-000000000001',
 'Tax concurrent posting rate', 1500,'2026-01-01'
);
INSERT INTO public.tax_codes (
 id,company_id,code,name,tax_rate_id,tax_account_id
) VALUES (
 '30000000-0000-4000-8000-000000000004',
 '10000000-0000-4000-8000-000000000001',
 'TAX-RACE','Tax concurrent posting code',
 '20000000-0000-4000-8000-000000000004',
 '40000000-0000-4000-8000-000000000001'
);
INSERT INTO public.sales_invoices(id,company_id,invoice_date,status)
VALUES
 ('50000000-0000-4000-8000-000000000004',
 '10000000-0000-4000-8000-000000000001','2026-03-03','draft'),
 ('50000000-0000-4000-8000-000000000005',
 '10000000-0000-4000-8000-000000000001','2026-03-04','draft');
INSERT INTO public.sales_invoice_lines(id,company_id,invoice_id,tax_code_id)
VALUES
 ('60000000-0000-4000-8000-000000000004',
 '10000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000004',
 '30000000-0000-4000-8000-000000000004'),
 ('60000000-0000-4000-8000-000000000005',
 '10000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000005',
 '30000000-0000-4000-8000-000000000004');

-- Separate purchase-side masters: already posted invoice references must not
-- cause false positives in the purchase race assertions.
INSERT INTO public.tax_rates (id,company_id,name,rate_bps,effective_from)
VALUES ('20000000-0000-4000-8000-000000000007',
 '10000000-0000-4000-8000-000000000001',
 'Purchase concurrent posting rate', 1000,'2026-01-01');
INSERT INTO public.tax_codes (
 id,company_id,code,name,tax_rate_id,tax_account_id
) VALUES (
 '30000000-0000-4000-8000-000000000007',
 '10000000-0000-4000-8000-000000000001',
 'PURCHASE-RACE','Purchase concurrent posting code',
 '20000000-0000-4000-8000-000000000007',
 '40000000-0000-4000-8000-000000000001');
INSERT INTO public.purchase_bills (
 id,company_id,bill_date,status,posted_journal_id
) VALUES (
 '50000000-0000-4000-8000-000000000007',
 '10000000-0000-4000-8000-000000000001',
 '2026-03-07','draft',NULL
);
INSERT INTO public.purchase_bill_lines (
 id,company_id,bill_id,tax_code_id
) VALUES (
 '60000000-0000-4000-8000-000000000007',
 '10000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000007',
 '30000000-0000-4000-8000-000000000007'
);


-- Credit notes and expenses: unposted test sources with distinct identities.
INSERT INTO public.sales_credit_notes(id,company_id,credit_date,subtotal_minor,tax_minor,total_minor)
VALUES ('50000000-0000-4000-8000-000000000011',
        '10000000-0000-4000-8000-000000000001',
        '2026-04-11',400,80,480);
INSERT INTO public.sales_credit_note_lines(id,company_id,credit_note_id,net_minor,tax_minor)
VALUES ('60000000-0000-4000-8000-000000000011',
        '10000000-0000-4000-8000-000000000001',
        '50000000-0000-4000-8000-000000000011',400,80);
INSERT INTO public.purchase_credit_notes(id,company_id,credit_date,subtotal_minor,tax_minor,total_minor)
VALUES ('50000000-0000-4000-8000-000000000012',
        '10000000-0000-4000-8000-000000000001',
        '2026-04-12',300,60,360);
INSERT INTO public.purchase_credit_note_lines(id,company_id,credit_note_id,net_minor,tax_minor)
VALUES ('60000000-0000-4000-8000-000000000012',
        '10000000-0000-4000-8000-000000000001',
        '50000000-0000-4000-8000-000000000012',300,60);
INSERT INTO public.purchase_expenses(
 id,company_id,expense_date,expense_account_id,payment_account_id,
 net_minor,tax_minor,total_minor
) VALUES ('50000000-0000-4000-8000-000000000013',
 '10000000-0000-4000-8000-000000000001','2026-04-13',
 '40000000-0000-4000-8000-000000000001',
 '40000000-0000-4000-8000-000000000001',200,40,240);
