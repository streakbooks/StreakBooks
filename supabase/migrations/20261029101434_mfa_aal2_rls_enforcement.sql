-- Enforce two-step verification at the database layer.
-- A user with a verified MFA factor must present an aal2 session; users without a
-- verified factor are unaffected. Restrictive policies AND with existing permissive ones,
-- so this only ever narrows access. Reversible: drop policy mfa_aal2_required.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

-- auth.mfa_factors is not readable by `authenticated`, hence SECURITY DEFINER.
CREATE OR REPLACE FUNCTION private.mfa_requirement_met()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      OR NOT EXISTS (
        SELECT 1
        FROM auth.mfa_factors f
        WHERE f.user_id = auth.uid()
          AND f.status = 'verified'
      );
$$;

REVOKE ALL ON FUNCTION private.mfa_requirement_met() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.mfa_requirement_met() TO authenticated;

-- Re-run from later migrations after creating new RLS tables:
--   SELECT private.apply_mfa_policies();
CREATE OR REPLACE FUNCTION private.apply_mfa_policies()
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  r record;
  applied integer := 0;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS mfa_aal2_required ON public.%I', r.relname);
    EXECUTE format(
      'CREATE POLICY mfa_aal2_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING ((SELECT private.mfa_requirement_met())) '
      'WITH CHECK ((SELECT private.mfa_requirement_met()))',
      r.relname
    );
    applied := applied + 1;
  END LOOP;
  RETURN applied;
END;
$$;

REVOKE ALL ON FUNCTION private.apply_mfa_policies() FROM PUBLIC, anon, authenticated;

SELECT private.apply_mfa_policies();
