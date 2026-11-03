-- Additive control plane. No customer financial tables receive platform SELECT policies.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE TABLE public.platform_tenant_controls (
 company_id uuid PRIMARY KEY REFERENCES public.companies(id),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','suspended','archived')),
 storage_quota_bytes bigint CHECK(storage_quota_bytes >= 0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.platform_user_controls (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','suspended')),
 require_mfa boolean NOT NULL DEFAULT false,
 revoked_before timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.platform_custom_roles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 80),
 scope text NOT NULL CHECK(scope IN ('platform','firm','company')),
 permissions text[] NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(scope,name)
);
CREATE TABLE public.platform_role_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 role_id uuid NOT NULL REFERENCES public.platform_custom_roles(id),
 scope_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE NULLS NOT DISTINCT(user_id,role_id,scope_id)
);
CREATE INDEX platform_role_assignments_role ON public.platform_role_assignments(role_id);
CREATE TABLE public.platform_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK(kind IN ('accounting','features','integrations','api','support','notifications','settings')),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 160),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','disabled','open','in_progress','resolved')),
 company_id uuid REFERENCES public.companies(id),
 document jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(document)='object'),
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_records_kind ON public.platform_records(kind,updated_at DESC);
CREATE INDEX platform_records_company ON public.platform_records(company_id) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX platform_records_global_name ON public.platform_records(kind,name) WHERE company_id IS NULL;
CREATE UNIQUE INDEX platform_records_tenant_name ON public.platform_records(kind,name,company_id) WHERE company_id IS NOT NULL;
CREATE TABLE public.platform_support_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 company_id uuid NOT NULL REFERENCES public.companies(id),
 expires_at timestamptz NOT NULL CHECK(expires_at <= created_at + interval '4 hours'),
 revoked_at timestamptz,
 reason text NOT NULL CHECK(length(trim(reason)) >= 3),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_support_grants_lookup ON public.platform_support_grants(user_id,company_id,expires_at) WHERE revoked_at IS NULL;
CREATE TABLE public.platform_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_user_id uuid,
 action text NOT NULL,
 entity_type text NOT NULL,
 entity_id text NOT NULL,
 before_state jsonb,
 after_state jsonb,
 reason text NOT NULL,
 session_id uuid,
 request_ip text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX platform_audit_date ON public.platform_audit(created_at DESC);
CREATE INDEX platform_audit_entity ON public.platform_audit(entity_type,entity_id,created_at DESC);

-- Privileged sessions must exist in Auth now, not merely carry an unexpired JWT.
CREATE FUNCTION private.platform_session_ok() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
 SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
 WHERE s.id = nullif(auth.jwt()->>'session_id','')::uuid AND s.user_id=auth.uid()
 AND (s.not_after IS NULL OR s.not_after > now()) AND (u.banned_until IS NULL OR u.banned_until <= now())
 AND NOT EXISTS (SELECT 1 FROM public.platform_user_controls c WHERE c.user_id=auth.uid()
 AND (c.status <> 'active' OR (c.revoked_before IS NOT NULL AND to_timestamp((auth.jwt()->>'iat')::double precision) <= c.revoked_before)))
 );
$$;
CREATE OR REPLACE FUNCTION public.platform_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT role FROM public.platform_roles WHERE user_id=auth.uid()
 AND auth.jwt()->>'aal'='aal2' AND private.platform_session_ok();
