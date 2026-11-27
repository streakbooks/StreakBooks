-- Synthetic billing component fixture. NOT a replay of the full Supabase migration history.
-- Mirrors the live shapes the billing migrations depend on. has_company_permission,
-- customer_access_ok and mfa_requirement_met are verbatim copies of the hosted definitions;
-- private.scoped_permission and private.platform_write_allowed are reduced stubs.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE SCHEMA private;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
  $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE TABLE auth.mfa_factors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users, status text);

CREATE TYPE public.company_role AS ENUM ('owner', 'admin', 'accountant', 'bookkeeper', 'staff', 'read_only');
CREATE TYPE public.membership_status AS ENUM ('active', 'invited', 'suspended');

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  country_code text NOT NULL DEFAULT 'GB',
  base_currency text NOT NULL DEFAULT 'GBP',
  is_demo boolean NOT NULL DEFAULT false
);
CREATE TABLE public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role public.company_role NOT NULL,
  status public.membership_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
CREATE TABLE public.role_permissions (
  role public.company_role NOT NULL,
  permission text NOT NULL,
  PRIMARY KEY (role, permission)
);
INSERT INTO public.role_permissions (role, permission) VALUES
  ('owner', 'billing.manage'), ('admin', 'billing.manage'),
  ('owner', 'company.view'), ('admin', 'company.view'), ('accountant', 'company.view'),
  ('bookkeeper', 'company.view'), ('staff', 'company.view'), ('read_only', 'company.view');
CREATE TABLE public.member_permission_adjustments (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  permission text NOT NULL,
  effect text NOT NULL CHECK (effect IN ('grant', 'deny')),
  PRIMARY KEY (company_id, user_id, permission)
);
CREATE TABLE public.platform_user_controls (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'active',
  require_mfa boolean NOT NULL DEFAULT false,
  revoked_before timestamptz
);
CREATE TABLE public.platform_roles (user_id uuid PRIMARY KEY REFERENCES auth.users(id), role text NOT NULL);

-- Hosted billing audit table and its immutability trigger (20261030140000, 20261030144257).
CREATE TABLE public.platform_billing_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION private.immutable_platform_audit() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Platform audit records are append-only' USING ERRCODE = '42501'; END $$;
CREATE TRIGGER platform_billing_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.platform_billing_audit
  FOR EACH STATEMENT EXECUTE FUNCTION private.immutable_platform_audit();
ALTER TABLE public.platform_billing_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_billing_audit FROM PUBLIC, anon, authenticated;

-- Verbatim hosted definitions.
CREATE FUNCTION private.mfa_requirement_met() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      OR NOT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = auth.uid() AND f.status = 'verified');
$$;
CREATE FUNCTION private.customer_access_ok() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.platform_user_controls c WHERE c.user_id=auth.uid()
 AND (c.status<>'active' OR (c.require_mfa AND coalesce(auth.jwt()->>'aal','aal1')<>'aal2')
 OR (c.revoked_before IS NOT NULL AND to_timestamp((auth.jwt()->>'iat')::double precision)<=c.revoked_before)))
 AND private.mfa_requirement_met();
$$;

-- Reduced stubs: no platform-scoped grants; writes allowed unless the company is named 'Suspended Co'.
CREATE FUNCTION private.scoped_permission(_company_id uuid, _permission text) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION private.platform_write_allowed(_company_id uuid, _module text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS
  $$ SELECT NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = _company_id AND c.name = 'Suspended Co') $$;
