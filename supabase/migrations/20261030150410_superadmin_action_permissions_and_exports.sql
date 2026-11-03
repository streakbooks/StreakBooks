-- Individual action permissions coexist with the existing Manage permission.
CREATE FUNCTION private.require_platform_action(_resource text,_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.platform_can(_resource||'.manage') AND NOT private.platform_can(_resource||'.'||_action) THEN
 RAISE EXCEPTION 'Platform permission %.% and an active MFA session are required',_resource,_action USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.require_platform_action(text,text) FROM PUBLIC,anon,authenticated;
DO $$ DECLARE d text; a text; BEGIN
 d:=pg_get_functiondef('private.platform_context()'::regprocedure);
 d:=regexp_replace(d,'FROM unnest\(ARRAY\[[^;]+\]\) p WHERE',
 'FROM (SELECT module||''.''||action AS p FROM unnest(ARRAY[''overview'',''businesses'',''firms'',''users'',''roles'',''subscriptions'',''billing'',''accounting'',''features'',''integrations'',''api'',''monitoring'',''audit'',''support'',''notifications'',''settings'']) module CROSS JOIN unnest(ARRAY[''view'',''create'',''edit'',''delete'',''approve'',''export'',''manage'']) action) capabilities WHERE');
 EXECUTE d;
 d:=pg_get_functiondef('private.platform_mutate(text,uuid,jsonb,text)'::regprocedure);
 d:=replace(d,'(view|manage|export)$', '(view|create|edit|delete|approve|export|manage)$');
 -- Existing Require calls appear once per operation, except Business manage (create then edit).
 d:=regexp_replace(d,'PERFORM private.require_platform\(''businesses.manage''\);','PERFORM private.require_platform_action(''businesses'',''create'');');
 d:=replace(d,'WHEN ''business.update'' THEN'||chr(10)||' PERFORM private.require_platform(''businesses.manage'');','WHEN ''business.update'' THEN'||chr(10)||' PERFORM private.require_platform_action(''businesses'',''edit'');');
 d:=replace(d,'PERFORM private.require_platform(''users.manage'');'||chr(10)||' IF rid=auth.uid() THEN','PERFORM private.require_platform_action(''users'',''edit'');'||chr(10)||' IF rid=auth.uid() THEN');
 d:=replace(d,'WHEN ''firm.save'' THEN'||chr(10)||' PERFORM private.require_platform(''firms.manage'');','WHEN ''firm.save'' THEN'||chr(10)||' PERFORM private.require_platform_action(''firms'',CASE WHEN rid IS NULL THEN ''create'' ELSE ''edit'' END);');
 d:=replace(d,'PERFORM private.require_platform(kind||''.manage'');','PERFORM private.require_platform_action(kind,CASE WHEN rid IS NULL THEN ''create'' ELSE ''edit'' END);');
 EXECUTE d;
 d:=pg_get_functiondef('private.platform_bulk_business(uuid[],text,text)'::regprocedure);
 d:=replace(d,'PERFORM private.require_platform(''businesses.manage'');','PERFORM private.require_platform_action(''businesses'',''edit'');');
 EXECUTE d;
END $$;
CREATE FUNCTION private.platform_export(_resource text,_search text,_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; permission text; BEGIN
 permission:=CASE _resource WHEN 'assignments' THEN 'roles' WHEN 'grants' THEN 'support' ELSE _resource END;
 PERFORM private.require_platform_action(permission,'export');
 result:=private.platform_list(_resource,_search,_page,'desc');
 PERFORM private.platform_log('export','platform',_resource,NULL,jsonb_build_object('rows',jsonb_array_length(result->'rows'),'page',_page),'Exported authorized administrative record page');
 RETURN result;
END $$;
CREATE FUNCTION public.platform_export(_resource text,_search text DEFAULT '',_page integer DEFAULT 0) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.platform_export(_resource,_search,_page); $$;
REVOKE ALL ON FUNCTION public.platform_export(text,text,integer),private.platform_export(text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_export(text,text,integer),private.platform_export(text,text,integer) TO authenticated;
