CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE FUNCTION public.has_company_permission(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT public.is_company_member($1) AND auth.uid() IS NOT NULL$$;
CREATE FUNCTION private.assert_reporting_feature(uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF NOT public.has_company_permission($1,'reports.view') THEN RAISE EXCEPTION 'Reporting access denied' USING ERRCODE='42501'; END IF;END$$;
CREATE FUNCTION private.report_access(uuid,boolean) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
CREATE FUNCTION public.record_audit_event(uuid,text,text,uuid,jsonb) RETURNS void LANGUAGE sql AS $$SELECT$$;
CREATE TABLE public.journals(id uuid PRIMARY KEY,company_id uuid,journal_date date,journal_number text,source_type text,source_id uuid,currency_code text,fx_rate_to_base numeric,reverses_journal_id uuid,status text);
CREATE TABLE public.journal_lines(id uuid PRIMARY KEY,company_id uuid,journal_id uuid,account_id uuid,debit_minor bigint,credit_minor bigint);
CREATE TABLE public.bank_accounts(id uuid PRIMARY KEY,company_id uuid,gl_account_id uuid);
CREATE TABLE public.sales_receipts(id uuid PRIMARY KEY,company_id uuid,posted_journal_id uuid,void_journal_id uuid,currency_code text,fx_rate_to_base numeric,amount_minor bigint,receipt_date date);
CREATE TABLE public.supplier_payments(LIKE sales_receipts INCLUDING ALL);
ALTER TABLE public.supplier_payments RENAME COLUMN receipt_date TO payment_date;
CREATE TABLE public.sales_receipt_allocations(id uuid PRIMARY KEY,company_id uuid,receipt_id uuid,invoice_id uuid,amount_minor bigint,reversed_on date);
CREATE TABLE public.money_documents(id uuid PRIMARY KEY,company_id uuid,kind text,posted_journal_id uuid,void_journal_id uuid,currency_code text,fx_rate_to_base numeric,total_minor bigint,document_date date);
CREATE TABLE public.sales_credit_allocations(id uuid PRIMARY KEY,company_id uuid,invoice_id uuid,credit_note_id uuid,allocated_on date,reversed_on date,amount_minor bigint);
CREATE TABLE public.purchase_credit_allocations(id uuid PRIMARY KEY,company_id uuid,bill_id uuid,credit_note_id uuid,amount_minor bigint);
CREATE FUNCTION public.capture_standard_report_facts(_company_id uuid,_from date,_to date,_report_id text,_settings jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$BEGIN
 PERFORM private.assert_reporting_feature(_company_id);
 RETURN jsonb_build_object('schemaVersion',1,'from',_from,'to',_to,'standardColumns',jsonb_build_array(jsonb_build_object('from',_from,'to',_to)));
END$$;
CREATE TABLE public.report_packs(id uuid PRIMARY KEY,company_id uuid,owner_id uuid,status text,snapshot jsonb,name text,config jsonb);
CREATE TABLE public.report_saved_views(id uuid PRIMARY KEY,company_id uuid,user_id uuid,report_id text,config jsonb,name text);
CREATE TABLE public.report_deliveries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,owner_id uuid,pack_id uuid,view_id uuid,recipients jsonb,subject text,message text,facts jsonb,definition jsonb);
GRANT USAGE ON SCHEMA auth,private TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private,auth TO authenticated;

CREATE FUNCTION public.capture_reporting_facts(uuid,date,date) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;
CREATE FUNCTION public.capture_custom_report_facts(uuid,date,date,jsonb) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;
