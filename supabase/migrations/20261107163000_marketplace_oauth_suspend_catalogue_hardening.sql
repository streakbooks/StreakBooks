-- AS-SEC-03: OAuth PKCE state RPCs, platform listing suspend, public catalogue hardening.
-- Additive. FAIL CLOSED: does not enable real_customer_data_enabled.

-- ---------------------------------------------------------------------------
-- Create OAuth PKCE state (authenticated, company-scoped)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_marketplace_oauth_state(
  _company_id uuid,
  _app_code text,
  _redirect_uri text,
  _code_challenge text,
  _state text,
  _ttl_seconds integer DEFAULT 600
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _expires timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM private.marketplace_rate_limit(
    'oauth_state:' || auth.uid()::text || ':' || _company_id::text,
    30,
    interval '15 minutes'
  );

  IF NOT public.is_company_member(_company_id) THEN
    INSERT INTO public.marketplace_security_alerts (
      company_id, app_code, severity, alert_type, message, metadata
    ) VALUES (
      _company_id, _app_code, 'high', 'cross_tenant_attempt',
      'OAuth state create attempted without membership.',
      jsonb_build_object('actor', auth.uid())
    );
    RAISE EXCEPTION 'not a company member' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_company_permission(_company_id, 'appstore.manage_connections') THEN
    RAISE EXCEPTION 'missing manage_connections permission' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.marketplace_apps a
    WHERE a.code = _app_code
      AND a.is_published = true
      AND a.suspended = false
      AND a.real_customer_data_enabled = true
      AND a.security_review_passed = true
      AND a.implementation_status = 'e2e_verified'
  ) THEN
    RAISE EXCEPTION 'FAIL CLOSED: OAuth authorization is locked until security gates pass'
      USING ERRCODE = 'P0001';
  END IF;

  IF _redirect_uri IS NULL OR length(trim(_redirect_uri)) = 0 THEN
    RAISE EXCEPTION 'redirect_uri required' USING ERRCODE = '22023';
  END IF;
  IF _redirect_uri !~* '^https://' AND _redirect_uri !~* '^http://localhost' THEN
    RAISE EXCEPTION 'redirect_uri must be https or localhost' USING ERRCODE = '22023';
  END IF;
  IF _code_challenge IS NULL OR length(trim(_code_challenge)) < 43 THEN
    RAISE EXCEPTION 'invalid code_challenge' USING ERRCODE = '22023';
  END IF;
  IF _state IS NULL OR length(trim(_state)) < 16 THEN
    RAISE EXCEPTION 'invalid state' USING ERRCODE = '22023';
  END IF;

  _expires := now() + make_interval(secs => GREATEST(60, LEAST(COALESCE(_ttl_seconds, 600), 900)));

  INSERT INTO public.marketplace_oauth_states (
    company_id, app_code, state, code_challenge, code_challenge_method,
    redirect_uri, expires_at, created_by
  ) VALUES (
    _company_id, _app_code, trim(_state), trim(_code_challenge), 'S256',
    trim(_redirect_uri), _expires, auth.uid()
  );

  RETURN jsonb_build_object(
    'state', trim(_state),
    'expiresAt', _expires,
    'codeChallengeMethod', 'S256'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_marketplace_oauth_state(uuid, text, text, text, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_marketplace_oauth_state(uuid, text, text, text, text, integer)
  TO authenticated;

-- Consume state once (replay protection). Returns challenge metadata for token exchange.
CREATE OR REPLACE FUNCTION public.consume_marketplace_oauth_state(
  _company_id uuid,
  _app_code text,
  _state text,
  _redirect_uri text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.marketplace_oauth_states%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM private.marketplace_rate_limit(
    'oauth_consume:' || auth.uid()::text || ':' || _company_id::text,
    40,
    interval '15 minutes'
  );

  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'not a company member' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'appstore.manage_connections') THEN
    RAISE EXCEPTION 'missing manage_connections permission' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row
  FROM public.marketplace_oauth_states
  WHERE state = trim(_state)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'oauth state not found' USING ERRCODE = 'P0002';
  END IF;
  IF _row.used_at IS NOT NULL THEN
    INSERT INTO public.marketplace_security_alerts (
      company_id, app_code, severity, alert_type, message, metadata
    ) VALUES (
      _company_id, _app_code, 'high', 'abuse_detected',
      'OAuth state replay attempted.',
      jsonb_build_object('actor', auth.uid())
    );
    RAISE EXCEPTION 'oauth state already used' USING ERRCODE = 'P0001';
  END IF;
  IF _row.expires_at <= now() THEN
    RAISE EXCEPTION 'oauth state expired' USING ERRCODE = 'P0001';
  END IF;
  IF _row.company_id <> _company_id OR _row.app_code <> _app_code THEN
    INSERT INTO public.marketplace_security_alerts (
      company_id, app_code, severity, alert_type, message, metadata
    ) VALUES (
      _company_id, _app_code, 'critical', 'cross_tenant_attempt',
      'OAuth state company/app mismatch.',
      jsonb_build_object('actor', auth.uid(), 'stored_company', _row.company_id)
    );
    RAISE EXCEPTION 'oauth state mismatch' USING ERRCODE = '42501';
  END IF;
  IF _row.redirect_uri <> trim(_redirect_uri) THEN
    RAISE EXCEPTION 'redirect_uri mismatch' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.marketplace_oauth_states
  SET used_at = now()
  WHERE id = _row.id;

  RETURN jsonb_build_object(
    'ok', true,
    'codeChallenge', _row.code_challenge,
    'codeChallengeMethod', _row.code_challenge_method,
    'redirectUri', _row.redirect_uri,
    'appCode', _row.app_code,
    'companyId', _row.company_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_marketplace_oauth_state(uuid, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_marketplace_oauth_state(uuid, text, text, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Platform listing emergency suspend (certification admins)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.suspend_marketplace_app_listing(
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
  IF NOT public.has_company_permission(_company_id, 'appstore.manage_certification') THEN
    RAISE EXCEPTION 'missing manage_certification permission' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 8 THEN
    RAISE EXCEPTION 'suspension reason required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.marketplace_apps
  SET suspended = true,
      real_customer_data_enabled = false,
      security_review_passed = false,
      security_review_notes = left(trim(_reason), 2000),
      updated_at = now()
  WHERE code = _app_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'app not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.app_installations
  SET status = 'disabled',
      disabled_at = now(),
      updated_at = now()
  WHERE app_code = _app_code AND status <> 'disabled';

  UPDATE public.integration_connections
  SET status = 'disconnected',
      credential_ref = NULL,
      last_error = 'Platform listing suspended',
      updated_at = now()
  WHERE app_code = _app_code AND status <> 'disconnected';

  INSERT INTO public.marketplace_security_alerts (
    company_id, app_code, severity, alert_type, message, metadata
  ) VALUES (
    _company_id, _app_code, 'critical', 'suspension',
    'Marketplace listing emergency suspension.',
    jsonb_build_object('actor', auth.uid(), 'reason', left(trim(_reason), 200))
  );

  PERFORM public.record_audit_event(
    _company_id,
    'marketplace.listing_suspended',
    'marketplace_app',
    NULL,
    jsonb_build_object('app_code', _app_code, 'reason', left(trim(_reason), 200))
  );

  RETURN jsonb_build_object(
    'appCode', _app_code,
    'suspended', true,
    'realCustomerDataEnabled', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.suspend_marketplace_app_listing(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suspend_marketplace_app_listing(uuid, text, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Public catalogue: rate-limited + fail-closed flags (never true in response
-- unless actually enabled; seeds stay false). Optional fingerprint for scrape control.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_public_marketplace_catalogue(
  _client_fingerprint text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bucket text;
  _result jsonb;
BEGIN
  _bucket := 'public_catalogue:' ||
    CASE
      WHEN auth.uid() IS NOT NULL THEN 'user:' || auth.uid()::text
      WHEN _client_fingerprint IS NOT NULL AND length(trim(_client_fingerprint)) BETWEEN 8 AND 128
        THEN 'fp:' || left(trim(_client_fingerprint), 128)
      ELSE 'anon'
    END;

  PERFORM private.marketplace_rate_limit(_bucket, 90, interval '1 minute');

  SELECT COALESCE(jsonb_agg(row_to_json(a)::jsonb ORDER BY a."sortOrder"), '[]'::jsonb)
  INTO _result
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
      false AS "realCustomerDataEnabled",
      COALESCE(app.security_review_passed, false) AS "securityReviewPassed",
      COALESCE((
        SELECT array_agg(mac.category_code ORDER BY mac.category_code)
        FROM public.marketplace_app_categories mac
        WHERE mac.app_code = app.code
      ), ARRAY[]::text[]) AS "categoryCodes"
    FROM public.marketplace_apps app
    WHERE app.is_published = true AND app.suspended = false
  ) a;

  RETURN _result;
END;
$$;

-- Replace legacy zero-arg signature so callers use the fingerprint-capable function.
DROP FUNCTION IF EXISTS public.list_public_marketplace_catalogue();

REVOKE ALL ON FUNCTION public.list_public_marketplace_catalogue(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_marketplace_catalogue(text) TO anon, authenticated;
