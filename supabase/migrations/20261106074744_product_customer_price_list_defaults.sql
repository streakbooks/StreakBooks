-- Optional one-to-one customer price-list defaults for non-inventory sales drafts.
-- Existing invoices, quotes, lines, and posted ledgers are left unchanged.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.product_customer_price_list_defaults (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL,
  price_list_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, contact_id),
  CONSTRAINT product_customer_price_default_contact_fk
    FOREIGN KEY (company_id, contact_id)
    REFERENCES public.contacts(company_id, id) ON DELETE CASCADE,
  CONSTRAINT product_customer_price_default_list_fk
    FOREIGN KEY (company_id, price_list_id)
    REFERENCES public.product_price_lists(company_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS product_customer_price_list_lookup_idx
  ON public.product_customer_price_list_defaults(company_id, price_list_id);

ALTER TABLE public.product_customer_price_list_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_customer_price_defaults_select
  ON public.product_customer_price_list_defaults
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE POLICY product_customer_price_defaults_insert
  ON public.product_customer_price_list_defaults
  FOR INSERT TO authenticated
  WITH CHECK (public.has_company_permission(company_id, 'products.manage'));

CREATE POLICY product_customer_price_defaults_update
  ON public.product_customer_price_list_defaults
  FOR UPDATE TO authenticated
  USING (public.has_company_permission(company_id, 'products.manage'))
  WITH CHECK (public.has_company_permission(company_id, 'products.manage'));

CREATE POLICY product_customer_price_defaults_delete
  ON public.product_customer_price_list_defaults
  FOR DELETE TO authenticated
  USING (public.has_company_permission(company_id, 'products.manage'));

-- Default Postgres/Supabase table grants may include TRUNCATE or TRIGGER.
REVOKE ALL ON TABLE public.product_customer_price_list_defaults FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.product_customer_price_list_defaults TO authenticated;
