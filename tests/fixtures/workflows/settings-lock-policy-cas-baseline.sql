-- Isolated PostgreSQL fixture matching the existing lock-policy schema.
CREATE TABLE public.organisation_lock_policy (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  lock_date_everyone date,
  lock_date_except_advisors date,
  conversion_date date,
  require_override_reason boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
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
