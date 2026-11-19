-- Disposable Postgres fixture: production migration is applied unmodified after these master contracts.
CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE auth.mfa_factors(user_id uuid NOT NULL REFERENCES auth.users(id),status text NOT NULL);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;

CREATE TABLE public.profiles(id uuid PRIMARY KEY, full_name text, email text);
CREATE TYPE public.company_role AS ENUM('owner','admin','accountant','bookkeeper','staff','read_only');
CREATE TABLE public.role_permissions(role public.company_role,permission text,PRIMARY KEY(role,permission));
CREATE TABLE public.companies(id uuid PRIMARY KEY,base_currency text NOT NULL,timezone text NOT NULL DEFAULT 'UTC');
CREATE TABLE public.company_members(company_id uuid,user_id uuid,status text,PRIMARY KEY(company_id,user_id));
CREATE TABLE public.test_permissions(company_id uuid,user_id uuid,permission text,PRIMARY KEY(company_id,user_id,permission));
CREATE FUNCTION public.is_company_member(_company_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.company_members WHERE company_id=_company_id AND user_id=auth.uid() AND status='active') $$;
CREATE FUNCTION public.has_company_permission(_company_id uuid,_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.test_permissions WHERE company_id=_company_id AND user_id=auth.uid() AND permission=_permission) $$;
CREATE TABLE public.hr_locations(id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES public.companies(id),name text NOT NULL,code text NOT NULL,is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.accounts(id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES public.companies(id),code text,name text,account_type text,account_kind text,is_active boolean NOT NULL DEFAULT true,is_postable boolean NOT NULL DEFAULT true,currency_code text,archived_at timestamptz);
CREATE UNIQUE INDEX pos_account_tenant_identity ON public.accounts(company_id,id);
CREATE TABLE public.audit_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,actor_user_id uuid,action text,entity_type text,entity_id uuid,details jsonb);
CREATE FUNCTION public.test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('test.fail_audit',true)='on' THEN RAISE EXCEPTION 'Injected audit failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER fail_audit BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.test_audit_failure();
GRANT USAGE ON SCHEMA auth,private,public TO authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
-- Master tables have no direct cashier access in this fixture; guarded commands must own their reads.
INSERT INTO auth.users VALUES ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),('10000000-0000-4000-8000-000000000003'),('10000000-0000-4000-8000-000000000004');
INSERT INTO public.companies(id,base_currency) VALUES ('20000000-0000-4000-8000-000000000001','USD'),('20000000-0000-4000-8000-000000000002','GBP');
INSERT INTO public.company_members VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','active'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','active'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','active'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','active');
INSERT INTO public.test_permissions SELECT '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',p FROM unnest(ARRAY['pos.view','pos.settings.manage','pos.register.open','pos.register.close','pos.cash.count','pos.audit.view','members.view','pos.sale.create','pos.cash.adjust','pos.refund.create']) p;
INSERT INTO public.test_permissions SELECT '20000000-0000-4000-8000-000000000001', u::uuid,p FROM unnest(ARRAY['10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003']) u CROSS JOIN unnest(ARRAY['pos.view','pos.register.open','pos.register.close','pos.cash.count']) p;
INSERT INTO public.test_permissions SELECT '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',p FROM unnest(ARRAY['pos.sale.create','pos.refund.create','pos.cash.adjust']) p;
INSERT INTO public.hr_locations(id,company_id,code,name) VALUES
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','ONE','Store One'),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','TWO','Store Two');
INSERT INTO public.accounts(id,company_id,code,name,account_type,account_kind) VALUES
 ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','1000','Till','asset','current_asset'),
 ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','1000','Foreign till','asset','current_asset'),
 ('40000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','4000','Revenue','income','revenue'),
 ('40000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','2100','Output tax','liability','current_liability');
DO $$ BEGIN CREATE TYPE public.product_kind AS ENUM ('service','product','non_inventory','bundle'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE public.products(
 id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES public.companies(id),kind public.product_kind NOT NULL DEFAULT 'service',
 code text,name text NOT NULL,sales_price_minor bigint NOT NULL DEFAULT 0,sales_tax_rate_bps integer NOT NULL DEFAULT 0,
 income_account_id uuid,is_active boolean NOT NULL DEFAULT true,archived_at timestamptz);
CREATE UNIQUE INDEX products_tenant_identity ON public.products(company_id,id);
CREATE TABLE public.company_tax_settings(company_id uuid PRIMARY KEY REFERENCES public.companies(id),prices_include_tax boolean NOT NULL DEFAULT false,output_tax_account_id uuid);
CREATE TYPE public.period_status AS ENUM('open','locked','closed');
CREATE TYPE public.journal_source_type AS ENUM('manual','other','reversal','expense','payroll','pos_sale','pos_refund');
CREATE TABLE public.currency_decimals(code char(3) PRIMARY KEY,decimals integer NOT NULL);
INSERT INTO public.currency_decimals VALUES('USD',2),('GBP',2);
CREATE TABLE public.accounting_periods(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.companies(id),start_date date,end_date date,status public.period_status NOT NULL DEFAULT 'open');
INSERT INTO public.accounting_periods(company_id,start_date,end_date,status) VALUES('20000000-0000-4000-8000-000000000001','2020-01-01','2099-12-31','open');
-- The shared posting procedure resolves expense-source branches even for POS journals.
-- These tables stay empty because this suite only creates POS source documents.
CREATE TABLE public.expense_claims(id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES public.companies(id));
CREATE TABLE public.expense_cash_advances(id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES public.companies(id));
CREATE TABLE public.expense_petty_cash_floats(id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES public.companies(id));
CREATE SEQUENCE public.test_journal_number;
CREATE FUNCTION public.next_journal_number(_company uuid) RETURNS bigint LANGUAGE sql AS $$ SELECT nextval('public.test_journal_number') $$;
CREATE FUNCTION public.assert_journal_date_unlocked(_company uuid,_d date) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END; $$;
CREATE TABLE public.journals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL, journal_number bigint,journal_date date,period_id uuid,status text,source_type public.journal_source_type,source_id uuid,idempotency_key text,memo text,currency_code char(3),fx_rate_to_base numeric,reverses_journal_id uuid,created_by uuid,posted_at timestamptz,posted_by uuid,reversed_by_journal_id uuid,updated_at timestamptz,UNIQUE(company_id,idempotency_key));
CREATE TABLE public.journal_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),journal_id uuid NOT NULL REFERENCES public.journals(id),company_id uuid NOT NULL,line_no integer,account_id uuid,description text,debit_minor bigint,credit_minor bigint);
CREATE OR REPLACE FUNCTION public.ops_output_tax_account(_company_id uuid) RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT output_tax_account_id FROM public.company_tax_settings WHERE company_id=_company_id AND output_tax_account_id IS NOT NULL
$$;
INSERT INTO public.company_tax_settings(company_id,prices_include_tax,output_tax_account_id) VALUES('20000000-0000-4000-8000-000000000001',false,'40000000-0000-4000-8000-000000000004');
INSERT INTO public.products(id,company_id,kind,code,name,sales_price_minor,sales_tax_rate_bps,income_account_id) VALUES
 ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','service','SKU-1','Consulting hour',10000,1000,'40000000-0000-4000-8000-000000000003');
CREATE FUNCTION public.test_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
CREATE FUNCTION public.test_raises(statement text,pattern text,label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE message text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT; END;
 IF message IS NULL OR message !~* pattern THEN RAISE EXCEPTION 'FAIL: %; got %',label,message; END IF;
 RAISE NOTICE 'PASS: %',label;
END $$;
