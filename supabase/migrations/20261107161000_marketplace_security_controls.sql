-- AS-SEC: Zero-trust marketplace security controls.
-- Additive. FAIL CLOSED: real customer data access stays disabled until
-- e2e_verified + security_review_passed + real_customer_data_enabled.
-- Never exposes service-role keys. Strengthens rate limits, consent and revocation.

-- ---------------------------------------------------------------------------
-- Activation / security gates on catalogue
-- ---------------------------------------------------------------------------
ALTER TABLE public.marketplace_apps
  ADD COLUMN IF NOT EXISTS real_customer_data_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS security_review_passed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS security_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS security_review_notes text;

-- Fail closed for every seeded app (including natives).
UPDATE public.marketplace_apps
SET real_customer_data_enabled = false,
    security_review_passed = false,
    updated_at = now()
WHERE real_customer_data_enabled IS DISTINCT FROM false
   OR security_review_passed IS DISTINCT FROM false;

COMMENT ON COLUMN public.marketplace_apps.real_customer_data_enabled IS
  'FAIL CLOSED. Must remain false until authorization, isolation and security controls are verified.';

-- ---------------------------------------------------------------------------
-- Rate limiting (anti-spam / anti-abuse)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketplace_rate_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_rate_events_bucket_created_idx
  ON public.marketplace_rate_events (bucket, created_at DESC);

ALTER TABLE public.marketplace_rate_events ENABLE ROW LEVEL SECURITY;
-- No policies / no grants for callers — only SECURITY DEFINER helper (deny-all).
REVOKE ALL ON public.marketplace_rate_events FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.marketplace_rate_limit(
  _bucket text,
  _max integer,
  _window interval
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n integer;
BEGIN
  IF _bucket IS NULL OR length(trim(_bucket)) = 0 THEN
    RAISE EXCEPTION 'invalid rate limit bucket' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.marketplace_rate_events
  WHERE bucket = _bucket AND created_at < now() - _window;
  SELECT count(*)::integer INTO _n
  FROM public.marketplace_rate_events
  WHERE bucket = _bucket AND created_at >= now() - _window;
  IF _n >= _max THEN
    RAISE EXCEPTION 'Too many marketplace attempts. Wait and try again.'
      USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.marketplace_rate_events (bucket) VALUES (_bucket);
END;
$$;

REVOKE ALL ON FUNCTION private.marketplace_rate_limit(text, integer, interval)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Customer consent & permission visibility
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_connection_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  app_code text NOT NULL REFERENCES public.marketplace_apps(code),
  connection_id uuid REFERENCES public.integration_connections(id) ON DELETE SET NULL,
  granted_scopes text[] NOT NULL DEFAULT '{}',
  consented_by uuid REFERENCES auth.users(id),
  consent_version text NOT NULL DEFAULT '1',
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'revoked', 'expired', 'superseded')
  ),
  consented_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id),
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_connection_consents_company_status_idx
  ON public.app_connection_consents (company_id, status);

ALTER TABLE public.app_connection_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_connection_consents_member_read ON public.app_connection_consents;
CREATE POLICY app_connection_consents_member_read
  ON public.app_connection_consents FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      public.has_company_permission(company_id, 'appstore.view')
      OR public.has_company_permission(company_id, 'appstore.manage_connections')
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.app_connection_consents FROM anon, authenticated;
GRANT SELECT ON public.app_connection_consents TO authenticated;

-- ---------------------------------------------------------------------------
-- Suspicious activity / security alerts (company-scoped)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketplace_security_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  app_code text REFERENCES public.marketplace_apps(code) ON DELETE SET NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  alert_type text NOT NULL CHECK (alert_type IN (
    'rate_limit', 'permission_denied', 'token_anomaly', 'webhook_invalid',
    'cross_tenant_attempt', 'suspension', 'consent_revoked', 'abuse_detected'
  )),
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_security_alerts_company_created_idx
  ON public.marketplace_security_alerts (company_id, created_at DESC);

