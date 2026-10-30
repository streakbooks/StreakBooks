-- Customer navigation and UI hints include explicitly assigned scoped roles.
CREATE FUNCTION private.platform_company_context() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.customer_access_ok() THEN RETURN '[]'::jsonb; END IF;
 RETURN (WITH candidate AS (
 SELECT company_id AS id FROM public.company_members WHERE user_id=auth.uid() AND status='active'
 UNION SELECT a.scope_id FROM public.platform_role_assignments a JOIN public.platform_custom_roles r ON r.id=a.role_id WHERE a.user_id=auth.uid() AND r.scope='company'
 UNION SELECT l.company_id FROM public.platform_role_assignments a JOIN public.platform_custom_roles r ON r.id=a.role_id JOIN public.firm_client_links l ON l.firm_id=a.scope_id JOIN public.firm_members m ON m.firm_id=l.firm_id AND m.user_id=a.user_id WHERE a.user_id=auth.uid() AND r.scope='firm' AND l.revoked_at IS NULL
 ), rows AS (
 SELECT c.id,c.name,c.legal_name,c.country_code,c.base_currency,c.fiscal_year_end_month,c.fiscal_year_end_day,c.timezone,c.is_demo,c.archived_at,c.locale,c.date_format,
 coalesce((SELECT m.role::text FROM public.company_members m WHERE m.company_id=c.id AND m.user_id=auth.uid() AND m.status='active'),'read_only') AS role,
 ARRAY(SELECT DISTINCT p.permission FROM public.role_permissions p WHERE public.has_company_permission(c.id,p.permission) ORDER BY p.permission) AS permissions
 FROM public.companies c JOIN candidate x ON x.id=c.id WHERE c.archived_at IS NULL AND public.is_company_member(c.id) ORDER BY c.is_demo,c.name,c.id)
 SELECT coalesce(jsonb_agg(to_jsonb(rows)),'[]') FROM rows);
END $$;
CREATE FUNCTION public.platform_company_context() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.platform_company_context(); $$;
REVOKE ALL ON FUNCTION public.platform_company_context(),private.platform_company_context() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_company_context(),private.platform_company_context() TO authenticated;
