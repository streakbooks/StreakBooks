-- Extend the existing minimal workflow lock-policy table with production columns.
-- The baseline fixture already creates organisation_lock_policy for posting tests.
ALTER TABLE public.organisation_lock_policy
  ADD COLUMN require_override_reason boolean NOT NULL DEFAULT true,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_by uuid;

ALTER TABLE public.organisation_lock_policy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read lock policy" ON public.organisation_lock_policy
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
GRANT SELECT ON public.organisation_lock_policy TO authenticated;

INSERT INTO public.test_permissions(company_id, user_id, permission)
VALUES
('10000000-0000-4000-8000-000000000001',
 '00000000-0000-4000-8000-000000000001','periods.lock'),
('10000000-0000-4000-8000-000000000001',
 '00000000-0000-4000-8000-000000000001','periods.unlock');