ALTER TABLE public.marketplace_security_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_security_alerts_member_read ON public.marketplace_security_alerts;
CREATE POLICY marketplace_security_alerts_member_read
  ON public.marketplace_security_alerts FOR SELECT TO authenticated
  USING (
    company_id IS NOT NULL
    AND public.is_company_member(company_id)
    AND (
      public.has_company_permission(company_id, 'appstore.view')
      OR public.has_company_permission(company_id, 'audit.view')
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.marketplace_security_alerts FROM anon, authenticated;
GRANT SELECT ON public.marketplace_security_alerts TO authenticated;

-- ---------------------------------------------------------------------------
-- Harden install request: rate limit + fail-closed real-data activation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_marketplace_app_install(
  _company_id uuid,
  _app_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app_row public.marketplace_apps%ROWTYPE;
  inst public.app_installations%ROWTYPE;
  can_activate boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM private.marketplace_rate_limit(
    'install:' || auth.uid()::text || ':' || _company_id::text,
    20,
    interval '15 minutes'
  );

  IF NOT public.is_company_member(_company_id) THEN
    INSERT INTO public.marketplace_security_alerts (
      company_id, app_code, severity, alert_type, message, metadata
    ) VALUES (
      _company_id, _app_code, 'high', 'cross_tenant_attempt',
      'Install attempted without company membership.',
      jsonb_build_object('actor', auth.uid())
    );
    RAISE EXCEPTION 'not a company member' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_company_permission(_company_id, 'appstore.request_install')
    OR public.has_company_permission(_company_id, 'appstore.install')
  ) THEN
    INSERT INTO public.marketplace_security_alerts (
      company_id, app_code, severity, alert_type, message, metadata
    ) VALUES (
      _company_id, _app_code, 'medium', 'permission_denied',
      'Install attempted without marketplace permission.',
      jsonb_build_object('actor', auth.uid())
    );
    RAISE EXCEPTION 'missing install permission' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO app_row
  FROM public.marketplace_apps
  WHERE code = _app_code AND is_published = true AND suspended = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'app not found or suspended' USING ERRCODE = 'P0002';
  END IF;

  -- FAIL CLOSED: real customer activation requires all three gates.
  can_activate :=
    app_row.implementation_status = 'e2e_verified'
    AND app_row.security_review_passed = true
    AND app_row.real_customer_data_enabled = true
    AND public.has_company_permission(_company_id, 'appstore.install');

  IF can_activate THEN
    INSERT INTO public.app_installations (company_id, app_code, status, installed_by, installed_at)
    VALUES (_company_id, _app_code, 'installed', auth.uid(), now())
    ON CONFLICT (company_id, app_code) DO UPDATE SET
      status = 'installed',
      installed_by = auth.uid(),
      installed_at = COALESCE(public.app_installations.installed_at, now()),
      disabled_at = NULL,
      last_error = NULL,
      updated_at = now()
    RETURNING * INTO inst;
  ELSE
    INSERT INTO public.app_installations (company_id, app_code, status, installed_by)
    VALUES (_company_id, _app_code, 'requested', auth.uid())
    ON CONFLICT (company_id, app_code) DO UPDATE SET
      status = CASE
        WHEN public.app_installations.status = 'installed' THEN public.app_installations.status
        ELSE 'requested'
      END,
      updated_at = now()
    RETURNING * INTO inst;
  END IF;

  PERFORM public.record_audit_event(
    _company_id,
    CASE WHEN inst.status = 'installed' THEN 'marketplace.installed' ELSE 'marketplace.install_requested' END,
    'marketplace_app',
    inst.id,
    jsonb_build_object(
      'app_code', _app_code,
      'implementation_status', app_row.implementation_status,
      'security_review_passed', app_row.security_review_passed,
      'real_customer_data_enabled', app_row.real_customer_data_enabled,
      'can_activate', can_activate,
      'status', inst.status
    )
  );

  RETURN jsonb_build_object(
    'id', inst.id,
    'appCode', inst.app_code,
    'status', inst.status,
    'implementationStatus', app_row.implementation_status,
    'realCustomerDataEnabled', app_row.real_customer_data_enabled,
    'securityReviewPassed', app_row.security_review_passed,
    'canActivate', can_activate
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_marketplace_app_install(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_marketplace_app_install(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Consent listing + revoke connection (customer privacy controls)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_company_app_consents(_company_id uuid)
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
    RAISE EXCEPTION 'missing consent view permission' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(c)::jsonb ORDER BY c."consentedAt" DESC)
    FROM (
      SELECT
        id,
        company_id AS "companyId",
        app_code AS "appCode",
        connection_id AS "connectionId",
        granted_scopes AS "grantedScopes",
        status,
        consent_version AS "consentVersion",
        consented_at AS "consentedAt",
        revoked_at AS "revokedAt",
        revoke_reason AS "revokeReason"
      FROM public.app_connection_consents
      WHERE company_id = _company_id
    ) c
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_company_app_consents(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_company_app_consents(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_marketplace_app_access(
  _company_id uuid,
  _app_code text,
  _reason text DEFAULT 'customer_revoked'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conn_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM private.marketplace_rate_limit(
    'revoke:' || auth.uid()::text || ':' || _company_id::text,
    30,
    interval '15 minutes'
  );

  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'not a company member' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'appstore.manage_connections') THEN
    RAISE EXCEPTION 'missing manage_connections permission' USING ERRCODE = '42501';
  END IF;

  UPDATE public.app_installations
  SET status = 'disabled',
      disabled_at = now(),
      updated_at = now()
  WHERE company_id = _company_id AND app_code = _app_code;

  UPDATE public.integration_connections
  SET status = 'disconnected',
      health = 'unknown',
      credential_ref = NULL,
      last_error = 'Access revoked by organisation administrator',
      updated_at = now()
  WHERE company_id = _company_id AND app_code = _app_code;

  GET DIAGNOSTICS _conn_count = ROW_COUNT;

  UPDATE public.app_connection_consents
  SET status = 'revoked',
      revoked_at = now(),
      revoked_by = auth.uid(),
      revoke_reason = left(COALESCE(_reason, 'customer_revoked'), 200),
      updated_at = now()
  WHERE company_id = _company_id
    AND app_code = _app_code
    AND status = 'active';

  INSERT INTO public.marketplace_security_alerts (
    company_id, app_code, severity, alert_type, message, metadata
  ) VALUES (
    _company_id, _app_code, 'medium', 'consent_revoked',
    'Marketplace access revoked for application.',
    jsonb_build_object('actor', auth.uid(), 'connections_updated', _conn_count)
  );

  PERFORM public.record_audit_event(
    _company_id,
    'marketplace.access_revoked',
    'marketplace_app',
    NULL,
    jsonb_build_object('app_code', _app_code, 'reason', _reason)
  );

  RETURN jsonb_build_object(
    'appCode', _app_code,
    'revoked', true,
    'connectionsUpdated', _conn_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_marketplace_app_access(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_marketplace_app_access(uuid, text, text) TO authenticated;

-- Emergency suspend listing (organisation cannot unsuspend platform listing;
-- owners with manage_certification may request via audit only — platform ops later).
CREATE OR REPLACE FUNCTION public.suspend_marketplace_app_for_company(
  _company_id uuid,
  _app_code text,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'not a company member' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'appstore.manage_connections')
    OR public.has_company_permission(_company_id, 'appstore.install')
  ) THEN
    RAISE EXCEPTION 'missing suspension permission' USING ERRCODE = '42501';
  END IF;

  PERFORM public.revoke_marketplace_app_access(_company_id, _app_code, _reason);

  INSERT INTO public.marketplace_security_alerts (
    company_id, app_code, severity, alert_type, message, metadata
  ) VALUES (
    _company_id, _app_code, 'high', 'suspension',
    'Emergency organisation-level application suspension.',
    jsonb_build_object('actor', auth.uid(), 'reason', left(COALESCE(_reason, ''), 200))
  );

  RETURN jsonb_build_object('appCode', _app_code, 'suspendedForCompany', true);
END;
$$;

REVOKE ALL ON FUNCTION public.suspend_marketplace_app_for_company(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suspend_marketplace_app_for_company(uuid, text, text)
  TO authenticated;

-- Ensure company-scoped catalogue RPCs are not callable by anon
REVOKE ALL ON FUNCTION public.list_company_marketplace_apps(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_company_marketplace_apps(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_company_integration_connections(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_company_integration_connections(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_company_sync_jobs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_company_sync_jobs(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_firm_app_recommendations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_firm_app_recommendations(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.record_marketplace_analytics_event(text, uuid, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_marketplace_analytics_event(text, uuid, text, jsonb)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Expose fail-closed gates on company catalogue (never default true)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_company_marketplace_apps(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'not a company member' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'appstore.view') THEN
    RAISE EXCEPTION 'missing appstore.view' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(a)::jsonb ORDER BY a."sortOrder"), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      app.code,
      app.name,
      app.headline,
      app.description,
      app.publisher_name AS "publisherName",
      app.publisher_website AS "publisherWebsite",
      app.kind,
      app.native_priority AS "nativePriority",
      app.implementation_status AS "implementationStatus",
      app.blocker_notes AS "blockerNotes",
      app.pricing_model AS "pricingModel",
      app.countries,
      app.modules,
      app.sync_capabilities AS "syncCapabilities",
      app.auth_methods AS "authMethods",
      app.requested_api_scopes AS "requestedApiScopes",
      app.featured,
      app.recommended,
      app.recently_added AS "recentlyAdded",
      app.sort_order AS "sortOrder",
      app.documentation_url AS "documentationUrl",
      app.privacy_policy_url AS "privacyPolicyUrl",
      app.support_url AS "supportUrl",
      app.publisher_verified AS "publisherVerified",
      app.certification_status AS "certificationStatus",
      app.certification_tier AS "certificationTier",
      app.certification_expires_at AS "certificationExpiresAt",
      app.privacy_disclosure AS "privacyDisclosure",
      app.suspended,
      app.api_version AS "apiVersion",
      app.min_linkbooks_api AS "minLinkbooksApi",
      app.deprecation_at AS "deprecationAt",
      app.breaking_change_notes AS "breakingChangeNotes",
      COALESCE(app.real_customer_data_enabled, false) AS "realCustomerDataEnabled",
      COALESCE(app.security_review_passed, false) AS "securityReviewPassed",
      COALESCE((
        SELECT array_agg(mac.category_code ORDER BY mac.category_code)
        FROM public.marketplace_app_categories mac
        WHERE mac.app_code = app.code
      ), ARRAY[]::text[]) AS "categoryCodes",
      CASE
        WHEN inst.id IS NULL THEN 'not_installed'
        WHEN inst.status = 'disabled' THEN 'disabled'
        WHEN inst.status = 'error' THEN 'error'
        WHEN inst.status IN ('installed', 'installing', 'requested') THEN 'installed'
        ELSE 'not_installed'
      END AS "installStatus",
      inst.id AS "installId",
      COALESCE((
        SELECT conn.status
        FROM public.integration_connections conn
        WHERE conn.company_id = _company_id AND conn.app_code = app.code
        ORDER BY conn.updated_at DESC
        LIMIT 1
      ), 'disconnected') AS "connectionStatus",
      COALESCE((
        SELECT conn.health
        FROM public.integration_connections conn
        WHERE conn.company_id = _company_id AND conn.app_code = app.code
        ORDER BY conn.updated_at DESC
        LIMIT 1
      ), 'unknown') AS "connectionHealth"
    FROM public.marketplace_apps app
    LEFT JOIN public.app_installations inst
      ON inst.app_code = app.code AND inst.company_id = _company_id
    WHERE app.is_published = true AND app.suspended = false
  ) a;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_company_marketplace_apps(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_company_marketplace_apps(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_company_marketplace_security_alerts(_company_id uuid)
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
    OR public.has_company_permission(_company_id, 'audit.view')
  ) THEN
    RAISE EXCEPTION 'missing security alert view permission' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(a)::jsonb ORDER BY a."createdAt" DESC)
    FROM (
      SELECT
        id,
        company_id AS "companyId",
        app_code AS "appCode",
        severity,
        alert_type AS "alertType",
        message,
        metadata,
        acknowledged_at AS "acknowledgedAt",
        created_at AS "createdAt"
      FROM public.marketplace_security_alerts
      WHERE company_id = _company_id
      ORDER BY created_at DESC
      LIMIT 100
    ) a
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_company_marketplace_security_alerts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_company_marketplace_security_alerts(uuid) TO authenticated;
