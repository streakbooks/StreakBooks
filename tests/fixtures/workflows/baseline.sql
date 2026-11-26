CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.companies(id uuid PRIMARY KEY,name text,base_currency char(3) NOT NULL DEFAULT 'GBP',timezone text NOT NULL DEFAULT 'UTC');
CREATE TABLE public.test_permissions(company_id uuid,user_id uuid,permission text);
CREATE FUNCTION public.has_company_permission(_company_id uuid,_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.test_permissions WHERE company_id=_company_id AND user_id=auth.uid() AND permission=_permission) $$;
CREATE FUNCTION public.is_company_member(_company_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.test_permissions WHERE company_id=_company_id AND user_id=auth.uid()) $$;
CREATE FUNCTION public.is_company_advisor(_company_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION private.platform_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN coalesce(NEW,OLD); END $$;
CREATE TABLE public.accounts(id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES public.companies(id),code text,account_type text,is_active boolean NOT NULL DEFAULT true,is_postable boolean NOT NULL DEFAULT true,archived_at timestamptz);
CREATE TABLE public.contacts(id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES public.companies(id),name text,kind text,is_active boolean DEFAULT true,payment_terms_days integer DEFAULT 14);
CREATE TABLE public.company_tax_settings(company_id uuid PRIMARY KEY,prices_include_tax boolean);
CREATE TABLE public.company_workflow_settings(
 company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
 sales_default_payment_terms_days integer NOT NULL DEFAULT 30,
 sales_default_notes text,
 sales_payment_instructions text,
 sales_quote_validity_days integer NOT NULL DEFAULT 30,
 sales_prices_include_tax boolean NOT NULL DEFAULT false,
 purchases_default_payment_terms_days integer NOT NULL DEFAULT 30,
 purchases_default_notes text,
 purchases_require_po boolean NOT NULL DEFAULT false,
 banking_csv_date_format text NOT NULL DEFAULT 'YYYY-MM-DD',
 accounting_require_journal_memo boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.company_workflow_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY workflow_settings_select ON public.company_workflow_settings FOR SELECT TO authenticated
 USING(public.is_company_member(company_id));
CREATE POLICY workflow_settings_write ON public.company_workflow_settings FOR ALL TO authenticated
 USING(public.has_company_permission(company_id,'company.settings.edit') OR public.has_company_permission(company_id,'accounts.manage'))
 WITH CHECK(public.has_company_permission(company_id,'company.settings.edit') OR public.has_company_permission(company_id,'accounts.manage'));
GRANT SELECT,INSERT,UPDATE ON public.company_workflow_settings TO authenticated;
CREATE TABLE public.document_sequences(company_id uuid,document_type text,prefix text,next_number bigint,padding integer,UNIQUE(company_id,document_type));
CREATE TABLE public.audit_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,actor_user_id uuid,action text,entity_type text,entity_id uuid,details jsonb);
CREATE FUNCTION public.test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('test.fail_audit',true)='on' THEN RAISE EXCEPTION 'Injected audit failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER test_audit_failure BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.test_audit_failure();
CREATE TYPE public.po_status AS ENUM('draft','sent','partially_received','billed','cancelled');
CREATE TYPE public.purchase_doc_status AS ENUM('draft','authorised','partly_paid','paid','void');
CREATE TABLE public.purchase_bills(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,contact_id uuid NOT NULL,bill_number text,bill_date date NOT NULL,due_date date NOT NULL,payment_terms_days integer,tax_calculation text,currency_code char(3),memo text,status public.purchase_doc_status,subtotal_minor bigint,tax_minor bigint,total_minor bigint,purchase_order_id uuid,created_by uuid NOT NULL);
CREATE TABLE public.purchase_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,contact_id uuid NOT NULL,order_number text,order_date date NOT NULL,currency_code char(3),memo text,status public.po_status,subtotal_minor bigint,tax_minor bigint,total_minor bigint,created_by uuid NOT NULL,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),billed_bill_id uuid REFERENCES public.purchase_bills(id));
CREATE TABLE public.purchase_order_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,order_id uuid NOT NULL REFERENCES public.purchase_orders(id),line_no integer,description text,account_id uuid,quantity numeric(18,6),unit_price_minor bigint,tax_rate_bps integer,net_minor bigint,tax_minor bigint,UNIQUE(order_id,line_no));
CREATE TABLE public.purchase_bill_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,bill_id uuid NOT NULL REFERENCES public.purchase_bills(id),line_no integer,description text,account_id uuid,quantity numeric(18,6),unit_price_minor bigint,discount_minor bigint,tax_rate_bps integer,net_minor bigint,tax_minor bigint);
CREATE TABLE public.sales_invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,contact_id uuid NOT NULL,invoice_number text,invoice_date date,due_date date,currency_code char(3),fx_rate_to_base numeric,status text,subtotal_minor bigint,tax_minor bigint,total_minor bigint,memo text,created_by uuid);
CREATE TABLE public.sales_invoice_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,invoice_id uuid NOT NULL REFERENCES public.sales_invoices(id),line_order integer,description text,account_id uuid,quantity numeric(18,6),unit_price_minor bigint,discount_minor bigint,tax_rate_bps integer,net_minor bigint,tax_minor bigint,gross_minor bigint);
CREATE TYPE public.period_status AS ENUM('open','locked','closed');
CREATE TYPE public.journal_source_type AS ENUM('manual','other','reversal');
CREATE TABLE public.currency_decimals(code char(3) PRIMARY KEY,decimals integer);
INSERT INTO public.currency_decimals VALUES('GBP',2);
CREATE TABLE public.accounting_periods(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,start_date date,end_date date,status public.period_status);
CREATE TABLE public.organisation_lock_policy(company_id uuid PRIMARY KEY,conversion_date date,lock_date_everyone date,lock_date_except_advisors date);
CREATE SEQUENCE public.test_journal_number;
CREATE FUNCTION public.next_journal_number(_company uuid) RETURNS bigint LANGUAGE sql AS $$ SELECT nextval('public.test_journal_number') $$;
CREATE TABLE public.journals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,journal_number bigint,journal_date date,period_id uuid,status text,source_type public.journal_source_type,source_id uuid,idempotency_key text,memo text,currency_code char(3),fx_rate_to_base numeric,reverses_journal_id uuid,created_by uuid,posted_at timestamptz,posted_by uuid,reversed_by_journal_id uuid,updated_at timestamptz,UNIQUE(company_id,idempotency_key));
CREATE TABLE public.journal_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),journal_id uuid,company_id uuid,line_no integer,account_id uuid,description text,debit_minor bigint,credit_minor bigint);
GRANT USAGE ON SCHEMA public,auth,private TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
REVOKE ALL ON public.test_permissions FROM authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated;

CREATE ROLE service_role NOLOGIN;
ALTER TABLE public.companies ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
-- The legacy reset's dependency purge is a fixture contract; the new guarded wrapper is exercised below.
CREATE FUNCTION public.reset_demo_company(_company_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN DELETE FROM public.journal_lines WHERE company_id=_company_id; DELETE FROM public.journals WHERE company_id=_company_id; DELETE FROM public.sales_invoice_lines WHERE company_id=_company_id; DELETE FROM public.sales_invoices WHERE company_id=_company_id; END $$;
