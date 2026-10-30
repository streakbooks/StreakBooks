CREATE OR REPLACE FUNCTION public.is_firm_member(_firm_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.customer_access_ok() AND EXISTS(SELECT 1 FROM public.firm_members WHERE firm_id=_firm_id AND user_id=auth.uid());
$$;
CREATE OR REPLACE FUNCTION public.is_firm_admin(_firm_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.customer_access_ok() AND EXISTS(SELECT 1 FROM public.firm_members WHERE firm_id=_firm_id AND user_id=auth.uid() AND role IN ('owner','admin'));
$$;
REVOKE ALL ON FUNCTION public.is_firm_member(uuid),public.is_firm_admin(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_firm_member(uuid),public.is_firm_admin(uuid) TO authenticated;
DROP POLICY IF EXISTS "Firm admins manage links" ON public.firm_client_links;
CREATE POLICY "Firm admins manage links" ON public.firm_client_links FOR INSERT TO authenticated
 WITH CHECK(public.is_firm_admin(firm_id) AND public.has_company_permission(company_id,'company.settings.edit'));
CREATE FUNCTION private.firm_client_link_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.company_id<>OLD.company_id OR NEW.firm_id<>OLD.firm_id) THEN RAISE EXCEPTION 'Client link identity cannot change'; END IF;
 IF auth.uid() IS NOT NULL AND (TG_OP='INSERT' OR NEW.access_level IS DISTINCT FROM OLD.access_level OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL)) AND NOT public.has_company_permission(NEW.company_id,'company.settings.edit') THEN
 RAISE EXCEPTION 'Business authorization is required to link a client or increase firm access' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.firm_client_link_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER firm_client_link_authorization BEFORE INSERT OR UPDATE ON public.firm_client_links FOR EACH ROW EXECUTE FUNCTION private.firm_client_link_guard();
