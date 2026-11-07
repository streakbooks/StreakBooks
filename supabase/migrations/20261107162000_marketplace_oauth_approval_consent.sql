-- AS-SEC-02: OAuth PKCE state, security approval queue, consent grant.
-- Additive. FAIL CLOSED: does not enable real_customer_data_enabled.

-- Allow security_review alert type (additive; recreate check)
ALTER TABLE public.marketplace_security_alerts
  DROP CONSTRAINT IF EXISTS marketplace_security_alerts_alert_type_check;
ALTER TABLE public.marketplace_security_alerts
  ADD CONSTRAINT marketplace_security_alerts_alert_type_check CHECK (
    alert_type IN (
      'rate_limit', 'permission_denied', 'token_anomaly', 'webhook_invalid',
      'cross_tenant_attempt', 'suspension', 'consent_revoked', 'abuse_detected',
      'security_review'
    )
  );

-- ---------------------------------------------------------------------------
-- Server-only OAuth PKCE / CSRF state (no client policies)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketplace_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  app_code text NOT NULL REFERENCES public.marketplace_apps(code),
  state text NOT NULL UNIQUE,
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL DEFAULT 'S256' CHECK (code_challenge_method = 'S256'),
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_oauth_states_company_app_idx
  ON public.marketplace_oauth_states (company_id, app_code, created_at DESC);

ALTER TABLE public.marketplace_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_oauth_states FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Security review / administrator approval queue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketplace_security_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_code text NOT NULL REFERENCES public.marketplace_apps(code),
  application_id uuid REFERENCES public.developer_applications(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN (
      'draft',
      'submitted',
      'under_review',
      'changes_requested',
      'approved',
      'rejected'
    )
  ),
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitter_notes text NOT NULL DEFAULT '',
  reviewer_notes text NOT NULL DEFAULT '',
  submitted_by uuid REFERENCES auth.users(id),
  reviewed_by uuid REFERENCES auth.users(id),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_security_reviews_app_status_idx
  ON public.marketplace_security_reviews (app_code, status);

ALTER TABLE public.marketplace_security_reviews ENABLE ROW LEVEL SECURITY;

-- Authenticated members with certification permission can read reviews for published apps.
DROP POLICY IF EXISTS marketplace_security_reviews_cert_read ON public.marketplace_security_reviews;
CREATE POLICY marketplace_security_reviews_cert_read
  ON public.marketplace_security_reviews FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND public.has_company_permission(cm.company_id, 'appstore.manage_certification')
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.marketplace_security_reviews FROM anon, authenticated;
GRANT SELECT ON public.marketplace_security_reviews TO authenticated;