$$;
CREATE FUNCTION private.platform_can(_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(auth.jwt()->>'aal'='aal2' AND private.platform_session_ok() AND (
 public.platform_role()='platform_owner'
 OR (public.platform_role()='platform_finance' AND _permission IN ('overview.view','subscriptions.view','billing.view','billing.manage'))
 OR (public.platform_role()='platform_support' AND _permission IN ('overview.view','businesses.view','users.view','firms.view','support.view','support.manage','notifications.view'))
 OR EXISTS(SELECT 1 FROM public.platform_role_assignments a JOIN public.platform_custom_roles r ON r.id=a.role_id
 WHERE a.user_id=auth.uid() AND r.scope='platform' AND a.scope_id IS NULL AND _permission=ANY(r.permissions))
 ),false);
$$;
CREATE FUNCTION private.require_platform(_permission text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.platform_can(_permission) THEN RAISE EXCEPTION 'Platform permission % and an active MFA session are required',_permission USING ERRCODE='42501'; END IF;
END;
$$;
CREATE FUNCTION private.platform_log(_action text,_type text,_id text,_before jsonb,_after jsonb,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF length(trim(coalesce(_reason,''))) < 3 THEN RAISE EXCEPTION 'Record a reason (at least 3 characters)'; END IF;
 INSERT INTO public.platform_audit(actor_user_id,action,entity_type,entity_id,before_state,after_state,reason,session_id,request_ip)
 VALUES(auth.uid(),_action,_type,_id,_before,_after,_reason,nullif(auth.jwt()->>'session_id','')::uuid,
 left(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-forwarded-for','unknown'),200));
END;
$$;
CREATE FUNCTION private.immutable_platform_audit() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Audit records are append-only'; END;
$$;
CREATE TRIGGER platform_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.platform_audit FOR EACH STATEMENT EXECUTE FUNCTION private.immutable_platform_audit();
CREATE TRIGGER platform_billing_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.platform_billing_audit FOR EACH STATEMENT EXECUTE FUNCTION private.immutable_platform_audit();

-- RLS blocks direct writes. All control-plane mutations go through checked transactions.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['platform_tenant_controls','platform_user_controls','platform_custom_roles','platform_role_assignments','platform_records','platform_support_grants','platform_audit'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
 END LOOP;
END $$;
REVOKE INSERT, UPDATE, DELETE ON public.platform_roles FROM authenticated;
DROP POLICY IF EXISTS platform_roles_write ON public.platform_roles;

-- Narrow the existing customer access helpers without granting platform staff financial access.
CREATE FUNCTION private.customer_access_ok() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.platform_user_controls c WHERE c.user_id=auth.uid()
 AND (c.status<>'active' OR (c.require_mfa AND coalesce(auth.jwt()->>'aal','aal1')<>'aal2')
 OR (c.revoked_before IS NOT NULL AND to_timestamp((auth.jwt()->>'iat')::double precision)<=c.revoked_before)))
 AND private.mfa_requirement_met();
$$;
CREATE FUNCTION private.scoped_permission(_company_id uuid,_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.platform_role_assignments a JOIN public.platform_custom_roles r ON r.id=a.role_id
 WHERE a.user_id=auth.uid() AND _permission=ANY(r.permissions) AND (
 (r.scope='company' AND a.scope_id=_company_id) OR (r.scope='firm' AND EXISTS(
 SELECT 1 FROM public.firm_client_links l JOIN public.firm_members m ON m.firm_id=l.firm_id
 WHERE l.company_id=_company_id AND l.firm_id=a.scope_id AND l.revoked_at IS NULL AND m.user_id=auth.uid()))));
$$;
CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.customer_access_ok() AND (EXISTS(SELECT 1 FROM public.company_members WHERE company_id=_company_id AND user_id=auth.uid() AND status='active') OR private.scoped_permission(_company_id,'company.view'));
$$;
CREATE OR REPLACE FUNCTION public.has_company_role(_company_id uuid,_roles public.company_role[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.customer_access_ok() AND EXISTS(SELECT 1 FROM public.company_members WHERE company_id=_company_id AND user_id=auth.uid() AND status='active' AND role=ANY(_roles));
$$;
CREATE OR REPLACE FUNCTION public.has_company_permission(_company_id uuid,_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.customer_access_ok() AND (
 EXISTS(SELECT 1 FROM public.company_members m JOIN public.role_permissions r ON r.role=m.role WHERE m.company_id=_company_id AND m.user_id=auth.uid() AND m.status='active' AND r.permission=_permission)
 OR private.scoped_permission(_company_id,_permission));
$$;

-- Fix self-enrolment into arbitrary firms in the original policies.
DROP POLICY IF EXISTS "Firm admins insert members" ON public.firm_members;
CREATE POLICY "Firm admins insert members" ON public.firm_members FOR INSERT TO authenticated WITH CHECK (
 private.customer_access_ok() AND (public.is_firm_admin(firm_id) OR (user_id=auth.uid() AND role='owner' AND EXISTS(SELECT 1 FROM public.firms f WHERE f.id=firm_id AND f.created_by=auth.uid()))));

-- Guard all customer tables with a company_id, including SECURITY DEFINER accounting writes.
CREATE FUNCTION private.platform_write_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_data jsonb; cid uuid; module_name text; v_version_id uuid;
BEGIN
 row_data := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 cid := (row_data->>'company_id')::uuid;
 IF EXISTS(SELECT 1 FROM public.platform_tenant_controls WHERE company_id=cid AND status<>'active') THEN
 RAISE EXCEPTION 'This business is read-only. Contact platform support.' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NOT NULL AND NOT private.customer_access_ok() THEN RAISE EXCEPTION 'Account access is disabled' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_records WHERE kind='settings' AND name='maintenance' AND status='active') THEN RAISE EXCEPTION 'Maintenance mode: accounting changes are temporarily paused'; END IF;
 module_name := TG_ARGV[0];
 IF EXISTS(SELECT 1 FROM public.platform_records WHERE kind='features' AND name=module_name AND status='disabled' AND (company_id IS NULL OR company_id=cid)) THEN RAISE EXCEPTION 'Module % is disabled; historical records remain available',module_name; END IF;
 SELECT price_version_id INTO v_version_id FROM public.company_subscriptions WHERE company_id=cid;
 IF EXISTS(SELECT 1 FROM public.plan_version_limits l WHERE l.version_id=v_version_id AND l.feature_key=module_name AND NOT l.enabled) THEN RAISE EXCEPTION 'Module % is not included in this subscription',module_name; END IF;
 IF TG_TABLE_NAME='document_attachments' AND TG_OP<>'DELETE' THEN
 PERFORM 1 FROM public.companies WHERE id=cid FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.platform_tenant_controls c WHERE c.company_id=cid AND c.storage_quota_bytes IS NOT NULL AND c.storage_quota_bytes <
 (SELECT coalesce(sum(d.size_bytes),0) FROM public.document_attachments d WHERE d.company_id=cid AND d.id<> (row_data->>'id')::uuid)+coalesce((row_data->>'size_bytes')::bigint,0)) THEN RAISE EXCEPTION 'Business storage quota reached'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
DO $$ DECLARE t record; mod text; BEGIN
 FOR t IN SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='company_id' AND table_name NOT LIKE 'platform_%' AND table_name NOT LIKE 'billing_%' AND table_name NOT IN ('company_subscriptions','usage_counters','audit_events') LOOP
 mod := CASE WHEN t.table_name LIKE 'sales_%' THEN 'sales' WHEN t.table_name LIKE 'purchase_%' THEN 'purchases' WHEN t.table_name LIKE 'bank_%' THEN 'banking' WHEN t.table_name LIKE 'budget%' THEN 'budgets' WHEN t.table_name LIKE '%asset%' THEN 'fixed_assets' WHEN t.table_name LIKE 'document_%' THEN 'documents' WHEN t.table_name LIKE 'project%' THEN 'projects' ELSE 'accounting' END;
 EXECUTE format('CREATE TRIGGER platform_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.platform_write_guard(%L)',t.table_name,mod);
 END LOOP;
END $$;

-- No untrusted caller can invoke internal helper functions by default.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.mfa_requirement_met(),private.customer_access_ok() TO authenticated;
-- Restore only the existing MFA helper; apply_mfa_policies remains owner-only.
SELECT private.apply_mfa_policies();
CREATE FUNCTION private.platform_context() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE perms text[]; BEGIN
 IF NOT private.platform_session_ok() OR auth.jwt()->>'aal' IS DISTINCT FROM 'aal2' THEN RAISE EXCEPTION 'Enroll and complete MFA in Profile → Security before opening the control centre' USING ERRCODE='42501'; END IF;
 SELECT array_agg(p) INTO perms FROM unnest(ARRAY['overview.view','businesses.view','businesses.manage','firms.view','firms.manage','users.view','users.manage','roles.view','roles.manage','subscriptions.view','billing.view','billing.manage','accounting.view','accounting.manage','features.view','features.manage','integrations.view','integrations.manage','api.view','api.manage','monitoring.view','audit.view','support.view','support.manage','notifications.view','notifications.manage','settings.view','settings.manage']) p WHERE private.platform_can(p);
 IF perms IS NULL THEN RAISE EXCEPTION 'This console is limited to authorized platform staff' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('role',coalesce(public.platform_role(),'custom'),'permissions',perms,'userId',auth.uid());
END $$;

CREATE FUNCTION private.platform_overview(_from date,_to date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; BEGIN
 PERFORM private.require_platform('overview.view');
 IF _from IS NULL OR _to IS NULL OR _to < _from OR _to-_from > 730 THEN RAISE EXCEPTION 'Select a date range of up to 730 days'; END IF;
 SELECT jsonb_build_object(
 'businesses',(SELECT count(*) FROM public.companies WHERE NOT is_demo),
 'activeBusinesses',(SELECT count(*) FROM public.companies c LEFT JOIN public.platform_tenant_controls x ON x.company_id=c.id WHERE NOT c.is_demo AND c.archived_at IS NULL AND coalesce(x.status,'active')='active'),
 'inactiveBusinesses',(SELECT count(*) FROM public.platform_tenant_controls x JOIN public.companies c ON c.id=x.company_id WHERE NOT c.is_demo AND x.status='inactive'),
 'suspendedBusinesses',(SELECT count(*) FROM public.platform_tenant_controls x JOIN public.companies c ON c.id=x.company_id WHERE NOT c.is_demo AND x.status='suspended'),
 'trialAccounts',(SELECT count(*) FROM public.company_subscriptions s JOIN public.companies c ON c.id=s.company_id WHERE NOT c.is_demo AND s.status='trialing' AND s.trial_ends_at>now()),
 'users',(SELECT count(*) FROM auth.users),
 'activeUsers',(SELECT count(*) FROM auth.users u WHERE u.last_sign_in_at>=now()-interval '30 days' AND (u.banned_until IS NULL OR u.banned_until<=now()) AND NOT EXISTS(SELECT 1 FROM public.platform_user_controls x WHERE x.user_id=u.id AND x.status<>'active')),
 'firms',(SELECT count(*) FROM public.firms),
 'subscriptions',(SELECT count(*) FROM public.company_subscriptions s JOIN public.companies c ON c.id=s.company_id WHERE NOT c.is_demo),
 'cancellations',(SELECT count(*) FROM public.company_subscriptions s JOIN public.companies c ON c.id=s.company_id WHERE NOT c.is_demo AND (s.cancel_at_period_end OR s.status='cancelled')),
 'pastDue',(SELECT count(*) FROM public.company_subscriptions s JOIN public.companies c ON c.id=s.company_id WHERE NOT c.is_demo AND s.status='past_due'),
 'revenue',CASE WHEN private.platform_can('billing.view') THEN (SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM (
 SELECT s.currency,round(sum(s.unit_amount_minor::numeric/CASE WHEN s.billing_interval='year' THEN 12 ELSE 1 END),2) AS mrr_minor,
 round(sum(s.unit_amount_minor::numeric/CASE WHEN s.billing_interval='year' THEN 12 ELSE 1 END)*12,2) AS arr_minor
 FROM public.company_subscriptions s JOIN public.companies c ON c.id=s.company_id
 WHERE NOT c.is_demo AND s.status='active' AND s.unit_amount_minor IS NOT NULL AND (s.current_period_end IS NULL OR s.current_period_end>now()) GROUP BY s.currency) r) ELSE '[]'::jsonb END,
 'registrations',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM (
 SELECT d::date AS day,count(c.id) AS businesses FROM generate_series(_from::timestamp,_to::timestamp,interval '1 day') d
 LEFT JOIN public.companies c ON c.created_at>=d AND c.created_at<d+interval '1 day' AND NOT c.is_demo GROUP BY d ORDER BY d) r),
 'plans',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM (SELECT s.plan_code,count(*) AS subscriptions FROM public.company_subscriptions s JOIN public.companies c ON c.id=s.company_id WHERE NOT c.is_demo GROUP BY s.plan_code ORDER BY s.plan_code) r),
 'measuredAt',now()) INTO result;
 RETURN result;
END $$;

CREATE FUNCTION private.platform_list(_resource text,_search text,_page integer,_sort text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q text; res jsonb; permission text; BEGIN
 permission := CASE _resource WHEN 'assignments' THEN 'roles' WHEN 'grants' THEN 'support' ELSE _resource END;
 PERFORM private.require_platform(permission||'.view');
 IF _page < 0 OR _page > 100000 OR length(coalesce(_search,''))>160 OR _sort NOT IN ('asc','desc') THEN RAISE EXCEPTION 'Invalid list options'; END IF;
 q := CASE _resource
 WHEN 'businesses' THEN 'select c.id,c.name,c.country_code,c.base_currency,c.created_at,c.archived_at,coalesce(x.status,case when c.archived_at is not null then ''archived'' else ''active'' end) as status,x.storage_quota_bytes,s.plan_code,s.status as subscription_status from public.companies c left join public.platform_tenant_controls x on x.company_id=c.id left join public.company_subscriptions s on s.company_id=c.id where not c.is_demo'
 WHEN 'firms' THEN 'select f.id,f.name,f.created_at,(select count(*) from public.firm_members m where m.firm_id=f.id) as members,(select count(*) from public.firm_client_links l where l.firm_id=f.id and l.revoked_at is null) as clients from public.firms f'
 WHEN 'users' THEN 'select u.id,u.email,p.full_name,u.created_at,u.last_sign_in_at,coalesce(x.status,''active'') as status,coalesce(x.require_mfa,false) as require_mfa,(select count(*) from auth.mfa_factors f where f.user_id=u.id and f.status=''verified'') as mfa_factors,(select count(*) from auth.sessions s where s.user_id=u.id and (s.not_after is null or s.not_after>now())) as sessions from auth.users u left join public.profiles p on p.id=u.id left join public.platform_user_controls x on x.user_id=u.id'
 WHEN 'roles' THEN 'select id,name,scope,permissions,created_at from public.platform_custom_roles'
 WHEN 'assignments' THEN 'select a.id,a.user_id,a.role_id,a.scope_id,r.name,r.scope,a.created_at from public.platform_role_assignments a join public.platform_custom_roles r on r.id=a.role_id'
 WHEN 'subscriptions' THEN 'select s.company_id as id,c.name,s.plan_code,s.status,s.billing_interval,s.currency,s.unit_amount_minor,s.trial_ends_at,s.current_period_end,s.cancel_at_period_end,s.provider,s.updated_at as created_at from public.company_subscriptions s join public.companies c on c.id=s.company_id where not c.is_demo'
 WHEN 'billing' THEN 'select id,company_id,provider,event_type,created_at from public.billing_events'
 WHEN 'audit' THEN 'select id,actor_user_id,action,entity_type,entity_id,before_state,after_state,reason,session_id,request_ip,created_at from public.platform_audit'
 WHEN 'grants' THEN 'select id,user_id,company_id,expires_at,revoked_at,reason,created_at from public.platform_support_grants'
 WHEN 'accounting' THEN 'select * from public.platform_records where kind=''accounting'''
 WHEN 'features' THEN 'select * from public.platform_records where kind=''features'''
 WHEN 'integrations' THEN 'select * from public.platform_records where kind=''integrations'''
 WHEN 'api' THEN 'select * from public.platform_records where kind=''api'''
 WHEN 'support' THEN 'select * from public.platform_records where kind=''support'''
 WHEN 'notifications' THEN 'select * from public.platform_records where kind=''notifications'''
 WHEN 'settings' THEN 'select * from public.platform_records where kind=''settings'''
 ELSE NULL END;
 IF q IS NULL THEN RAISE EXCEPTION 'Unknown resource'; END IF;
 EXECUTE 'with source as ('||q||'), filtered as (select to_jsonb(s) as row from source s where $1='''' or to_jsonb(s)::text ilike ''%''||$1||''%''), page as (select row from filtered order by row->>''created_at'' '||_sort||',row->>''id'' '||_sort||' limit 25 offset $2) select jsonb_build_object(''rows'',coalesce((select jsonb_agg(row) from page),''[]''),''total'',(select count(*) from filtered),''pageSize'',25)' INTO res USING coalesce(_search,''),_page*25;
 RETURN res;
END $$;

CREATE FUNCTION private.platform_mutate(_action text,_id uuid,_payload jsonb,_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE before_row jsonb; after_row jsonb; rid uuid:=_id; r public.platform_custom_roles%rowtype; kind text; scope_value uuid; keys text[]; BEGIN
 IF length(trim(coalesce(_reason,'')))<3 OR length(_reason)>1000 THEN RAISE EXCEPTION 'Record a reason between 3 and 1000 characters'; END IF;
 IF _payload IS NULL OR jsonb_typeof(_payload)<>'object' OR octet_length(_payload::text)>20000 THEN RAISE EXCEPTION 'Invalid request'; END IF;
 -- Serializes administrative writes, preventing last-owner and assignment races.
 PERFORM pg_advisory_xact_lock(47329211);
 CASE _action
 WHEN 'business.create' THEN
 PERFORM private.require_platform('businesses.manage');
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=(_payload->>'owner_id')::uuid) THEN RAISE EXCEPTION 'Choose an existing business owner'; END IF;
 SELECT jsonb_build_object('last_company_id',last_company_id) INTO before_row FROM public.profiles WHERE id=auth.uid();
 rid:=public.create_company(_payload->>'name',_payload->>'country_code',_payload->>'base_currency',(_payload->>'fiscal_year_end_month')::smallint,(_payload->>'fiscal_year_end_day')::smallint,_payload->>'timezone');
 IF (_payload->>'owner_id')::uuid<>auth.uid() THEN
 INSERT INTO public.company_members(company_id,user_id,role,status,invited_by) VALUES(rid,(_payload->>'owner_id')::uuid,'owner','active',auth.uid());
 DELETE FROM public.company_members WHERE company_id=rid AND user_id=auth.uid();
 END IF;
 UPDATE public.profiles SET last_company_id=(before_row->>'last_company_id')::uuid WHERE id=auth.uid();
 before_row:=NULL;
 after_row:=jsonb_build_object('name',_payload->>'name','owner_id',_payload->>'owner_id');
 WHEN 'business.update' THEN
 PERFORM private.require_platform('businesses.manage');
 SELECT to_jsonb(c) INTO before_row FROM public.companies c WHERE id=rid FOR UPDATE;
 IF before_row IS NULL THEN RAISE EXCEPTION 'Business not found'; END IF;
 IF _payload ? 'name' THEN UPDATE public.companies SET name=trim(_payload->>'name') WHERE id=rid; END IF;
 INSERT INTO public.platform_tenant_controls(company_id,status,storage_quota_bytes) VALUES(rid,coalesce(_payload->>'status','active'),nullif(_payload->>'storage_quota_bytes','')::bigint)
 ON CONFLICT(company_id) DO UPDATE SET status=excluded.status,storage_quota_bytes=excluded.storage_quota_bytes,updated_at=now();
 SELECT to_jsonb(x) INTO after_row FROM public.platform_tenant_controls x WHERE company_id=rid;
 before_row:=jsonb_build_object('name',before_row->>'name');
 after_row:=after_row||jsonb_build_object('name',coalesce(_payload->>'name',before_row->>'name'));
 WHEN 'user.update' THEN
 PERFORM private.require_platform('users.manage');
 IF rid=auth.uid() THEN RAISE EXCEPTION 'Use Profile to manage your own account'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_roles WHERE user_id=rid) OR EXISTS(SELECT 1 FROM public.platform_role_assignments a JOIN public.platform_custom_roles r ON r.id=a.role_id WHERE a.user_id=rid AND r.scope='platform') THEN
 IF public.platform_role() IS DISTINCT FROM 'platform_owner' THEN RAISE EXCEPTION 'Only Superadmin can manage platform staff'; END IF; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=rid) THEN RAISE EXCEPTION 'User not found'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_roles WHERE user_id=rid AND role='platform_owner') AND _payload->>'status'<>'active' THEN RAISE EXCEPTION 'Superadmin suspension requires a separate recovery procedure'; END IF;
 SELECT to_jsonb(x) INTO before_row FROM public.platform_user_controls x WHERE user_id=rid;
 INSERT INTO public.platform_user_controls(user_id,status,require_mfa) VALUES(rid,coalesce(_payload->>'status','active'),coalesce((_payload->>'require_mfa')::boolean,false))
 ON CONFLICT(user_id) DO UPDATE SET status=excluded.status,require_mfa=excluded.require_mfa,updated_at=now();
 IF _payload ? 'full_name' THEN UPDATE public.profiles SET full_name=left(trim(_payload->>'full_name'),160) WHERE id=rid; END IF;
 IF _payload->>'status'<>'active' THEN DELETE FROM auth.sessions WHERE user_id=rid; END IF;
 SELECT to_jsonb(x) INTO after_row FROM public.platform_user_controls x WHERE user_id=rid;
 WHEN 'user.revoke' THEN
 PERFORM private.require_platform('users.manage');
 IF rid=auth.uid() OR EXISTS(SELECT 1 FROM public.platform_roles WHERE user_id=rid AND role='platform_owner') THEN RAISE EXCEPTION 'Superadmin sessions require self sign-out'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_roles WHERE user_id=rid) AND public.platform_role() IS DISTINCT FROM 'platform_owner' THEN RAISE EXCEPTION 'Only Superadmin can revoke staff sessions'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=rid) THEN RAISE EXCEPTION 'User not found'; END IF;
 INSERT INTO public.platform_user_controls(user_id,revoked_before) VALUES(rid,now()) ON CONFLICT(user_id) DO UPDATE SET revoked_before=now(),updated_at=now();
 DELETE FROM auth.sessions WHERE user_id=rid;
 after_row:=jsonb_build_object('sessionsRevoked',true);
 WHEN 'role.save' THEN
 IF public.platform_role() IS DISTINCT FROM 'platform_owner' THEN RAISE EXCEPTION 'Only Superadmin can define roles'; END IF;
 SELECT to_jsonb(x) INTO before_row FROM public.platform_custom_roles x WHERE id=rid FOR UPDATE;
 IF rid IS NOT NULL AND before_row IS NULL THEN RAISE EXCEPTION 'Role not found'; END IF;
 SELECT array_agg(value) INTO keys FROM jsonb_array_elements_text(_payload->'permissions');
 IF coalesce(_payload->>'scope','') NOT IN ('platform','firm','company') THEN RAISE EXCEPTION 'Invalid role scope'; END IF;
 IF _payload->>'scope'='platform' THEN
 IF EXISTS(SELECT 1 FROM unnest(keys) p WHERE p !~ '^(overview|businesses|firms|users|roles|subscriptions|billing|accounting|features|integrations|api|monitoring|audit|support|notifications|settings)\.(view|manage|export)$') THEN RAISE EXCEPTION 'Unknown platform permission'; END IF;
 ELSE
 IF EXISTS(SELECT 1 FROM unnest(keys) p WHERE NOT EXISTS(SELECT 1 FROM public.role_permissions WHERE permission=p)) THEN RAISE EXCEPTION 'Unknown company permission'; END IF;
 END IF;
 IF before_row IS NOT NULL AND before_row->>'scope'<>_payload->>'scope' THEN RAISE EXCEPTION 'Role scope cannot change'; END IF;
 rid:=coalesce(rid,gen_random_uuid());
 INSERT INTO public.platform_custom_roles(id,name,scope,permissions) VALUES(rid,trim(_payload->>'name'),_payload->>'scope',coalesce(keys,'{}')) ON CONFLICT(id) DO UPDATE SET name=excluded.name,permissions=excluded.permissions;
 SELECT to_jsonb(x) INTO after_row FROM public.platform_custom_roles x WHERE id=rid;
 WHEN 'role.assign' THEN
 IF public.platform_role() IS DISTINCT FROM 'platform_owner' THEN RAISE EXCEPTION 'Only Superadmin can assign roles'; END IF;
 SELECT * INTO r FROM public.platform_custom_roles WHERE id=(_payload->>'role_id')::uuid;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Role not found'; END IF;
 scope_value:=nullif(_payload->>'scope_id','')::uuid;
 IF (r.scope='platform' AND scope_value IS NOT NULL) OR (r.scope='company' AND NOT EXISTS(SELECT 1 FROM public.companies WHERE id=scope_value)) OR (r.scope='firm' AND NOT EXISTS(SELECT 1 FROM public.firms WHERE id=scope_value)) THEN RAISE EXCEPTION 'Choose a valid scope'; END IF;
 INSERT INTO public.platform_role_assignments(user_id,role_id,scope_id) VALUES((_payload->>'user_id')::uuid,r.id,scope_value) RETURNING id,to_jsonb(platform_role_assignments.*) INTO rid,after_row;
 WHEN 'role.revoke' THEN
 IF public.platform_role() IS DISTINCT FROM 'platform_owner' THEN RAISE EXCEPTION 'Only Superadmin can revoke roles'; END IF;
 DELETE FROM public.platform_role_assignments WHERE id=rid RETURNING to_jsonb(platform_role_assignments.*) INTO before_row;
 IF before_row IS NULL THEN RAISE EXCEPTION 'Assignment not found'; END IF;
 WHEN 'member.assign' THEN
 PERFORM private.require_platform('businesses.manage');
 IF _payload->>'role'='owner' AND public.platform_role() IS DISTINCT FROM 'platform_owner' THEN RAISE EXCEPTION 'Only Superadmin can assign business owners'; END IF;
 SELECT to_jsonb(m) INTO before_row FROM public.company_members m WHERE company_id=(_payload->>'company_id')::uuid AND user_id=(_payload->>'user_id')::uuid FOR UPDATE;
 IF before_row->>'role'='owner' AND _payload->>'role'<>'owner' AND (SELECT count(*) FROM public.company_members WHERE company_id=(_payload->>'company_id')::uuid AND role='owner' AND status='active')<=1 THEN RAISE EXCEPTION 'Keep at least one active business owner'; END IF;
 INSERT INTO public.company_members(company_id,user_id,role,status,invited_by) VALUES((_payload->>'company_id')::uuid,(_payload->>'user_id')::uuid,(_payload->>'role')::public.company_role,'active',auth.uid()) ON CONFLICT(company_id,user_id) DO UPDATE SET role=excluded.role,status='active' RETURNING id,to_jsonb(company_members.*) INTO rid,after_row;
 WHEN 'firm.member' THEN
 PERFORM private.require_platform('firms.manage');
 INSERT INTO public.firm_members(firm_id,user_id,role) VALUES((_payload->>'firm_id')::uuid,(_payload->>'user_id')::uuid,(_payload->>'role')::public.firm_member_role) ON CONFLICT(firm_id,user_id) DO UPDATE SET role=excluded.role RETURNING id,to_jsonb(firm_members.*) INTO rid,after_row;
 WHEN 'firm.save' THEN
 PERFORM private.require_platform('firms.manage');
 SELECT to_jsonb(x) INTO before_row FROM public.firms x WHERE id=rid;
 IF rid IS NOT NULL AND before_row IS NULL THEN RAISE EXCEPTION 'Firm not found'; END IF;
 rid:=coalesce(rid,gen_random_uuid());
 INSERT INTO public.firms(id,name,created_by) VALUES(rid,trim(_payload->>'name'),auth.uid()) ON CONFLICT(id) DO UPDATE SET name=excluded.name RETURNING to_jsonb(firms.*) INTO after_row;
 WHEN 'support.grant' THEN
 IF public.platform_role() IS DISTINCT FROM 'platform_owner' THEN RAISE EXCEPTION 'Only Superadmin can authorize financial support access'; END IF;
 INSERT INTO public.platform_support_grants(user_id,company_id,expires_at,reason) VALUES((_payload->>'user_id')::uuid,(_payload->>'company_id')::uuid,now()+interval '1 hour',_reason) RETURNING id,to_jsonb(platform_support_grants.*) INTO rid,after_row;
 WHEN 'support.revoke' THEN
 IF public.platform_role() IS DISTINCT FROM 'platform_owner' THEN RAISE EXCEPTION 'Only Superadmin can revoke financial support access'; END IF;
 UPDATE public.platform_support_grants SET revoked_at=now() WHERE id=rid RETURNING to_jsonb(platform_support_grants.*) INTO after_row;
 IF after_row IS NULL THEN RAISE EXCEPTION 'Grant not found'; END IF;
 WHEN 'record.save' THEN
 kind:=_payload->>'kind';
 IF kind NOT IN ('accounting','features','integrations','api','support','notifications','settings') OR kind IS NULL THEN RAISE EXCEPTION 'Invalid record type'; END IF;
 PERFORM private.require_platform(kind||'.manage');
 IF jsonb_typeof(_payload->'document') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Record details must be an object'; END IF;
 keys:=CASE kind WHEN 'accounting' THEN ARRAY['country','currency','timezone','basis','precision','year_end_month','date_format'] WHEN 'features' THEN ARRAY['description'] WHEN 'integrations' THEN ARRAY['provider','category','notes'] WHEN 'api' THEN ARRAY['requests_per_minute','description'] WHEN 'support' THEN ARRAY['description','priority','assignee'] WHEN 'notifications' THEN ARRAY['message','starts_at','ends_at'] WHEN 'settings' THEN ARRAY['description','retention_days'] END;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(_payload->'document') k WHERE NOT k=ANY(keys)) THEN RAISE EXCEPTION 'Unknown detail field. Credentials must remain in server environment configuration'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(_payload->'document') WHERE jsonb_typeof(value) IN ('object','array')) THEN RAISE EXCEPTION 'Detail fields must be scalar values'; END IF;
 IF kind='features' AND _payload->>'name' NOT IN ('accounting','sales','purchases','banking','budgets','fixed_assets','documents','projects') THEN RAISE EXCEPTION 'Choose a supported module'; END IF;
 IF kind='settings' AND _payload->>'name' NOT IN ('maintenance','retention') THEN RAISE EXCEPTION 'Choose maintenance or retention'; END IF;
 SELECT to_jsonb(x) INTO before_row FROM public.platform_records x WHERE id=rid FOR UPDATE;
 IF rid IS NOT NULL AND (before_row IS NULL OR before_row->>'kind'<>kind) THEN RAISE EXCEPTION 'Record not found'; END IF;
 IF before_row IS NOT NULL AND (before_row->>'version')::int IS DISTINCT FROM (_payload->>'version')::int THEN RAISE EXCEPTION 'This record changed. Refresh before saving'; END IF;
 rid:=coalesce(rid,gen_random_uuid());
 INSERT INTO public.platform_records(id,kind,name,status,company_id,document) VALUES(rid,kind,trim(_payload->>'name'),coalesce(_payload->>'status','draft'),nullif(_payload->>'company_id','')::uuid,_payload->'document')
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,status=excluded.status,company_id=excluded.company_id,document=excluded.document,version=platform_records.version+1,updated_at=now() RETURNING to_jsonb(platform_records.*) INTO after_row;
 ELSE RAISE EXCEPTION 'Unknown administrative action';
 END CASE;
 PERFORM private.platform_log(_action,split_part(_action,'.',1),rid::text,before_row,after_row,_reason);
 RETURN jsonb_build_object('id',rid,'ok',true);
END $$;

CREATE FUNCTION private.platform_support_read(_company_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; BEGIN
 PERFORM private.require_platform('support.view');
 IF NOT EXISTS(SELECT 1 FROM public.platform_support_grants WHERE user_id=auth.uid() AND company_id=_company_id AND revoked_at IS NULL AND expires_at>now()) THEN RAISE EXCEPTION 'A separate, unexpired support grant is required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(j)),'[]') INTO result FROM (SELECT id,journal_date,status,source_type FROM public.journals WHERE company_id=_company_id ORDER BY journal_date DESC,id LIMIT 25) j;
 PERFORM private.platform_log('support.read','company',_company_id::text,NULL,jsonb_build_object('rows',jsonb_array_length(result)),'Read journal diagnostic metadata using support grant');
 RETURN result;
END $$;

CREATE FUNCTION private.platform_health() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.require_platform('monitoring.view');
 RETURN jsonb_build_object('database','reachable','databaseBytes',pg_database_size(current_database()),'measuredAt',clock_timestamp(),
 'storageBytes',(SELECT coalesce(sum(size_bytes),0) FROM public.document_attachments),
 'uptime',NULL,'apiUsage',NULL,'backupStatus',NULL,'queueDepth',NULL,
 'maintenance',EXISTS(SELECT 1 FROM public.platform_records WHERE kind='settings' AND name='maintenance' AND status='active'));
END $$;

-- Public API wrappers are invoker-only. Definer implementations live outside the exposed schema.
CREATE FUNCTION public.platform_context() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.platform_context(); $$;
CREATE FUNCTION public.platform_overview(_from date,_to date) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.platform_overview(_from,_to); $$;
CREATE FUNCTION public.platform_list(_resource text,_search text DEFAULT '',_page integer DEFAULT 0,_sort text DEFAULT 'desc') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.platform_list(_resource,_search,_page,_sort); $$;
CREATE FUNCTION public.platform_mutate(_action text,_id uuid DEFAULT NULL,_payload jsonb DEFAULT '{}',_reason text DEFAULT '') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.platform_mutate(_action,_id,_payload,_reason); $$;
CREATE FUNCTION public.platform_support_read(_company_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.platform_support_read(_company_id); $$;
CREATE FUNCTION public.platform_health() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.platform_health(); $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.proname IN ('platform_context','platform_overview','platform_list','platform_mutate','platform_support_read','platform_health') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 END LOOP;
END $$;
