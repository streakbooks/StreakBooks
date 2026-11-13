-- HR access follow-up: ensure demo companies have HR enabled after permission seed.
-- Idempotent. Does not weaken RLS or grant cross-tenant access.

INSERT INTO public.hr_settings (company_id, enabled, disclaimer_acknowledged)
SELECT c.id, true, true
FROM public.companies c
WHERE c.is_demo IS TRUE
ON CONFLICT (company_id) DO UPDATE
SET enabled = true,
    disclaimer_acknowledged = TRUE,
    updated_at = now();

-- Reaffirm owner/admin HR view grants (safe if already present).
INSERT INTO public.role_permissions (role, permission) VALUES
  ('owner', 'hr.view'),
  ('admin', 'hr.view')
ON CONFLICT (role, permission) DO NOTHING;