-- ---------------------------------------------------------------------------
-- Consent grant (customer privacy)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_app_connection_consent(
  _company_id uuid,
  _app_code text,
  _connection_id uuid,
  _granted_scopes text[],
  _consent_version text DEFAULT '1'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _consent public.app_connection_consents%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM private.marketplace_rate_limit(
    'consent:' || auth.uid()::text || ':' || _company_id::text,
    40,
    interval '15 minutes'
  );

  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'not a company member' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'appstore.manage_connections') THEN
    RAISE EXCEPTION 'missing manage_connections permission' USING ERRCODE = '42501';
  END IF;

  IF _granted_scopes IS NULL OR cardinality(_granted_scopes) = 0 THEN
    RAISE EXCEPTION 'granted scopes required' USING ERRCODE = '22023';
  END IF;

  IF _connection_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.integration_connections c
      WHERE c.id = _connection_id
        AND c.company_id = _company_id
        AND c.app_code = _app_code
    ) THEN
      RAISE EXCEPTION 'connection not found for company' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  UPDATE public.app_connection_consents
  SET status = 'superseded',
      updated_at = now()
  WHERE company_id = _company_id
    AND app_code = _app_code
    AND status = 'active';

  INSERT INTO public.app_connection_consents (
    company_id, app_code, connection_id, granted_scopes, consented_by, consent_version, status
  ) VALUES (
    _company_id,
    _app_code,
    _connection_id,
    _granted_scopes,
    auth.uid(),
    left(COALESCE(NULLIF(trim(_consent_version), ''), '1'), 40),
    'active'
  )
  RETURNING * INTO _consent;

  PERFORM public.record_audit_event(
    _company_id,
    'marketplace.consent_granted',
    'marketplace_app',
    _consent.id,
    jsonb_build_object(
      'app_code', _app_code,
      'connection_id', _connection_id,
      'granted_scopes', to_jsonb(_granted_scopes),
      'consent_version', _consent.consent_version
    )
  );

  RETURN jsonb_build_object(
    'id', _consent.id,
    'appCode', _consent.app_code,
    'status', _consent.status,
    'grantedScopes', _consent.granted_scopes,
    'consentVersion', _consent.consent_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_app_connection_consent(uuid, text, uuid, text[], text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_app_connection_consent(uuid, text, uuid, text[], text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Submit security review (does NOT flip real_customer_data_enabled)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_marketplace_security_review(
  _app_code text,
  _checklist jsonb,
  _submitter_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.marketplace_security_reviews%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM private.marketplace_rate_limit(
    'sec_review:' || auth.uid()::text,
    20,
    interval '1 hour'
  );

  -- Submitters must own a publisher profile (developer path) OR hold certification permission.
  IF NOT EXISTS (
    SELECT 1 FROM public.developer_publishers p WHERE p.owner_user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND (
        public.has_company_permission(cm.company_id, 'developer.submit_apps')
        OR public.has_company_permission(cm.company_id, 'appstore.manage_certification')
      )
  ) THEN
    RAISE EXCEPTION 'missing security review submit permission' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.marketplace_apps WHERE code = _app_code) THEN
    RAISE EXCEPTION 'app not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.marketplace_security_reviews (
    app_code, status, checklist, submitter_notes, submitted_by, submitted_at
  ) VALUES (
    _app_code,
    'submitted',
    COALESCE(_checklist, '{}'::jsonb),
    left(COALESCE(_submitter_notes, ''), 2000),
    auth.uid(),
    now()
  )
  RETURNING * INTO _row;

  -- Never auto-enable real customer data from a submission.
  UPDATE public.marketplace_apps
  SET security_review_passed = false,
      real_customer_data_enabled = false,
      updated_at = now()
  WHERE code = _app_code;

  RETURN jsonb_build_object(
    'id', _row.id,
    'appCode', _row.app_code,
    'status', _row.status,
    'realCustomerDataEnabled', false,
    'securityReviewPassed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_marketplace_security_review(text, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_marketplace_security_review(text, jsonb, text)
  TO authenticated;

-- Decision RPC: approve security review checklist only — still fail closed for real data
-- unless an explicit separate ops process sets real_customer_data_enabled after E2E.
CREATE OR REPLACE FUNCTION public.decide_marketplace_security_review(
  _review_id uuid,
  _company_id uuid,
  _approve boolean,
  _reviewer_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.marketplace_security_reviews%ROWTYPE;
  _new_status text;
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

  SELECT * INTO _row FROM public.marketplace_security_reviews WHERE id = _review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review not found' USING ERRCODE = 'P0002';
  END IF;

  _new_status := CASE WHEN _approve THEN 'approved' ELSE 'rejected' END;

  UPDATE public.marketplace_security_reviews
  SET status = _new_status,
      reviewer_notes = left(COALESCE(_reviewer_notes, ''), 2000),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  WHERE id = _review_id
  RETURNING * INTO _row;

  IF _approve THEN
    UPDATE public.marketplace_apps
    SET security_review_passed = true,
        security_reviewed_at = now(),
        security_review_notes = left(COALESCE(_reviewer_notes, ''), 2000),
        -- FAIL CLOSED: approval never enables real customer data by itself.
        real_customer_data_enabled = false,
        updated_at = now()
    WHERE code = _row.app_code;
  ELSE
    UPDATE public.marketplace_apps
    SET security_review_passed = false,
        security_reviewed_at = now(),
        security_review_notes = left(COALESCE(_reviewer_notes, ''), 2000),
        real_customer_data_enabled = false,
        updated_at = now()
    WHERE code = _row.app_code;
  END IF;

  INSERT INTO public.marketplace_security_alerts (
    company_id, app_code, severity, alert_type, message, metadata
  ) VALUES (
    _company_id,
    _row.app_code,
    CASE WHEN _approve THEN 'medium' ELSE 'high' END,
    'security_review',
    CASE
      WHEN _approve THEN 'Security review approved; real customer data remains locked.'
      ELSE 'Security review rejected; listing activation blocked.'
    END,
    jsonb_build_object('review_id', _review_id, 'approved', _approve, 'actor', auth.uid())
  );

  PERFORM public.record_audit_event(
    _company_id,
    CASE WHEN _approve THEN 'marketplace.security_review_approved' ELSE 'marketplace.security_review_rejected' END,
    'marketplace_app',
    _review_id,
    jsonb_build_object(
      'app_code', _row.app_code,
      'approved', _approve,
      'real_customer_data_enabled', false
    )
  );

  RETURN jsonb_build_object(
    'id', _row.id,
    'appCode', _row.app_code,
    'status', _row.status,
    'securityReviewPassed', _approve,
    'realCustomerDataEnabled', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.decide_marketplace_security_review(uuid, uuid, boolean, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_marketplace_security_review(uuid, uuid, boolean, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.list_marketplace_security_reviews(_company_id uuid)
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
  IF NOT public.has_company_permission(_company_id, 'appstore.manage_certification') THEN
    RAISE EXCEPTION 'missing manage_certification permission' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r."updatedAt" DESC)
    FROM (
      SELECT
        id,
        app_code AS "appCode",
        application_id AS "applicationId",
        status,
        checklist,
        submitter_notes AS "submitterNotes",
        reviewer_notes AS "reviewerNotes",
        submitted_at AS "submittedAt",
        reviewed_at AS "reviewedAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM public.marketplace_security_reviews
      ORDER BY updated_at DESC
      LIMIT 100
    ) r
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_marketplace_security_reviews(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_marketplace_security_reviews(uuid) TO authenticated;
