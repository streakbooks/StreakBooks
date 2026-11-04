-- Minimal isolated test substrate for accountant exception history.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS private;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
END $$;
GRANT USAGE ON SCHEMA auth, private, public TO authenticated;
GRANT USAGE ON SCHEMA auth, private, public TO anon;

CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.companies (id uuid PRIMARY KEY);
CREATE TABLE public.journals (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  status text NOT NULL,
  source_type text NOT NULL
);
CREATE TABLE public.test_audit_events (
  company_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION private.mfa_requirement_met() RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT current_setting('test.mfa', true) = 'yes'
$$;
CREATE FUNCTION public.has_company_permission(_company_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND _company_id::text = current_setting('test.company', true)
    AND _permission IN ('accounting.view', 'accounting.post')
    AND current_setting('test.post', true) = 'yes'
$$;
CREATE FUNCTION public.record_audit_event(
  _company_id uuid, _action text, _entity_type text,
  _entity_id uuid, _details jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.test_audit_events (company_id, action, entity_type, entity_id)
  VALUES (_company_id, _action, _entity_type, _entity_id);
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth, private, public TO authenticated;
GRANT SELECT ON public.test_audit_events TO authenticated;

INSERT INTO auth.users (id) VALUES
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');
INSERT INTO public.companies (id) VALUES
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');
INSERT INTO public.journals (id, company_id, status, source_type) VALUES
  ('20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', 'posted', 'manual'),
  ('20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002', 'posted', 'manual'),
  ('20000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001', 'draft', 'manual');
