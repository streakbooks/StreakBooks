CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE SCHEMA billing;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
CREATE TYPE public.firm_access_level AS ENUM ('view','bookkeep','full');
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,last_sign_in_at timestamptz,banned_until timestamptz);
CREATE TABLE public.profiles(id uuid PRIMARY KEY,full_name text,email text);
CREATE TABLE public.companies(
  id uuid PRIMARY KEY,name text NOT NULL,legal_name text,country_code text DEFAULT 'US',
  base_currency text DEFAULT 'USD',fiscal_year_end_month integer DEFAULT 12,fiscal_year_end_day integer DEFAULT 31,
  timezone text DEFAULT 'UTC',is_demo boolean NOT NULL DEFAULT false,archived_at timestamptz,
  locale text,date_format text
);
CREATE TABLE public.company_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,user_id uuid NOT NULL,
  role text NOT NULL,status text NOT NULL DEFAULT 'active',created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,user_id));
CREATE TABLE public.member_permission_adjustments(company_id uuid NOT NULL,user_id uuid NOT NULL,permission text NOT NULL,
  effect text NOT NULL,PRIMARY KEY(company_id,user_id,permission));
CREATE TABLE public.role_permissions(role text NOT NULL,permission text NOT NULL,PRIMARY KEY(role,permission));
CREATE TABLE public.platform_custom_roles(id uuid PRIMARY KEY,permissions text[] NOT NULL,scope text NOT NULL);
CREATE TABLE public.platform_role_assignments(user_id uuid NOT NULL,role_id uuid NOT NULL,scope_id uuid);
CREATE TABLE public.firms(id uuid PRIMARY KEY,name text NOT NULL,created_by uuid,created_at timestamptz DEFAULT now());
CREATE TABLE public.firm_members(firm_id uuid NOT NULL,user_id uuid NOT NULL,role text NOT NULL,UNIQUE(firm_id,user_id));
CREATE TABLE public.firm_client_links(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),firm_id uuid NOT NULL,company_id uuid NOT NULL,
  access_level public.firm_access_level NOT NULL,linked_by uuid,created_at timestamptz DEFAULT now(),revoked_at timestamptz,
  UNIQUE(firm_id,company_id));
CREATE TABLE private.firm_access_grants(link_id uuid NOT NULL REFERENCES public.firm_client_links(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.company_members(id) ON DELETE CASCADE,granted_role text NOT NULL,
  member_updated_at timestamptz NOT NULL,PRIMARY KEY(link_id,member_id));
CREATE TABLE public.company_subscriptions(company_id uuid PRIMARY KEY,plan_code text,status text NOT NULL,
  billing_interval text DEFAULT 'month',provider text DEFAULT 'none',unit_amount_minor integer);
CREATE TABLE billing.subscription_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,company_id uuid,event_type text,
  source text,actor_user_id uuid,details jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE public.audit_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,company_id uuid,actor_user_id uuid,
  action text,entity_type text,entity_id uuid,details jsonb);
CREATE FUNCTION public.record_audit_event(uuid,text,text,uuid,jsonb) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
CREATE FUNCTION private.customer_access_ok() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() IS NOT NULL $$;
CREATE FUNCTION private.mfa_requirement_met() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION private.platform_write_allowed(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('test.write_allowed',true),''),'true')::boolean
$$;
CREATE FUNCTION private.require_platform(text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'platform owner required'; END IF; END $$;
CREATE FUNCTION private.platform_company_context() RETURNS jsonb LANGUAGE sql AS $$ SELECT '[]'::jsonb $$;
CREATE FUNCTION public.platform_company_context() RETURNS jsonb LANGUAGE sql SECURITY INVOKER AS $$
  SELECT private.platform_company_context()
$$;
CREATE FUNCTION public.is_firm_member(_firm_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS(SELECT 1 FROM public.firm_members WHERE firm_id=_firm_id AND user_id=auth.uid())
$$;
CREATE FUNCTION public.is_firm_admin(_firm_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS(SELECT 1 FROM public.firm_members WHERE firm_id=_firm_id AND user_id=auth.uid() AND role IN ('owner','admin'))
$$;
ALTER TABLE public.firm_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_client_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY firm_test_member_read ON public.firm_members FOR SELECT TO authenticated USING (public.is_firm_member(firm_id));
GRANT USAGE ON SCHEMA auth,private,billing TO authenticated;
GRANT EXECUTE ON FUNCTION auth.jwt(),auth.uid(),private.customer_access_ok(),private.mfa_requirement_met(),
  private.platform_write_allowed(uuid,text),private.require_platform(text),public.is_firm_member(uuid),public.is_firm_admin(uuid),
  public.record_audit_event(uuid,text,text,uuid,jsonb),public.platform_company_context() TO authenticated;
GRANT SELECT ON public.companies,public.firm_members,public.firm_client_links,public.firms,public.company_members,
  public.role_permissions,auth.users,public.profiles TO authenticated;
GRANT UPDATE ON public.firm_client_links,public.company_subscriptions TO authenticated;
GRANT INSERT ON public.company_subscriptions,public.firm_client_links,public.firm_members,public.company_members,
  public.profiles,public.firms,public.audit_events TO authenticated;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public,billing TO authenticated;
