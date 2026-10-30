-- Follow-up from transactional integration tests and security review.
CREATE TABLE private.platform_request_buckets (
 user_id uuid NOT NULL,
 minute timestamptz NOT NULL,
 requests integer NOT NULL,
 PRIMARY KEY(user_id,minute)
);
ALTER TABLE private.platform_request_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.platform_request_buckets FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.platform_rate_limit() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer; BEGIN
 INSERT INTO private.platform_request_buckets(user_id,minute,requests) VALUES(auth.uid(),date_trunc('minute',now()),1)
 ON CONFLICT(user_id,minute) DO UPDATE SET requests=platform_request_buckets.requests+1 RETURNING requests INTO n;
 IF n>300 THEN RAISE EXCEPTION 'Too many platform requests. Retry next minute' USING ERRCODE='54000'; END IF;
 -- A small bounded cleanup avoids storing session activity indefinitely.
 DELETE FROM private.platform_request_buckets WHERE minute < now()-interval '1 day';
END $$;
REVOKE ALL ON FUNCTION private.platform_rate_limit() FROM PUBLIC,anon,authenticated;

-- Add rate limits after authorization to each control-plane endpoint.
DO $$ DECLARE f record; d text; BEGIN
 FOR f IN SELECT p.oid,proname FROM pg_proc p WHERE pronamespace='private'::regnamespace AND proname IN ('platform_context','platform_overview','platform_list','platform_mutate','platform_support_read','platform_health') LOOP
 d:=pg_get_functiondef(f.oid);
 IF f.proname='platform_context' THEN
 d:=replace(d,'RETURN jsonb_build_object(''role''', 'PERFORM private.platform_rate_limit(); RETURN jsonb_build_object(''role''');
 ELSIF f.proname='platform_mutate' THEN
 -- Every action authorizes before its mutation. The rate limiter is called after CASE success, so denials cannot grow counters.
 d:=replace(d,'PERFORM private.platform_log(_action,','PERFORM private.platform_rate_limit(); PERFORM private.platform_log(_action,');
 ELSE
 d:=regexp_replace(d,'(PERFORM private.require_platform\([^;]+;)','\1 PERFORM private.platform_rate_limit();');
 END IF;
 EXECUTE d;
 END LOOP;
END $$;

