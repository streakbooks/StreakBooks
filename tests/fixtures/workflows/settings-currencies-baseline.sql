-- Minimal company-currency grants and policies for the isolated workflow database.
-- The real DDL is defined in 20261019200000_cross_cutting_settings_fx_demo.sql.
CREATE TABLE public.company_currencies (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  currency_code char(3) NOT NULL,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, currency_code)
);
ALTER TABLE public.company_currencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read currencies" ON public.company_currencies
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "Settings editors manage currencies" ON public.company_currencies
  FOR ALL TO authenticated
  USING (public.has_company_permission(company_id, 'company.settings.edit'))
  WITH CHECK (public.has_company_permission(company_id, 'company.settings.edit'));
GRANT SELECT, INSERT, DELETE ON public.company_currencies TO authenticated;
