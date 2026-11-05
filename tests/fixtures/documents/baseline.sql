-- Isolated PostgreSQL fixture; no live Supabase data involved.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.companies(id uuid PRIMARY KEY);
CREATE TABLE public.test_permissions(company_id uuid, user_id uuid, permission text);
CREATE FUNCTION public.has_company_permission(_company_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (
 SELECT 1 FROM public.test_permissions
 WHERE company_id = _company_id AND user_id = auth.uid() AND permission = _permission
) $$;
CREATE FUNCTION public.is_company_member(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (
 SELECT 1 FROM public.test_permissions
 WHERE company_id = _company_id AND user_id = auth.uid()
) $$;
CREATE FUNCTION public.can_access_attachment(_company_id uuid, _entity_type text, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT
 _entity_type = 'company'
 AND CASE
   WHEN _action = 'view' THEN public.is_company_member(_company_id)
   WHEN _action = 'manage' THEN public.has_company_permission(_company_id, 'sales.draft')
   ELSE false
 END $$;
CREATE TABLE public.document_attachments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id),
 entity_type text NOT NULL,
 file_name text NOT NULL,
 uploaded_by uuid REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.document_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY attachments_read ON public.document_attachments FOR SELECT TO authenticated
USING (public.can_access_attachment(company_id, entity_type, 'view'));
CREATE POLICY attachments_insert ON public.document_attachments FOR INSERT TO authenticated
WITH CHECK (public.can_access_attachment(company_id, entity_type, 'manage'));
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT, INSERT ON public.document_attachments TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