-- Gate legacy staff APIs on live sessions as well as MFA. Some installations predate these RPCs.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('platform_set_staff_role','platform_set_plan_visibility') LOOP
 EXECUTE regexp_replace(pg_get_functiondef(f.oid),'BEGIN','BEGIN IF public.platform_role() IS DISTINCT FROM ''platform_owner'' THEN RAISE EXCEPTION ''An active Superadmin MFA session is required'' USING ERRCODE=''42501''; END IF;');
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.scoped_permission(_company_id uuid,_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT EXISTS(SELECT 1 FROM public.company_members m WHERE m.company_id=_company_id AND m.user_id=auth.uid() AND m.status='suspended') AND EXISTS(
 SELECT 1 FROM public.platform_role_assignments a JOIN public.platform_custom_roles r ON r.id=a.role_id
 WHERE a.user_id=auth.uid() AND _permission=ANY(r.permissions) AND (
 (r.scope='company' AND a.scope_id=_company_id) OR (r.scope='firm' AND EXISTS(
 SELECT 1 FROM public.firm_client_links l JOIN public.firm_members m ON m.firm_id=l.firm_id
 JOIN public.role_permissions rp ON rp.role=CASE l.access_level WHEN 'view' THEN 'read_only'::public.company_role WHEN 'bookkeep' THEN 'bookkeeper'::public.company_role ELSE 'admin'::public.company_role END
 WHERE l.company_id=_company_id AND l.firm_id=a.scope_id AND l.revoked_at IS NULL AND m.user_id=auth.uid() AND rp.permission=_permission))));
$$;

-- Patch the checked mutation routine, retaining its existing interface and transaction.
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('private.platform_mutate(text,uuid,jsonb,text)'::regprocedure);
 d:=replace(d,'IF _payload ? ''name'' THEN UPDATE public.companies',
 'before_row:=jsonb_build_object(''name'',before_row->>''name'')||coalesce((SELECT to_jsonb(x) FROM public.platform_tenant_controls x WHERE company_id=rid),''{}''::jsonb); IF _payload ? ''name'' THEN UPDATE public.companies');
 d:=replace(d,'before_row:=jsonb_build_object(''name'',before_row->>''name'');','');
 d:=replace(d,'IF _payload->>''status''<>''active'' THEN DELETE FROM auth.sessions WHERE user_id=rid; END IF;',
 'IF _payload->>''status''<>''active'' THEN UPDATE public.platform_user_controls SET revoked_before=now() WHERE user_id=rid; DELETE FROM auth.sessions WHERE user_id=rid; END IF;');
 d:=replace(d,'INSERT INTO public.company_members(company_id,user_id,role,status,invited_by) VALUES((_payload',
 'PERFORM set_config(''linkbooks.trusted'',''on'',true); INSERT INTO public.company_members(company_id,user_id,role,status,invited_by) VALUES((_payload');
 d:=replace(d,'INTO rid,after_row;'||chr(10)||' WHEN ''firm.member''',
 'INTO rid,after_row; PERFORM set_config(''linkbooks.trusted'',''off'',true);'||chr(10)||' WHEN ''firm.member''');
 d:=replace(d,'rid:=public.create_company(',
 'IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=_payload->>''timezone'') THEN RAISE EXCEPTION ''Invalid IANA timezone''; END IF; PERFORM make_date(2024,(_payload->>''fiscal_year_end_month'')::int,(_payload->>''fiscal_year_end_day'')::int); rid:=public.create_company(');
 EXECUTE d;
END $$;

-- Templates for the requested role hierarchy. Existing company roles remain authoritative.
INSERT INTO public.platform_custom_roles(name,scope,permissions) VALUES
 ('Platform Admin','platform',ARRAY['overview.view','businesses.view','businesses.manage','firms.view','firms.manage','users.view','users.manage','roles.view','subscriptions.view','billing.view','accounting.view','accounting.manage','features.view','features.manage','integrations.view','integrations.manage','api.view','api.manage','monitoring.view','audit.view','support.view','support.manage','notifications.view','notifications.manage']),
 ('Firm Manager','firm',ARRAY['company.view','members.view','accounting.view','sales.view','sales.draft','sales.authorise','purchases.view','purchases.draft','purchases.authorise','reports.view','reports.export']),
 ('Approver','company',ARRAY['company.view','accounting.view','sales.view','sales.authorise','purchases.view','purchases.authorise','expenses.approve'])
 ON CONFLICT(scope,name) DO NOTHING;

CREATE FUNCTION private.platform_announcements(_company_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.customer_access_ok() THEN RAISE EXCEPTION 'Sign in to read announcements' USING ERRCODE='42501'; END IF;
 IF _company_id IS NOT NULL AND NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Business access required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM (
 SELECT id,name,document->>'message' AS message FROM public.platform_records WHERE kind='notifications' AND status='active'
 AND (company_id IS NULL OR company_id=_company_id)
 AND (nullif(document->>'starts_at','') IS NULL OR (document->>'starts_at')::timestamptz<=now())
 AND (nullif(document->>'ends_at','') IS NULL OR (document->>'ends_at')::timestamptz>now()) ORDER BY created_at DESC LIMIT 5) r);
END $$;
CREATE FUNCTION public.platform_announcements(_company_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.platform_announcements(_company_id); $$;
REVOKE ALL ON FUNCTION public.platform_announcements(uuid),private.platform_announcements(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_announcements(uuid),private.platform_announcements(uuid) TO authenticated;

CREATE FUNCTION private.platform_price_action(_action text,_payload jsonb,_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous public.plan_versions%rowtype; target public.plan_versions%rowtype; vid uuid; staff_role text; amount integer; floor integer; cur text; cadence text; code text; result_status text;
BEGIN
 staff_role:=public.platform_role();
 IF staff_role IS NULL OR staff_role NOT IN ('platform_owner','platform_finance') THEN RAISE EXCEPTION 'Billing staff and an active MFA session are required' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(_reason,'')))<3 THEN RAISE EXCEPTION 'Record a reason'; END IF;
 PERFORM private.platform_rate_limit();
 PERFORM pg_advisory_xact_lock(47329212);
 IF _action='draft' THEN
 code:=_payload->>'planCode';cur:=_payload->>'currency';cadence:=_payload->>'interval';amount:=(_payload->>'amountMinor')::integer;
 IF cur NOT IN ('USD','GBP','AUD','NZD','INR') OR cadence NOT IN ('month','year') OR code NOT IN ('starter','growth','pro','practice') OR amount IS NULL THEN RAISE EXCEPTION 'Choose a supported plan, currency and interval'; END IF;
 floor:=CASE cur WHEN 'USD' THEN 500 WHEN 'GBP' THEN 400 WHEN 'AUD' THEN 800 WHEN 'NZD' THEN 800 WHEN 'INR' THEN 9900 END * CASE cadence WHEN 'year' THEN 8 ELSE 1 END;
 IF amount<floor THEN RAISE EXCEPTION 'Price is below the configured floor'; END IF;
 SELECT * INTO previous FROM public.plan_versions WHERE plan_code=code ORDER BY version_no DESC LIMIT 1;
 result_status:=CASE WHEN staff_role='platform_finance' AND coalesce((SELECT require_owner_approval FROM public.billing_settings WHERE id),true) THEN 'review' ELSE 'draft' END;
 INSERT INTO public.plan_versions(plan_code,version_no,status,name,audience,summary,visibility,created_by,reason) VALUES(code,coalesce(previous.version_no,0)+1,result_status,coalesce(previous.name,code),coalesce(previous.audience,''),coalesce(previous.summary,''),'draft',auth.uid(),_reason) RETURNING id INTO vid;
 SELECT * INTO previous FROM public.plan_versions WHERE plan_code=code AND status='published' ORDER BY version_no DESC LIMIT 1;
 INSERT INTO public.plan_prices(version_id,currency,billing_interval,amount_minor,needs_review) SELECT vid,currency,billing_interval,amount_minor,needs_review FROM public.plan_prices WHERE version_id=previous.id;
 INSERT INTO public.plan_prices(version_id,currency,billing_interval,amount_minor,needs_review) VALUES(vid,cur,cadence,amount,cur<>'USD') ON CONFLICT(version_id,currency,billing_interval) DO UPDATE SET amount_minor=excluded.amount_minor,needs_review=excluded.needs_review;
 INSERT INTO public.plan_version_limits(version_id,feature_key,enabled,limit_value) SELECT vid,feature_key,enabled,limit_value FROM public.plan_version_limits WHERE version_id=previous.id;
 ELSE
 IF staff_role<>'platform_owner' THEN RAISE EXCEPTION 'Only Superadmin may publish or roll back prices' USING ERRCODE='42501'; END IF;
 IF _action='publish' THEN SELECT * INTO target FROM public.plan_versions WHERE id=(_payload->>'versionId')::uuid AND status IN ('draft','review');
 ELSIF _action='rollback' THEN SELECT * INTO target FROM public.plan_versions WHERE plan_code=_payload->>'planCode' AND status='archived' ORDER BY version_no DESC LIMIT 1;
 ELSE RAISE EXCEPTION 'Unknown price action'; END IF;
 IF target.id IS NULL THEN RAISE EXCEPTION 'No eligible price version'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.plan_prices WHERE version_id=target.id) THEN RAISE EXCEPTION 'A price version must contain prices'; END IF;
 SELECT * INTO previous FROM public.plan_versions WHERE plan_code=target.plan_code AND status='published' LIMIT 1;
 UPDATE public.plan_versions SET status='archived',visibility='hidden' WHERE plan_code=target.plan_code AND status='published';
 UPDATE public.plan_versions SET status='published',visibility='live',published_at=now(),effective_from=now(),reason=_reason WHERE id=target.id;
 vid:=target.id;result_status:='published';
 END IF;
 PERFORM private.platform_log('price.'||_action,'plan_version',vid::text,CASE WHEN previous.id IS NULL THEN NULL ELSE jsonb_build_object('id',previous.id,'status',previous.status) END,jsonb_build_object('id',vid,'status',result_status),_reason);
 RETURN jsonb_build_object('versionId',vid,'status',result_status,'marginWarning',null,'grandfathered',true,'ok',true);
END $$;
CREATE FUNCTION public.platform_price_action(_action text,_payload jsonb,_reason text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.platform_price_action(_action,_payload,_reason); $$;
REVOKE ALL ON FUNCTION public.platform_price_action(text,jsonb,text),private.platform_price_action(text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_price_action(text,jsonb,text),private.platform_price_action(text,jsonb,text) TO authenticated;
CREATE INDEX platform_request_buckets_minute ON private.platform_request_buckets(minute);
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('private.platform_mutate(text,uuid,jsonb,text)'::regprocedure);
 d:=replace(d,'SELECT to_jsonb(x) INTO before_row FROM public.platform_records x WHERE id=rid FOR UPDATE;',
 'IF kind IN (''integrations'',''api'') AND coalesce(_payload->>''status'',''draft'') NOT IN (''draft'',''disabled'') THEN RAISE EXCEPTION ''Registry entries cannot claim a live connection''; END IF;
 IF kind=''notifications'' THEN
 IF length(trim(coalesce(_payload->''document''->>''message'','''')))=0 THEN RAISE EXCEPTION ''Enter an announcement message''; END IF;
 PERFORM nullif(_payload->''document''->>''starts_at'','''')::timestamptz;
 PERFORM nullif(_payload->''document''->>''ends_at'','''')::timestamptz;
 IF (_payload->''document''->>''ends_at'')::timestamptz < (_payload->''document''->>''starts_at'')::timestamptz THEN RAISE EXCEPTION ''Announcement end must follow start''; END IF;
 END IF;
 IF kind=''settings'' AND nullif(_payload->>''company_id'','''') IS NOT NULL THEN RAISE EXCEPTION ''System settings must use global scope''; END IF;
 SELECT to_jsonb(x) INTO before_row FROM public.platform_records x WHERE id=rid FOR UPDATE;');
 EXECUTE d;
END $$;
