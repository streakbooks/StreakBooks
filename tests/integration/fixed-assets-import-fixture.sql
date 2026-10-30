-- Isolated PostgreSQL fixture for verifying the fixed-asset import boundary.
-- These are intentionally minimal stubs: the real save_fixed_asset RPC is separately
-- defined in supabase/migrations/20261025400300_fixed_assets.sql and needs full staging.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
INSERT INTO auth.users(id) VALUES
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333');

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.companies (id uuid PRIMARY KEY);
INSERT INTO public.companies VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

CREATE TABLE public.import_test_members (
 company_id uuid REFERENCES public.companies(id),
 user_id uuid REFERENCES auth.users(id),
 can_manage boolean NOT NULL,
 PRIMARY KEY(company_id,user_id)
);
INSERT INTO public.import_test_members VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',true),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222',false),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333',true);

CREATE FUNCTION public.is_company_member(_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS (SELECT 1 FROM public.import_test_members
 WHERE company_id=_company_id AND user_id=auth.uid())
$$;
CREATE FUNCTION public.has_company_permission(_company_id uuid, _permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS (SELECT 1 FROM public.import_test_members
 WHERE company_id=_company_id AND user_id=auth.uid() AND can_manage AND _permission='accounts.manage')
$$;

CREATE TABLE public.fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text NOT NULL,
  cost_minor bigint NOT NULL
);
CREATE TABLE public.import_test_audits (
  company_id uuid NOT NULL,
  event_name text NOT NULL,
  entity_id uuid,
  payload jsonb
);
CREATE FUNCTION public.save_fixed_asset(_company_id uuid, _asset_id uuid, _payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE _id uuid;
BEGIN
 IF NOT public.has_company_permission(_company_id,'accounts.manage') THEN
  RAISE EXCEPTION 'No permission to manage fixed assets';
 END IF;
 IF _payload->>'name'='FORCE_FAILURE' THEN
  RAISE EXCEPTION 'Simulated domain writer failure';
 END IF;
 IF (_payload->>'cost_minor')::bigint<=0 THEN
  RAISE EXCEPTION 'Asset cost must be positive';
 END IF;
 INSERT INTO public.fixed_assets(company_id,name,cost_minor)
 VALUES (_company_id,_payload->>'name',(_payload->>'cost_minor')::bigint)
 RETURNING id INTO _id;
 RETURN _id;
END;
$$;
CREATE FUNCTION public.record_audit_event(
 _company_id uuid, _action text, _entity_type text, _entity_id uuid, _details jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.import_test_audits(company_id,event_name,entity_id,payload)
 VALUES (_company_id,_action,_entity_id,_details);
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fixed_assets,public.import_test_audits TO authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
