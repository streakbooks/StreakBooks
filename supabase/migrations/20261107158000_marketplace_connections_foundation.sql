-- AS-02: Integration connections foundation (no recoverable secrets in this table).
-- Additive. Token material must use a future vault / encrypted references only.
-- No fake connected status for unverified connectors.

CREATE TABLE IF NOT EXISTS public.integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  app_code text NOT NULL REFERENCES public.marketplace_apps(code),
  installation_id uuid REFERENCES public.app_installations(id) ON DELETE SET NULL,
  provider text NOT NULL,
  external_account_label text,
  external_account_id text,
  auth_method text NOT NULL CHECK (
    auth_method IN ('oauth2', 'api_key', 'partner_oauth', 'none')
  ),
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'disconnected' CHECK (
    status IN ('disconnected', 'pending', 'connected', 'error', 'paused')
  ),
  health text NOT NULL DEFAULT 'unknown' CHECK (
    health IN ('unknown', 'healthy', 'degraded', 'unhealthy')
  ),
  token_expires_at timestamptz,
  last_validated_at timestamptz,
  last_successful_sync_at timestamptz,
  last_error text,
  -- Opaque reference only — never store access/refresh tokens here.
  credential_ref text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, app_code, external_account_id)
);

CREATE INDEX IF NOT EXISTS integration_connections_company_status_idx
  ON public.integration_connections (company_id, status);
CREATE INDEX IF NOT EXISTS integration_connections_app_code_idx
  ON public.integration_connections (app_code);

CREATE TABLE IF NOT EXISTS public.app_install_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  app_code text NOT NULL REFERENCES public.marketplace_apps(code),
  requested_by uuid REFERENCES auth.users(id),
  approver_id uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'submitted' CHECK (
    status IN ('draft', 'submitted', 'pending_approval', 'approved', 'rejected', 'cancelled')
  ),
  justification text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  required_permissions text[] NOT NULL DEFAULT '{}',
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_install_requests_company_status_idx
  ON public.app_install_requests (company_id, status);

ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_install_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integration_connections_member_read ON public.integration_connections;
CREATE POLICY integration_connections_member_read
  ON public.integration_connections FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      public.has_company_permission(company_id, 'appstore.view')
      OR public.has_company_permission(company_id, 'appstore.manage_connections')
    )
  );

DROP POLICY IF EXISTS app_install_requests_member_read ON public.app_install_requests;
CREATE POLICY app_install_requests_member_read
  ON public.app_install_requests FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      public.has_company_permission(company_id, 'appstore.view')
      OR public.has_company_permission(company_id, 'appstore.request_install')
      OR public.has_company_permission(company_id, 'appstore.install')
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.integration_connections FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.app_install_requests FROM anon, authenticated;
GRANT SELECT ON public.integration_connections TO authenticated;
GRANT SELECT ON public.app_install_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.list_company_integration_connections(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'not a company member' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'appstore.view')
    OR public.has_company_permission(_company_id, 'appstore.manage_connections')
  ) THEN
    RAISE EXCEPTION 'missing connection view permission' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(c)::jsonb ORDER BY c."updatedAt" DESC)
    FROM (
      SELECT
        id,
        company_id AS "companyId",
        app_code AS "appCode",
        installation_id AS "installationId",
        provider,
        external_account_label AS "externalAccountLabel",
        external_account_id AS "externalAccountId",
        auth_method AS "authMethod",
        scopes,
        status,
        health,
        token_expires_at AS "tokenExpiresAt",
        last_validated_at AS "lastValidatedAt",
        last_successful_sync_at AS "lastSuccessfulSyncAt",
        last_error AS "lastError",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM public.integration_connections
      WHERE company_id = _company_id
    ) c
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_company_integration_connections(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_company_integration_connections(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_company_app_install_requests(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'not a company member' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'appstore.view')
    OR public.has_company_permission(_company_id, 'appstore.request_install')
    OR public.has_company_permission(_company_id, 'appstore.install')
  ) THEN
    RAISE EXCEPTION 'missing request view permission' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r."createdAt" DESC)
    FROM (
      SELECT
        id,
        company_id AS "companyId",
        app_code AS "appCode",
        status,
        justification,
        remarks,
        required_permissions AS "requiredPermissions",
        requested_by AS "requestedBy",
        approver_id AS "approverId",
        decided_at AS "decidedAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM public.app_install_requests
      WHERE company_id = _company_id
    ) r
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_company_app_install_requests(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_company_app_install_requests(uuid) TO authenticated;
