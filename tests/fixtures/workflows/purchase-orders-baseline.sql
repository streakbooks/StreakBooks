-- Isolated fixture additions to the shared workflow baseline. These reproduce the
-- existing PO/bill columns, cascade actions and tenant policies used by this suite;
-- they do not stand in for applying the full production migration history.
INSERT INTO auth.users VALUES('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
INSERT INTO public.companies(id,name,base_currency,timezone) VALUES('10000000-0000-4000-8000-000000000001','Purchase fixture A','GBP','UTC'),('10000000-0000-4000-8000-000000000002','Purchase fixture B','GBP','UTC');
INSERT INTO public.test_permissions SELECT '10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',unnest(ARRAY['purchases.draft','purchases.view']);
INSERT INTO public.test_permissions SELECT '10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002',unnest(ARRAY['purchases.draft','purchases.view','purchases.authorise']);
INSERT INTO public.accounts(id,company_id,code,account_type) VALUES('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','6000','expense'),('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','6000','expense');
INSERT INTO public.contacts(id,company_id,name,kind) VALUES('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Fixture supplier','supplier'),('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Customer only','customer'),('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','Other tenant supplier','supplier');
ALTER TYPE public.purchase_doc_status ADD VALUE IF NOT EXISTS 'awaiting_approval';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'purchase_bill';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'payroll';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'expense';
ALTER TABLE public.accounts ADD COLUMN system_key text;
ALTER TABLE public.company_tax_settings ADD COLUMN input_tax_account_id uuid;
CREATE TABLE public.exchange_rates(company_id uuid,from_currency char(3),to_currency char(3),rate_date date,rate numeric,voided_at timestamptz);
CREATE TABLE public.expense_claims(id uuid,company_id uuid);
CREATE TABLE public.expense_cash_advances(id uuid,company_id uuid);
CREATE TABLE public.expense_petty_cash_floats(id uuid,company_id uuid);
INSERT INTO public.currency_decimals VALUES('USD',2);
INSERT INTO public.accounts(id,company_id,code,account_type,system_key) VALUES
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','2000','liability','ap'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','1200','asset','input_tax');
INSERT INTO public.company_tax_settings(company_id,prices_include_tax,input_tax_account_id) VALUES('10000000-0000-4000-8000-000000000001',false,'20000000-0000-4000-8000-000000000003');
INSERT INTO public.accounting_periods(company_id,start_date,end_date,status) VALUES('10000000-0000-4000-8000-000000000001','2026-11-01','2026-11-30','open');
ALTER TABLE public.purchase_bills
  ADD COLUMN supplier_invoice_number text,
  ADD COLUMN fx_rate_to_base numeric,
  ADD COLUMN posted_journal_id uuid,
  ADD COLUMN void_journal_id uuid,
  ADD COLUMN void_date date,
  ADD COLUMN void_reason text,
  ADD COLUMN amount_paid_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN amount_credited_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN authorised_at timestamptz,
  ADD COLUMN authorised_by uuid,
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.purchase_bill_lines DROP CONSTRAINT purchase_bill_lines_bill_id_fkey;
ALTER TABLE public.purchase_bill_lines ADD FOREIGN KEY (bill_id) REFERENCES public.purchase_bills(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_orders DROP CONSTRAINT purchase_orders_billed_bill_id_fkey;
ALTER TABLE public.purchase_orders ADD FOREIGN KEY (billed_bill_id) REFERENCES public.purchase_bills(id) ON DELETE SET NULL;
CREATE TABLE public.document_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL,
  entity_type text NOT NULL, entity_id uuid NOT NULL, file_name text
);
CREATE UNIQUE INDEX purchase_bills_supplier_invoice_uidx
  ON public.purchase_bills(company_id,contact_id,lower(supplier_invoice_number))
  WHERE supplier_invoice_number IS NOT NULL AND status <> 'void';
