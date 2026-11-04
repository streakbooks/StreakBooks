-- Minimal Feature Manager schema and function grants for isolated PostgreSQL tests.
-- The production schema comes from settings_centre_foundation; do not run this fixture on a live project.
CREATE TABLE public.organisation_features (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (company_id, feature_key)
);

CREATE TABLE public.settings_change_log (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_user_id uuid,
  category text NOT NULL,
  setting_key text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  reason text,
  source text
);

ALTER TABLE public.organisation_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Feature members read" ON public.organisation_features
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "No feature writes" ON public.organisation_features
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
GRANT SELECT ON public.organisation_features TO authenticated;

-- Mirror the production audit-view rule for regression assertions.
ALTER TABLE public.settings_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Settings audit viewers read" ON public.settings_change_log
  FOR SELECT TO authenticated
  USING (public.has_company_permission(company_id, 'audit.view'));
GRANT SELECT ON public.settings_change_log TO authenticated;
INSERT INTO public.test_permissions(company_id, user_id, permission)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'audit.view'
);
