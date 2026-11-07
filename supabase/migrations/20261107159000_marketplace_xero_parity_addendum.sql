-- AS-XP: Xero-parity addendum foundations (certification, partners, usage, analytics,
-- versions, trust, accountant advisory). Additive. No fabricated metrics.
-- Does not claim Xero-level parity. No marketplace billing activation.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role, permission) VALUES
  ('owner', 'appstore.advise'),
  ('admin', 'appstore.advise'),
  ('accountant', 'appstore.advise'),
  ('owner', 'appstore.manage_certification'),
  ('admin', 'appstore.manage_certification'),
  ('owner', 'developer.partner_manage'),
  ('admin', 'developer.partner_manage'),
  ('owner', 'developer.view_analytics'),
  ('admin', 'developer.view_analytics'),
  ('owner', 'developer.view_usage'),
  ('admin', 'developer.view_usage')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Trust & certification (XP-04, XP-10)
-- ---------------------------------------------------------------------------
ALTER TABLE public.marketplace_apps
  ADD COLUMN IF NOT EXISTS publisher_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS certification_status text NOT NULL DEFAULT 'none'
    CHECK (certification_status IN (
      'none', 'candidate', 'certified', 'recertification_due', 'revoked'
    )),
  ADD COLUMN IF NOT EXISTS certification_tier text
    CHECK (certification_tier IS NULL OR certification_tier IN (
      'security', 'accounting', 'api', 'performance', 'accessibility', 'reliability', 'full'
    )),
  ADD COLUMN IF NOT EXISTS certified_at timestamptz,
  ADD COLUMN IF NOT EXISTS certification_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_disclosure text,
  ADD COLUMN IF NOT EXISTS security_contact_email text,
  ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS api_version text NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS min_linkbooks_api text,
  ADD COLUMN IF NOT EXISTS deprecation_at timestamptz,
  ADD COLUMN IF NOT EXISTS breaking_change_notes text;

CREATE TABLE IF NOT EXISTS public.app_certification_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_code text NOT NULL REFERENCES public.marketplace_apps(code) ON DELETE CASCADE,
  review_type text NOT NULL CHECK (review_type IN (
    'security', 'accounting', 'api', 'performance', 'accessibility', 'reliability', 'full'
  )),
  status text NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'passed', 'failed', 'waived', 'expired')
  ),
  score integer CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by uuid REFERENCES auth.users(id),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_certification_reviews_app_idx
  ON public.app_certification_reviews (app_code, status);

-- ---------------------------------------------------------------------------
-- Versions & compatibility (XP-09)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketplace_app_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_code text NOT NULL REFERENCES public.marketplace_apps(code) ON DELETE CASCADE,
  version text NOT NULL,
  api_version text NOT NULL DEFAULT 'v1',
  release_channel text NOT NULL DEFAULT 'stable' CHECK (
    release_channel IN ('stable', 'beta', 'staged', 'deprecated', 'yanked')
  ),
  release_notes text NOT NULL DEFAULT '',
  breaking_change boolean NOT NULL DEFAULT false,
  compatible_from text,
  compatible_to text,
  published_at timestamptz,
  deprecated_at timestamptz,
  rollback_of uuid REFERENCES public.marketplace_app_versions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_code, version)
);

CREATE INDEX IF NOT EXISTS marketplace_app_versions_app_channel_idx
  ON public.marketplace_app_versions (app_code, release_channel);

-- ---------------------------------------------------------------------------
-- Developer partner program (XP-05)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.developer_partner_tiers (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  api_access_level text NOT NULL CHECK (
    api_access_level IN ('sandbox', 'standard', 'elevated', 'strategic')
  ),
  monthly_request_quota integer NOT NULL DEFAULT 10000 CHECK (monthly_request_quota >= 0),
  connection_quota integer NOT NULL DEFAULT 10 CHECK (connection_quota >= 0),
  support_entitlement text NOT NULL DEFAULT 'community',
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true
);

ALTER TABLE public.developer_publishers
  ADD COLUMN IF NOT EXISTS partner_tier_code text REFERENCES public.developer_partner_tiers(code),
  ADD COLUMN IF NOT EXISTS partner_status text NOT NULL DEFAULT 'none'
    CHECK (partner_status IN (
      'none', 'applied', 'accepted', 'certified', 'suspended', 'terminated'
    )),
  ADD COLUMN IF NOT EXISTS commercial_terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS certified_partner boolean NOT NULL DEFAULT false;