ALTER TABLE public.purchase_bills ADD CONSTRAINT purchase_bills_totals CHECK(total_minor=subtotal_minor+tax_minor);
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_bill_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY po_fixture_read ON public.purchase_orders FOR SELECT TO authenticated USING(public.has_company_permission(company_id,'purchases.view'));
CREATE POLICY pol_fixture_read ON public.purchase_order_lines FOR SELECT TO authenticated USING(public.has_company_permission(company_id,'purchases.view'));
CREATE POLICY bills_fixture_read ON public.purchase_bills FOR SELECT TO authenticated USING(public.has_company_permission(company_id,'purchases.view'));
CREATE POLICY bill_lines_fixture_read ON public.purchase_bill_lines FOR SELECT TO authenticated USING(public.has_company_permission(company_id,'purchases.view'));
CREATE POLICY bills_fixture_write ON public.purchase_bills FOR ALL TO authenticated USING(public.has_company_permission(company_id,'purchases.draft')) WITH CHECK(public.has_company_permission(company_id,'purchases.draft'));
CREATE POLICY bill_lines_fixture_write ON public.purchase_bill_lines FOR ALL TO authenticated USING(public.has_company_permission(company_id,'purchases.draft')) WITH CHECK(public.has_company_permission(company_id,'purchases.draft'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_bills, public.purchase_bill_lines TO authenticated;
GRANT SELECT ON public.document_attachments TO authenticated;
INSERT INTO auth.users VALUES('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000004');
INSERT INTO public.test_permissions SELECT '10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003',unnest(ARRAY['purchases.view','purchases.draft','purchases.authorise']);
INSERT INTO public.test_permissions VALUES('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','purchases.authorise');
INSERT INTO public.test_permissions SELECT '10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',unnest(ARRAY['accounting.post','demo.reset']);
INSERT INTO public.test_permissions VALUES('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','accounting.post');
INSERT INTO public.test_permissions VALUES('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000004','purchases.view');
CREATE TABLE public.po_test_results (label text PRIMARY KEY);
CREATE FUNCTION public.po_test_assert(_condition boolean, _label text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF _condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',_label; END IF;
 INSERT INTO public.po_test_results VALUES(_label);
END $$;
CREATE FUNCTION public.po_test_error(_sql text, _like text, _label text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
 BEGIN
  EXECUTE _sql;
  RAISE EXCEPTION 'TEST expected failure: %',_sql;
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'TEST expected failure:%' OR SQLERRM NOT ILIKE _like THEN RAISE; END IF;
 END;
 PERFORM public.po_test_assert(true,_label);
END $$;
GRANT SELECT ON public.po_test_results TO authenticated;
CREATE TABLE public.po_test_context (key text PRIMARY KEY,value uuid NOT NULL);
GRANT SELECT,INSERT ON public.po_test_context TO authenticated;
CREATE FUNCTION public.po_test_open_order(_request uuid,_quantity numeric,_description text DEFAULT 'Widgets') RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE o jsonb; c uuid:='10000000-0000-4000-8000-000000000001'; line_id uuid;
BEGIN
 PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',true);
 o:=public.save_purchase_order_atomic(c,jsonb_build_object('requestId',_request,'contactId','30000000-0000-4000-8000-000000000001','orderDate','2026-11-18','currencyCode','GBP','lines',jsonb_build_array(jsonb_build_object('description',_description,'accountId','20000000-0000-4000-8000-000000000001','quantity',_quantity,'unitPriceMinor',100,'discountMinor',1,'taxRateBps',2000))));
 o:=public.manage_purchase_order(c,(o->>'id')::uuid,(o->>'version')::bigint,'submit');
 PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003"}',true);
 o:=public.manage_purchase_order(c,(o->>'id')::uuid,(o->>'version')::bigint,'approve');
 PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',true);
 o:=public.manage_purchase_order(c,(o->>'id')::uuid,(o->>'version')::bigint,'send');
 SELECT id INTO line_id FROM public.purchase_order_lines WHERE order_id=(o->>'id')::uuid;
 RETURN o||jsonb_build_object('lineId',line_id);
END $$;

-- Fixture contract for the current legacy reset's PO-related dependency purge.
-- Other modules are intentionally not reproduced; the new wrapper must preserve
-- the real deployed helper rather than replace it with this isolated fixture.
CREATE OR REPLACE FUNCTION public.reset_demo_company(_company_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 DELETE FROM public.purchase_bill_lines WHERE company_id=_company_id;
 DELETE FROM public.purchase_bills WHERE company_id=_company_id;
 DELETE FROM public.purchase_order_lines WHERE company_id=_company_id;
 DELETE FROM public.purchase_orders WHERE company_id=_company_id;
 DELETE FROM public.journal_lines WHERE company_id=_company_id;
 DELETE FROM public.journals WHERE company_id=_company_id;
 DELETE FROM public.sales_invoice_lines WHERE company_id=_company_id;
 DELETE FROM public.sales_invoices WHERE company_id=_company_id;
END $$;
