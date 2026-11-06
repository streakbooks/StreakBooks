-- Firm onboarding workload capacity. Advisory workload targets only; no automatic access changes.
CREATE TABLE public.firm_onboarding_staff_capacity (
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  max_open_steps integer NOT NULL DEFAULT 20
    CHECK (max_open_steps BETWEEN 1 AND 200),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(firm_id,user_id)
);
CREATE INDEX firm_onboarding_staff_capacity_staff_idx
  ON public.firm_onboarding_staff_capacity(user_id,firm_id);
ALTER TABLE public.firm_onboarding_staff_capacity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.firm_onboarding_staff_capacity FROM public,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.firm_onboarding_staff_capacity TO authenticated;

CREATE POLICY firm_staff_capacity_read
 ON public.firm_onboarding_staff_capacity FOR SELECT TO authenticated
 USING (
  public.is_firm_member(firm_id)
  AND (user_id=(SELECT auth.uid()) OR public.is_firm_admin(firm_id))
 );
CREATE POLICY firm_staff_capacity_insert
 ON public.firm_onboarding_staff_capacity FOR INSERT TO authenticated
 WITH CHECK (
  public.is_firm_admin(firm_id) AND updated_by=(SELECT auth.uid())
  AND EXISTS(SELECT 1 FROM public.firm_members m
    WHERE m.firm_id=firm_onboarding_staff_capacity.firm_id
      AND m.user_id=firm_onboarding_staff_capacity.user_id)
 );
CREATE POLICY firm_staff_capacity_update
 ON public.firm_onboarding_staff_capacity FOR UPDATE TO authenticated
 USING (public.is_firm_admin(firm_id))
 WITH CHECK (
  public.is_firm_admin(firm_id) AND updated_by=(SELECT auth.uid())
  AND EXISTS(SELECT 1 FROM public.firm_members m
    WHERE m.firm_id=firm_onboarding_staff_capacity.firm_id
      AND m.user_id=firm_onboarding_staff_capacity.user_id)
 );
CREATE POLICY mfa_aal2_required
 ON public.firm_onboarding_staff_capacity AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT private.mfa_requirement_met()))
 WITH CHECK ((SELECT private.mfa_requirement_met()));

CREATE FUNCTION private.firm_staff_capacity_version_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF new.firm_id IS DISTINCT FROM old.firm_id
    OR new.user_id IS DISTINCT FROM old.user_id
    OR new.created_at IS DISTINCT FROM old.created_at
    OR new.version IS DISTINCT FROM old.version THEN
   RAISE EXCEPTION 'Staff capacity identity and version are immutable'
     USING ERRCODE='42501';
 END IF;
 IF new.updated_by IS DISTINCT FROM (SELECT auth.uid()) THEN
   RAISE EXCEPTION 'Only current firm administrator may update capacity'
     USING ERRCODE='42501';
 END IF;
 new.version:=old.version+1;
 new.updated_at:=clock_timestamp();
 RETURN new;
END $$;
CREATE TRIGGER firm_staff_capacity_touch
 BEFORE UPDATE ON public.firm_onboarding_staff_capacity
 FOR EACH ROW EXECUTE FUNCTION private.firm_staff_capacity_version_guard();
REVOKE ALL ON FUNCTION private.firm_staff_capacity_version_guard()
 FROM public,anon,authenticated;
