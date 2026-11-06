-- Advanced non-inventory sales price rules: quantity thresholds and date-effective prices.
-- Additive: no mutations to existing products, sales documents or ledger postings.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.product_price_list_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  price_list_id uuid NOT NULL,
  product_id uuid NOT NULL,
  min_quantity numeric(18,4) NOT NULL CHECK (min_quantity > 0),
  effective_from date NOT NULL DEFAULT DATE '1900-01-01',
  effective_to date,
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_list_rules_valid_dates CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  ),
  CONSTRAINT price_list_rules_list_company_fk
    FOREIGN KEY (company_id, price_list_id)
    REFERENCES public.product_price_lists(company_id, id) ON DELETE CASCADE,
  CONSTRAINT price_list_rules_product_company_fk
    FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE CASCADE,
  CONSTRAINT price_list_rules_unique_threshold_start
    UNIQUE (price_list_id, product_id, min_quantity, effective_from)
);

CREATE INDEX IF NOT EXISTS price_list_rules_lookup_idx
  ON public.product_price_list_rules(company_id, price_list_id, product_id, effective_from);

ALTER TABLE public.product_price_list_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_price_rules_select ON public.product_price_list_rules
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY product_price_rules_insert ON public.product_price_list_rules
  FOR INSERT TO authenticated
  WITH CHECK (public.has_company_permission(company_id, 'products.manage'));
CREATE POLICY product_price_rules_update ON public.product_price_list_rules
  FOR UPDATE TO authenticated
  USING (public.has_company_permission(company_id, 'products.manage'))
  WITH CHECK (public.has_company_permission(company_id, 'products.manage'));
CREATE POLICY product_price_rules_delete ON public.product_price_list_rules
  FOR DELETE TO authenticated USING (public.has_company_permission(company_id, 'products.manage'));

REVOKE ALL ON TABLE public.product_price_list_rules FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_price_list_rules TO authenticated;