INSERT INTO public.developer_partner_tiers (
  code, name, description, api_access_level, monthly_request_quota, connection_quota,
  support_entitlement, sort_order, is_published
) VALUES
  ('community', 'Community', 'Sandbox and limited production scopes.', 'sandbox', 5000, 5, 'community', 10, true),
  ('build', 'Build', 'Standard production API access.', 'standard', 50000, 25, 'email', 20, true),
  ('scale', 'Scale', 'Elevated quotas and priority support.', 'elevated', 500000, 100, 'priority', 30, true),
  ('strategic', 'Strategic', 'Strategic partnership entitlements.', 'strategic', 5000000, 1000, 'dedicated', 40, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  api_access_level = EXCLUDED.api_access_level,
  monthly_request_quota = EXCLUDED.monthly_request_quota,
  connection_quota = EXCLUDED.connection_quota,
  support_entitlement = EXCLUDED.support_entitlement,
  sort_order = EXCLUDED.sort_order,
  is_published = EXCLUDED.is_published;

-- ---------------------------------------------------------------------------
-- API usage & monetization foundation (XP-06) — metering only; no charges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.developer_api_usage_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid REFERENCES public.developer_publishers(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.developer_applications(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  error_count integer NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  rate_limit_hits integer NOT NULL DEFAULT 0 CHECK (rate_limit_hits >= 0),
  UNIQUE (application_id, usage_date)
);

CREATE TABLE IF NOT EXISTS public.developer_usage_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES public.developer_publishers(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.developer_applications(id) ON DELETE SET NULL,
  alert_type text NOT NULL CHECK (
    alert_type IN ('quota_warning', 'quota_exceeded', 'rate_limit', 'anomaly')
  ),
  message text NOT NULL,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Publisher growth analytics (XP-07) — genuine events only
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketplace_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_code text NOT NULL REFERENCES public.marketplace_apps(code) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'impression', 'detail_view', 'install_request', 'install', 'activation',
    'disconnect', 'review_submit', 'subscription_start', 'subscription_cancel'
  )),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_analytics_events_app_created_idx
  ON public.marketplace_analytics_events (app_code, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_analytics_events_type_idx
  ON public.marketplace_analytics_events (event_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- Accountant app advisory (XP-02)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.firm_app_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  app_code text NOT NULL REFERENCES public.marketplace_apps(code),
  recommended_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'sent', 'client_pending', 'approved', 'rejected', 'withdrawn', 'installed')
  ),
  rationale text NOT NULL DEFAULT '',
  client_response text NOT NULL DEFAULT '',
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, client_company_id, app_code)
);

CREATE INDEX IF NOT EXISTS firm_app_recommendations_firm_status_idx
  ON public.firm_app_recommendations (firm_id, status);
CREATE INDEX IF NOT EXISTS firm_app_recommendations_client_idx
  ON public.firm_app_recommendations (client_company_id, status);

-- ---------------------------------------------------------------------------
-- Quality gates metadata (XP-08)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integration_quality_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_code text NOT NULL REFERENCES public.marketplace_apps(code) ON DELETE CASCADE,
  check_type text NOT NULL CHECK (check_type IN (
    'sandbox', 'reconciliation', 'sync_recovery', 'token_lifecycle',
    'webhook_reliability', 'regression'
  )),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'passed', 'failed', 'blocked')
  ),
  evidence_ref text,
  last_run_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_code, check_type)
);

-- ---------------------------------------------------------------------------
-- Security incidents (XP-10)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketplace_security_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_code text REFERENCES public.marketplace_apps(code) ON DELETE SET NULL,
  publisher_id uuid REFERENCES public.developer_publishers(id) ON DELETE SET NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'reported' CHECK (
    status IN ('reported', 'triaging', 'mitigating', 'resolved', 'disclosed')
  ),
  summary text NOT NULL,
  user_notification_required boolean NOT NULL DEFAULT false,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.app_certification_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_app_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_partner_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_api_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_usage_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_app_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_quality_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_security_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_app_versions_public_read ON public.marketplace_app_versions;
