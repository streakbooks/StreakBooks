-- Synthetic component fixture, NOT a replay of the complete Supabase migration history.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,banned_until timestamptz);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users,not_after timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE public.companies(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,is_demo boolean DEFAULT false,locale text,date_format text,invoice_footer text,theme_color text);
CREATE TABLE public.profiles(id uuid PRIMARY KEY,full_name text,email text);
CREATE TABLE public.company_members(id uuid DEFAULT gen_random_uuid(),company_id uuid,user_id uuid,role text,status text,created_at timestamptz DEFAULT now());
CREATE TABLE public.company_subscriptions(company_id uuid,plan_code text,status text,billing_interval text,trial_ends_at timestamptz,current_period_end timestamptz,cancel_at_period_end boolean);
CREATE TABLE public.billing_events(company_id uuid,event_type text,provider text,created_at timestamptz DEFAULT now());
CREATE TABLE public.billing_features(key text PRIMARY KEY);
CREATE TABLE public.platform_roles(user_id uuid PRIMARY KEY,role text);
CREATE TABLE public.platform_billing_audit(id uuid PRIMARY KEY);
CREATE TABLE public.journals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,journal_date date,status text,source_type text);
ALTER TABLE public.journals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.journals FROM PUBLIC,anon,authenticated;

ALTER TABLE auth.users ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN last_sign_in_at timestamptz;
ALTER TABLE public.companies ADD COLUMN country_code text DEFAULT 'GB', ADD COLUMN base_currency text DEFAULT 'GBP', ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN archived_at timestamptz;
CREATE TABLE public.firms(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,created_at timestamptz DEFAULT now());
CREATE TABLE public.firm_members(firm_id uuid,user_id uuid,role text,created_at timestamptz DEFAULT now());
CREATE TABLE public.firm_client_links(firm_id uuid,company_id uuid,access_level text,revoked_at timestamptz);
