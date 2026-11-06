-- Non-inventory catalogue taxonomy and draft-only customer pricing foundations.
-- Additive; does not alter posted invoices, quotes, journals or stock valuation.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS product_categories_company_name_uidx
  ON public.product_categories(company_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS product_categories_company_active_idx
  ON public.product_categories(company_id, is_active);

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id uuid;
ALTER TABLE public.products
  ADD CONSTRAINT products_category_company_fk
  FOREIGN KEY (company_id, category_id)
  REFERENCES public.product_categories (company_id, id);

CREATE INDEX IF NOT EXISTS products_company_category_idx
  ON public.products(company_id, category_id);

CREATE TABLE IF NOT EXISTS public.product_price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS product_price_lists_company_name_uidx
  ON public.product_price_lists(company_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS product_price_lists_company_active_idx
  ON public.product_price_lists(company_id, is_active);

-- Reuse existing product IDs while enforcing the company boundary at FK level.
CREATE UNIQUE INDEX IF NOT EXISTS products_company_id_uidx
  ON public.products(company_id, id);

CREATE TABLE IF NOT EXISTS public.product_price_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  price_list_id uuid NOT NULL,
  product_id uuid NOT NULL,
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (price_list_id, product_id),
  CONSTRAINT price_list_items_list_company_fk FOREIGN KEY (company_id, price_list_id)
    REFERENCES public.product_price_lists(company_id, id) ON DELETE CASCADE,
  CONSTRAINT price_list_items_product_company_fk FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS product_price_list_items_company_idx
  ON public.product_price_list_items(company_id, price_list_id);

-- RLS is required even if exposed schema grants are changed by the platform.
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_price_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_categories_select ON public.product_categories
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY product_categories_insert ON public.product_categories
  FOR INSERT TO authenticated WITH CHECK (public.has_company_permission(company_id, 'products.manage'));
CREATE POLICY product_categories_update ON public.product_categories
  FOR UPDATE TO authenticated
  USING (public.has_company_permission(company_id, 'products.manage'))
  WITH CHECK (public.has_company_permission(company_id, 'products.manage'));

CREATE POLICY product_price_lists_select ON public.product_price_lists
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY product_price_lists_insert ON public.product_price_lists
  FOR INSERT TO authenticated WITH CHECK (public.has_company_permission(company_id, 'products.manage'));
CREATE POLICY product_price_lists_update ON public.product_price_lists
  FOR UPDATE TO authenticated
  USING (public.has_company_permission(company_id, 'products.manage'))
  WITH CHECK (public.has_company_permission(company_id, 'products.manage'));

CREATE POLICY product_price_list_items_select ON public.product_price_list_items
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY product_price_list_items_insert ON public.product_price_list_items
  FOR INSERT TO authenticated WITH CHECK (public.has_company_permission(company_id, 'products.manage'));
CREATE POLICY product_price_list_items_update ON public.product_price_list_items
  FOR UPDATE TO authenticated
  USING (public.has_company_permission(company_id, 'products.manage'))
  WITH CHECK (public.has_company_permission(company_id, 'products.manage'));
CREATE POLICY product_price_list_items_delete ON public.product_price_list_items
  FOR DELETE TO authenticated USING (public.has_company_permission(company_id, 'products.manage'));

REVOKE ALL ON public.product_categories, public.product_price_lists,
  public.product_price_list_items FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.product_categories, public.product_price_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_price_list_items TO authenticated;