CREATE POLICY marketplace_app_versions_public_read
  ON public.marketplace_app_versions FOR SELECT TO anon, authenticated
  USING (
    release_channel IN ('stable', 'beta', 'deprecated')
    AND EXISTS (
      SELECT 1 FROM public.marketplace_apps a
      WHERE a.code = app_code AND a.is_published = true AND a.suspended = false
    )
  );

DROP POLICY IF EXISTS developer_partner_tiers_public_read ON public.developer_partner_tiers;
CREATE POLICY developer_partner_tiers_public_read
  ON public.developer_partner_tiers FOR SELECT TO anon, authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS firm_app_recommendations_member_read ON public.firm_app_recommendations;
CREATE POLICY firm_app_recommendations_member_read
  ON public.firm_app_recommendations FOR SELECT TO authenticated
  USING (
    (
      public.is_company_member(firm_id)
      AND public.has_company_permission(firm_id, 'appstore.advise')
    )
    OR (
      public.is_company_member(client_company_id)
      AND public.has_company_permission(client_company_id, 'appstore.view')
    )
  );

DROP POLICY IF EXISTS integration_quality_checks_public_read ON public.integration_quality_checks;
CREATE POLICY integration_quality_checks_public_read
  ON public.integration_quality_checks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_apps a
      WHERE a.code = app_code AND a.is_published = true
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.app_certification_reviews FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.marketplace_app_versions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.developer_partner_tiers FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.developer_api_usage_daily FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.developer_usage_alerts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.marketplace_analytics_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.firm_app_recommendations FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.integration_quality_checks FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.marketplace_security_incidents FROM anon, authenticated;

GRANT SELECT ON public.marketplace_app_versions TO anon, authenticated;
GRANT SELECT ON public.developer_partner_tiers TO anon, authenticated;
GRANT SELECT ON public.firm_app_recommendations TO authenticated;
GRANT SELECT ON public.integration_quality_checks TO authenticated;

-- Seed trust defaults for existing native apps (not certified until reviews pass)
UPDATE public.marketplace_apps
SET publisher_verified = true,
    privacy_disclosure = 'LinkBooks first-party connector. External provider terms also apply.',
    security_contact_email = 'security@linkbooks.app',
    updated_at = now()
WHERE kind = 'native' AND publisher_name = 'LinkBooks';

-- Extend catalogue RPC to include trust fields
CREATE OR REPLACE FUNCTION public.list_public_marketplace_catalogue()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(a)::jsonb ORDER BY a."sortOrder"), '[]'::jsonb)
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
      COALESCE((
        SELECT array_agg(mac.category_code ORDER BY mac.category_code)
        FROM public.marketplace_app_categories mac
        WHERE mac.app_code = app.code
      ), ARRAY[]::text[]) AS "categoryCodes"
    FROM public.marketplace_apps app
    WHERE app.is_published = true AND app.suspended = false
  ) a;
$$;

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

CREATE OR REPLACE FUNCTION public.list_firm_app_recommendations(_firm_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_company_member(_firm_id) THEN
    RAISE EXCEPTION 'not a company member' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_firm_id, 'appstore.advise') THEN
    RAISE EXCEPTION 'missing appstore.advise' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r."updatedAt" DESC)
    FROM (
      SELECT
        id,
        firm_id AS "firmId",
        client_company_id AS "clientCompanyId",
        app_code AS "appCode",
        status,
        rationale,
        client_response AS "clientResponse",
        decided_at AS "decidedAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM public.firm_app_recommendations
      WHERE firm_id = _firm_id
    ) r
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_firm_app_recommendations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_firm_app_recommendations(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_marketplace_analytics_event(
  _app_code text,
  _company_id uuid,
  _event_type text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _event_type NOT IN (
    'impression', 'detail_view', 'install_request', 'install', 'activation',
    'disconnect', 'review_submit', 'subscription_start', 'subscription_cancel'
  ) THEN
    RAISE EXCEPTION 'invalid event type' USING ERRCODE = '22023';
  END IF;
  IF _company_id IS NOT NULL AND NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'not a company member' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.marketplace_apps WHERE code = _app_code AND is_published = true
  ) THEN
    RAISE EXCEPTION 'app not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.marketplace_analytics_events (
    app_code, company_id, actor_user_id, event_type, metadata
  ) VALUES (
    _app_code, _company_id, auth.uid(), _event_type, COALESCE(_metadata, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_marketplace_analytics_event(text, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_marketplace_analytics_event(text, uuid, text, jsonb) TO authenticated;
