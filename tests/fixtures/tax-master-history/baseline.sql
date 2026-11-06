-- Isolated PostgreSQL schema for the tax master posted-history trigger.
-- These minimal tables model only columns read by the migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
END $$;

CREATE TABLE public.companies (id uuid PRIMARY KEY);
CREATE TABLE public.accounts (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id)
);
CREATE TABLE public.tax_rates (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text NOT NULL,
  code text,
  rate_bps integer NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  treatment text NOT NULL DEFAULT 'standard',
  applies_to text NOT NULL DEFAULT 'both',
  jurisdiction_code text,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.tax_codes (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  code text NOT NULL,
  name text NOT NULL,
  tax_rate_id uuid NOT NULL REFERENCES public.tax_rates(id),
  tax_account_id uuid REFERENCES public.accounts(id),
  applies_to text NOT NULL DEFAULT 'both',
  is_recoverable boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  treatment text NOT NULL DEFAULT 'standard',
  reporting_class text
);
CREATE TABLE public.sales_invoices (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  invoice_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  posted_journal_id uuid
);
CREATE TABLE public.sales_invoice_lines (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  invoice_id uuid NOT NULL REFERENCES public.sales_invoices(id),
  tax_code_id uuid REFERENCES public.tax_codes(id)
);
CREATE TABLE public.purchase_bills (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  bill_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  posted_journal_id uuid
);
CREATE TABLE public.purchase_bill_lines (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  bill_id uuid NOT NULL REFERENCES public.purchase_bills(id),
  tax_code_id uuid REFERENCES public.tax_codes(id)
);

INSERT INTO public.companies(id) VALUES
 ('10000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002');
INSERT INTO public.accounts(id,company_id) VALUES
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
INSERT INTO public.tax_rates(id,company_id,name,rate_bps,effective_from) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','A VAT',2000,'2026-01-01'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','B VAT',2000,'2026-01-01');
INSERT INTO public.tax_codes(id,company_id,code,name,tax_rate_id,tax_account_id) VALUES
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','VAT-A','VAT A','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','VAT-B','VAT B','20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002');
INSERT INTO public.sales_invoices(id,company_id,invoice_date,status) VALUES
 ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','2026-02-15','draft');
INSERT INTO public.sales_invoice_lines(id,company_id,invoice_id,tax_code_id) VALUES
 ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
