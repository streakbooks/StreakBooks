-- Test-only DDL matching the existing production legacy settings tables.
ALTER TABLE public.companies
  ADD COLUMN locale text NOT NULL DEFAULT 'en-GB',
  ADD COLUMN date_format text NOT NULL DEFAULT 'DD/MM/YYYY',
  ADD COLUMN invoice_footer text NOT NULL DEFAULT '',
  ADD COLUMN document_theme_color text NOT NULL DEFAULT '#0F766E';

CREATE TABLE public.company_branding(
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  trading_name text,
  letterhead_line text,
  invoice_email text,
  invoice_phone text,
  logo_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.company_branding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read branding" ON public.company_branding
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "Settings editors manage branding" ON public.company_branding
  FOR ALL TO authenticated USING (public.has_company_permission(company_id,'company.settings.edit'))
  WITH CHECK (public.has_company_permission(company_id,'company.settings.edit'));
GRANT SELECT,INSERT,UPDATE ON public.company_branding TO authenticated;
GRANT UPDATE ON public.companies TO authenticated;

ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read sequences" ON public.document_sequences
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "Settings editors manage sequences" ON public.document_sequences
  FOR ALL TO authenticated USING (public.has_company_permission(company_id,'company.settings.edit'))
  WITH CHECK (public.has_company_permission(company_id,'company.settings.edit'));
GRANT SELECT, INSERT, UPDATE ON public.document_sequences TO authenticated;
