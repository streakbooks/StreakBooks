DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('private.platform_mutate(text,uuid,jsonb,text)'::regprocedure);
 d:=replace(d,'public.platform_custom_roles r ON r.id=a.role_id WHERE a.user_id=rid AND r.scope=','public.platform_custom_roles cr ON cr.id=a.role_id WHERE a.user_id=rid AND cr.scope=');
 d:=replace(d,'IF EXISTS(SELECT 1 FROM public.platform_roles WHERE user_id=rid) AND public.platform_role() IS DISTINCT FROM ''platform_owner'' THEN',
 'IF (EXISTS(SELECT 1 FROM public.platform_roles WHERE user_id=rid) OR EXISTS(SELECT 1 FROM public.platform_role_assignments a JOIN public.platform_custom_roles cr ON cr.id=a.role_id WHERE a.user_id=rid AND cr.scope=''platform'')) AND public.platform_role() IS DISTINCT FROM ''platform_owner'' THEN');
 EXECUTE d;
END $$;
