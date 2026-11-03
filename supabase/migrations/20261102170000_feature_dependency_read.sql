-- Allow signed-in users to read the feature dependency catalogue.
-- The table already grants SELECT to authenticated, and RLS has no policy, so the grant returns no rows.
-- Not applied. Apply only after a restore point is confirmed.
-- Reverse: DROP POLICY IF EXISTS feature_dependencies_select ON public.feature_dependencies;

DROP POLICY IF EXISTS feature_dependencies_select ON public.feature_dependencies;
CREATE POLICY feature_dependencies_select ON public.feature_dependencies
  FOR SELECT TO authenticated
  USING (true);
