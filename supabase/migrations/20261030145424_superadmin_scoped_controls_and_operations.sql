CREATE FUNCTION private.platform_write_allowed(_company_id uuid,_module text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT EXISTS(SELECT 1 FROM public.platform_tenant_controls WHERE company_id=_company_id AND status<>'active')
 AND NOT EXISTS(SELECT 1 FROM public.platform_records WHERE kind='settings' AND name='maintenance' AND status='active')
 AND NOT EXISTS(SELECT 1 FROM public.platform_records WHERE kind='features' AND name=_module AND status='disabled' AND (company_id IS NULL OR company_id=_company_id))
 AND NOT EXISTS(SELECT 1 FROM public.organisation_features WHERE company_id=_company_id AND feature_key=_module AND NOT enabled)
 AND NOT EXISTS(SELECT 1 FROM public.plan_version_limits l JOIN public.company_subscriptions s ON s.company_id=_company_id
 WHERE l.version_id=coalesce(s.price_version_id,(SELECT id FROM public.plan_versions WHERE plan_code=s.plan_code AND status='published' ORDER BY version_no DESC LIMIT 1)) AND l.feature_key=_module AND NOT l.enabled);
$$;
REVOKE ALL ON FUNCTION private.platform_write_allowed(uuid,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.has_company_permission(_company_id uuid,_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.customer_access_ok() AND (
 EXISTS(SELECT 1 FROM public.company_members m JOIN public.role_permissions r ON r.role=m.role WHERE m.company_id=_company_id AND m.user_id=auth.uid() AND m.status='active' AND r.permission=_permission)
 OR private.scoped_permission(_company_id,_permission))
 AND (_permission ~ '\.(view|export)$' OR private.platform_write_allowed(_company_id,CASE split_part(_permission,'.',1) WHEN 'purchases' THEN 'purchases' WHEN 'sales' THEN 'sales' WHEN 'banking' THEN 'banking' WHEN 'budgets' THEN 'budgets' WHEN 'projects' THEN 'projects' WHEN 'fixed_assets' THEN 'fixed_assets' WHEN 'documents' THEN 'documents' ELSE 'accounting' END));
$$;
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('private.platform_write_guard()'::regprocedure);
 d:=replace(d,'module_name := TG_ARGV[0];','module_name := TG_ARGV[0]; IF NOT private.platform_write_allowed(cid,module_name) THEN RAISE EXCEPTION ''Module access is disabled; historical records remain available'' USING ERRCODE=''42501''; END IF;');
 EXECUTE d;
 d:=pg_get_functiondef('private.platform_mutate(text,uuid,jsonb,text)'::regprocedure);
 d:=replace(d,'SELECT to_jsonb(x) INTO after_row FROM public.platform_tenant_controls x WHERE company_id=rid;',
 'UPDATE public.companies SET archived_at=CASE WHEN _payload->>''status''=''archived'' THEN now() ELSE NULL END WHERE id=rid; SELECT to_jsonb(x) INTO after_row FROM public.platform_tenant_controls x WHERE company_id=rid;');
 EXECUTE d;
END $$;
CREATE FUNCTION private.platform_details(_resource text,_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF _resource NOT IN ('businesses','users','firms') THEN RAISE EXCEPTION 'Unsupported detail resource'; END IF;
 PERFORM private.require_platform(_resource||'.view'); PERFORM private.platform_rate_limit();
 IF _resource='businesses' THEN RETURN jsonb_build_object(
 'members',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM (SELECT m.user_id,p.full_name,p.email,m.role,m.status,m.created_at FROM public.company_members m LEFT JOIN public.profiles p ON p.id=m.user_id WHERE m.company_id=_id ORDER BY m.created_at LIMIT 100) r),
 'subscription',(SELECT jsonb_build_object('plan',s.plan_code,'status',s.status,'interval',s.billing_interval,'trialEnds',s.trial_ends_at,'renewsAt',s.current_period_end,'cancelAtPeriodEnd',s.cancel_at_period_end) FROM public.company_subscriptions s WHERE s.company_id=_id),
 'events',CASE WHEN private.platform_can('billing.view') THEN (SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM (SELECT event_type,provider,created_at FROM public.billing_events WHERE company_id=_id ORDER BY created_at DESC LIMIT 50) r) ELSE NULL END);
 ELSIF _resource='users' THEN RETURN jsonb_build_object(
 'businesses',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM (SELECT m.company_id,c.name,m.role,m.status FROM public.company_members m JOIN public.companies c ON c.id=m.company_id WHERE m.user_id=_id LIMIT 100) r),
 'firms',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM (SELECT m.firm_id,f.name,m.role FROM public.firm_members m JOIN public.firms f ON f.id=m.firm_id WHERE m.user_id=_id LIMIT 100) r),
 'sessions',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM (SELECT created_at,updated_at,not_after FROM auth.sessions WHERE user_id=_id ORDER BY created_at DESC LIMIT 50) r));
 ELSE RETURN jsonb_build_object(
 'members',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM (SELECT m.user_id,p.full_name,p.email,m.role FROM public.firm_members m LEFT JOIN public.profiles p ON p.id=m.user_id WHERE m.firm_id=_id LIMIT 100) r),
 'clients',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM (SELECT l.company_id,c.name,l.access_level,l.revoked_at FROM public.firm_client_links l JOIN public.companies c ON c.id=l.company_id WHERE l.firm_id=_id LIMIT 100) r));
 END IF;
END $$;
CREATE FUNCTION public.platform_details(_resource text,_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.platform_details(_resource,_id); $$;
REVOKE ALL ON FUNCTION public.platform_details(text,uuid),private.platform_details(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_details(text,uuid),private.platform_details(text,uuid) TO authenticated;
CREATE FUNCTION private.platform_bulk_business(_ids uuid[],_status text,_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cid uuid; BEGIN
 PERFORM private.require_platform('businesses.manage');
 IF coalesce(cardinality(_ids),0) NOT BETWEEN 1 AND 100 OR _status NOT IN ('active','inactive','suspended','archived') OR _status IS NULL THEN RAISE EXCEPTION 'Choose 1–100 businesses and a valid status'; END IF;
 FOR cid IN SELECT DISTINCT unnest(_ids) LOOP
 PERFORM private.platform_mutate('business.update',cid,jsonb_build_object('status',_status,'storage_quota_bytes',(SELECT storage_quota_bytes FROM public.platform_tenant_controls WHERE company_id=cid)),_reason);
 END LOOP;
 RETURN jsonb_build_object('ok',true,'count',cardinality(_ids));
END $$;
CREATE FUNCTION public.platform_bulk_business(_ids uuid[],_status text,_reason text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.platform_bulk_business(_ids,_status,_reason); $$;
REVOKE ALL ON FUNCTION public.platform_bulk_business(uuid[],text,text),private.platform_bulk_business(uuid[],text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_bulk_business(uuid[],text,text),private.platform_bulk_business(uuid[],text,text) TO authenticated;
