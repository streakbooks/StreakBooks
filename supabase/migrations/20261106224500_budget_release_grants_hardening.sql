-- LinkBooks Budgets release hardening: existing base tables were granted direct write
-- privileges to authenticated by the platform's default privileges, while design
-- requires all mutations to go through permission-checked SECURITY DEFINER RPCs.
-- Existing RLS SELECT-only + restrictive MFA policies still apply. This adds
-- defense in depth without modifying any financial or budget records.
--
-- Apply AFTER 20261106214000_budget_forecast_scenarios.sql.
--
-- REVOKE and ALTER FUNCTION affect only the Budgets base access paths;
-- posted-journal and invoice workflows are intentionally untouched.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.budgets, public.budget_lines
  FROM PUBLIC, anon, authenticated;

-- Restore read access for authorised organisation members under existing RLS.
GRANT SELECT ON public.budgets, public.budget_lines TO authenticated;

-- The legacy 20261025400100 Budgets migration used search_path=public on
-- SECURITY DEFINER functions. The function bodies already schema-qualify all
-- app tables, auth methods and permission helpers, so an empty path is safe.
ALTER FUNCTION public.save_budget(UUID,UUID,TEXT,DATE,TEXT)
  SET search_path = '';
ALTER FUNCTION public.save_budget_lines(UUID,JSONB,TEXT)
  SET search_path = '';
ALTER FUNCTION public.delete_budget(UUID)
  SET search_path = '';
