-- Minimal test-only shape of the Settings Centre config and audit tables.
CREATE TABLE public.organisation_config (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category text NOT NULL,
  document jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (company_id, category),
  CONSTRAINT organisation_config_category_chk CHECK (char_length(category) BETWEEN 1 AND 64)
);
ALTER TABLE public.organisation_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read organisation config" ON public.organisation_config
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "No direct config writes" ON public.organisation_config
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "No direct config updates" ON public.organisation_config
  FOR UPDATE TO authenticated USING (false);
CREATE POLICY "No direct config deletes" ON public.organisation_config
  FOR DELETE TO authenticated USING (false);
GRANT SELECT ON public.organisation_config TO authenticated;

CREATE TABLE public.settings_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category text NOT NULL,
  setting_key text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  reason text,
  request_id text,
  source text NOT NULL DEFAULT 'ui',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.settings_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Audit viewers read settings log" ON public.settings_change_log
  FOR SELECT TO authenticated USING (public.has_company_permission(company_id, 'audit.view'));
CREATE POLICY "No direct settings log writes" ON public.settings_change_log
  FOR INSERT TO authenticated WITH CHECK (false);
GRANT SELECT ON public.settings_change_log TO authenticated;

INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000001'),
                                 ('00000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.companies(id, name, base_currency, timezone) VALUES
  ('10000000-0000-4000-8000-000000000031', 'Settings RPC Fixture', 'GBP', 'UTC'),
  ('10000000-0000-4000-8000-000000000032', 'Settings RPC Other Tenant', 'GBP', 'UTC');
INSERT INTO public.test_permissions(company_id, user_id, permission) VALUES
  ('10000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000001', 'company.settings.edit'),
  ('10000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000001', 'audit.view'),
  ('10000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000002', 'company.view'),
  ('10000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000002', 'company.settings.edit');