CREATE FUNCTION private.platform_can(_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(auth.jwt()->>'aal' = 'aal2'
    AND EXISTS (SELECT 1 FROM public.platform_roles r WHERE r.user_id = auth.uid()
                AND r.role IN ('platform_owner', 'platform_finance')), false);
$$;

CREATE FUNCTION public.has_company_permission(_company_id uuid, _permission text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT private.customer_access_ok() AND (
    private.scoped_permission(_company_id, _permission)
    OR (
      (
        EXISTS (
          SELECT 1 FROM public.company_members m JOIN public.role_permissions r ON r.role = m.role
          WHERE m.company_id = _company_id AND m.user_id = auth.uid() AND m.status = 'active' AND r.permission = _permission)
        OR EXISTS (
          SELECT 1 FROM public.member_permission_adjustments a
          JOIN public.company_members m ON m.company_id = a.company_id AND m.user_id = a.user_id
          WHERE a.company_id = _company_id AND a.user_id = auth.uid() AND m.status = 'active'
            AND m.role <> 'owner' AND a.effect = 'grant' AND a.permission = _permission)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.member_permission_adjustments a
        JOIN public.company_members m ON m.company_id = a.company_id AND m.user_id = a.user_id
        WHERE a.company_id = _company_id AND a.user_id = auth.uid() AND m.status = 'active'
          AND m.role <> 'owner' AND a.effect = 'deny' AND a.permission = _permission)
    )
  )
  AND (
    _permission ~ '\.(view|export)$'
    OR private.platform_write_allowed(_company_id,
      CASE split_part(_permission, '.', 1) WHEN 'purchases' THEN 'purchases' WHEN 'sales' THEN 'sales'
        WHEN 'banking' THEN 'banking' ELSE 'accounting' END)
  );
$function$;
GRANT EXECUTE ON FUNCTION public.has_company_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.customer_access_ok(), private.mfa_requirement_met() TO authenticated;

-- Practice firms and the partner directory (20261102310000_partners.sql), as live.
CREATE TYPE public.firm_member_role AS ENUM ('owner', 'admin', 'member');
CREATE TABLE public.firms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.firm_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.firm_member_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, user_id)
);
CREATE TABLE public.platform_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 2 AND 80),
  revenue_share_minor integer CHECK (revenue_share_minor IS NULL OR revenue_share_minor >= 0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_partners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_partners FROM PUBLIC, anon, authenticated;

-- Hash-only platform API keys (20261102200000_platform_api_keys.sql), as live.
CREATE TABLE public.platform_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  key_hash text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz
);
ALTER TABLE public.platform_api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_api_keys FROM PUBLIC, anon, authenticated;

-- Stored MRR movements (20261102140000_mrr_movements.sql), as live.
CREATE TABLE public.mrr_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  currency text NOT NULL,
  previous_mrr_minor bigint NOT NULL CHECK (previous_mrr_minor >= 0),
  current_mrr_minor bigint NOT NULL CHECK (current_mrr_minor >= 0),
  movement text NOT NULL CHECK (movement IN ('baseline', 'new', 'expansion', 'contraction', 'churn')),
  delta_minor bigint NOT NULL,
  captured_by uuid
);
ALTER TABLE public.mrr_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mrr_movements FROM PUBLIC, anon, authenticated;

-- Existing data present before the billing migrations run (exercises the backfill).
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'owner-a@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin-a@example.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'staff-a@example.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'accountant-a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner-b@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'solo@example.test'),
  ('00000000-0000-0000-0000-0000000000f1', 'platform-finance@example.test');
INSERT INTO public.companies (id, name, created_by, country_code) VALUES
  ('10000000-0000-0000-0000-00000000000a', 'Alpha Ltd', '00000000-0000-0000-0000-0000000000a1', 'GB'),
  ('10000000-0000-0000-0000-00000000000b', 'Beta Pvt Ltd', '00000000-0000-0000-0000-0000000000b1', 'IN');
INSERT INTO public.company_members (company_id, user_id, role, status) VALUES
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'owner', 'active'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'admin', 'active'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a3', 'staff', 'active'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a4', 'accountant', 'active'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'owner', 'active');
INSERT INTO public.platform_roles (user_id, role) VALUES ('00000000-0000-0000-0000-0000000000f1', 'platform_finance');
INSERT INTO public.platform_billing_audit (action, entity_type, entity_id) VALUES ('legacy.refund', 'payment', 'pre-existing');
