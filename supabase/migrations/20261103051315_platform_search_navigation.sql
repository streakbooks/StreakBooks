-- Operational metadata navigation. Reuses existing permissions, details, rate limit and audit.
-- No customer ledger access, tenant memberships, subscription prices or accounting data change.
CREATE FUNCTION private.platform_global_search(_query text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE term text := trim(coalesce(_query,'')); pattern text; result jsonb;
BEGIN
  IF NOT (private.platform_can('businesses.view') OR private.platform_can('users.view') OR private.platform_can('firms.view')) THEN
    RAISE EXCEPTION 'Platform permission required' USING ERRCODE='42501';
  END IF;
  IF length(term)>160 THEN RAISE EXCEPTION 'Search must contain at most 160 characters'; END IF;
  IF length(term)<2 THEN RETURN '[]'::jsonb; END IF;
  PERFORM private.platform_rate_limit();
  pattern := '%' || replace(replace(replace(term,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_') || '%';
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'id',id,'label',label) ORDER BY lower(label),kind,id),'[]'::jsonb)
    INTO result FROM (
      SELECT * FROM (
        SELECT 'business'::text AS kind,c.id,coalesce(nullif(trim(c.name),''),c.id::text) AS label
        FROM public.companies c WHERE private.platform_can('businesses.view')
          AND (c.name ILIKE pattern ESCAPE E'\\' OR c.id::text ILIKE pattern ESCAPE E'\\')
        UNION ALL
        SELECT 'user',u.id,coalesce(nullif(trim(p.full_name),''),nullif(trim(u.email),''),u.id::text)
        FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE private.platform_can('users.view')
          AND (p.full_name ILIKE pattern ESCAPE E'\\' OR u.email ILIKE pattern ESCAPE E'\\' OR u.id::text ILIKE pattern ESCAPE E'\\')
        UNION ALL
        SELECT 'firm',f.id,coalesce(nullif(trim(f.name),''),f.id::text)
        FROM public.firms f WHERE private.platform_can('firms.view')
          AND (f.name ILIKE pattern ESCAPE E'\\' OR f.id::text ILIKE pattern ESCAPE E'\\')
      ) matches ORDER BY lower(label),kind,id LIMIT 20
    ) bounded;
  PERFORM private.platform_log('search','platform','global',NULL,jsonb_build_object('rows',jsonb_array_length(result)),'Platform search');
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.platform_global_search(_query text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.platform_global_search(_query); $$;

CREATE FUNCTION private.platform_record(_resource text,_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE identity jsonb; related jsonb;
BEGIN
  IF _resource IS NULL OR _resource NOT IN ('businesses','users','firms') OR _id IS NULL THEN RAISE EXCEPTION 'Choose a business, user or accounting firm'; END IF;
  PERFORM private.require_platform(_resource||'.view');
  -- Preserve existing authorization, billing-field permissions and request throttling.
  related := private.platform_details(_resource,_id);
  IF _resource='businesses' THEN
    SELECT jsonb_build_object('id',c.id,'name',c.name,'country_code',c.country_code,'base_currency',c.base_currency,
      'created_at',c.created_at,'archived_at',c.archived_at,'is_demo',c.is_demo,
      'status',coalesce(x.status,CASE WHEN c.archived_at IS NOT NULL THEN 'archived' ELSE 'active' END))
      INTO identity FROM public.companies c LEFT JOIN public.platform_tenant_controls x ON x.company_id=c.id WHERE c.id=_id;
  ELSIF _resource='users' THEN
    SELECT jsonb_build_object('id',u.id,'full_name',p.full_name,'email',u.email,'created_at',u.created_at,
      'last_sign_in_at',u.last_sign_in_at,'status',coalesce(x.status,'active'),'require_mfa',coalesce(x.require_mfa,false))
      INTO identity FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id LEFT JOIN public.platform_user_controls x ON x.user_id=u.id WHERE u.id=_id;
  ELSE
    SELECT jsonb_build_object('id',f.id,'name',f.name,'created_at',f.created_at) INTO identity FROM public.firms f WHERE f.id=_id;
  END IF;
  IF identity IS NULL THEN RAISE EXCEPTION 'That platform record was not found' USING ERRCODE='P0002'; END IF;
  PERFORM private.platform_log('record.view',_resource,_id::text,NULL,jsonb_build_object('resource',_resource),'Opened platform record');
  RETURN jsonb_build_object('record',identity,'related',related);
END $$;
CREATE FUNCTION public.platform_record(_resource text,_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.platform_record(_resource,_id); $$;
REVOKE ALL ON FUNCTION public.platform_global_search(text),private.platform_global_search(text),public.platform_record(text,uuid),private.platform_record(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_global_search(text),private.platform_global_search(text),public.platform_record(text,uuid),private.platform_record(text,uuid) TO authenticated;
