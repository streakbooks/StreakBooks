-- Enforce feature rollouts in winning_entitlements.
-- An ended rollout stops gating. An active rollout can deny a plan or catalogue
-- default. Grants, add-ons, trials, revokes, suspension and kill switches are unchanged.
-- Internal mode uses the rollout allowlist. is_demo is not consulted.
-- Reverse: reapply public.winning_entitlements from 20261102120000_entitlement_price_book.sql
-- and drop public.rollout_bucket and public.rollout_decision.
-- golden 11111111-1111-1111-1111-111111111111:ai_queries=5

CREATE OR REPLACE FUNCTION public.rollout_bucket(_organisation text, _feature text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  value text := _organisation || ':' || _feature;
  hash bigint := 0;
  i integer;
BEGIN
  FOR i IN 1..char_length(value) LOOP
    hash := mod(hash * 31 + ascii(substr(value, i, 1)), 4294967296);
  END LOOP;
  RETURN (hash % 100)::integer;
END;
$$;

CREATE OR REPLACE FUNCTION public.rollout_decision(
  _mode text,
  _percent integer,
  _organisation text,
  _company_id uuid,
  _feature text,
  _allowlist uuid[],
  _region text,
  _target_region text,
  _trialing boolean,
  _starts timestamptz,
  _ends timestamptz,
  _now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  bucket integer;
  percent integer;
BEGIN
  IF _ends IS NOT NULL AND _ends <= _now THEN
    RETURN jsonb_build_object('included', true, 'reason', 'Rollout has ended and no longer gates the feature.');
  END IF;
  IF _mode = 'killed' THEN
    RETURN jsonb_build_object('included', false, 'reason', 'Global kill switch.');
  END IF;
  IF _mode = 'scheduled' THEN
    IF _starts IS NOT NULL AND _starts > _now THEN
      RETURN jsonb_build_object('included', false, 'reason', 'Rollout has not started.');
    END IF;
    RETURN jsonb_build_object('included', true, 'reason', 'Scheduled window is open.');
  END IF;
  IF _mode = 'percentage' THEN
    bucket := public.rollout_bucket(_organisation, _feature);
    percent := least(100, greatest(0, coalesce(_percent, 0)));
    IF bucket < percent THEN
      RETURN jsonb_build_object('included', true, 'reason', 'Bucket ' || bucket || ' is inside ' || percent || '%.');
    END IF;
    RETURN jsonb_build_object('included', false, 'reason', 'Bucket ' || bucket || ' is outside ' || percent || '%.');
  END IF;
  IF _mode IN ('allowlist', 'internal') THEN
    IF _company_id = ANY(coalesce(_allowlist, '{}')) THEN
      RETURN jsonb_build_object('included', true, 'reason', CASE WHEN _mode = 'internal' THEN 'Internal group.' ELSE 'Organisation is on the allowlist.' END);
    END IF;
    RETURN jsonb_build_object('included', false, 'reason', CASE WHEN _mode = 'internal' THEN 'Not an internal organisation.' ELSE 'Organisation is not on the allowlist.' END);
  END IF;
  IF _mode = 'trial' THEN
    IF _trialing THEN
      RETURN jsonb_build_object('included', true, 'reason', 'Trial organisation.');
    END IF;
    RETURN jsonb_build_object('included', false, 'reason', 'Not on a trial.');
  END IF;
  IF _mode = 'region' THEN
    IF _region IS NOT NULL AND _region = _target_region THEN
      RETURN jsonb_build_object('included', true, 'reason', 'Region ' || _region || '.');
    END IF;
    RETURN jsonb_build_object('included', false, 'reason', 'Region does not match.');
  END IF;
  IF _mode = 'immediate' THEN
    RETURN jsonb_build_object('included', true, 'reason', 'Immediate rollout.');
  END IF;
  RETURN jsonb_build_object('included', false, 'reason', 'Unknown rollout mode.');
END;
$$;

REVOKE ALL ON FUNCTION public.rollout_bucket(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rollout_decision(text, integer, text, uuid, text, uuid[], text, text, boolean, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.winning_entitlements(_company_id uuid, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _plan text;
  _version uuid;
  _result jsonb;
  _region text;
  _trialing boolean;
  _patch record;
  _roll public.feature_rollouts%ROWTYPE;
  _decision jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_company_member(_company_id) AND public.platform_role() IS NULL THEN
    RAISE EXCEPTION 'You do not have access to that organisation.';
  END IF;
  SELECT plan_code, price_version_id INTO _plan, _version
  FROM public.company_subscriptions WHERE company_id = _company_id;
  IF _version IS NULL AND _plan IS NOT NULL THEN
    SELECT id INTO _version FROM public.plan_versions
    WHERE plan_code = _plan AND status = 'published'
    ORDER BY version_no DESC LIMIT 1;
  END IF;
  SELECT coalesce(jsonb_object_agg(feature_key, jsonb_build_object(
    'allowed', effect = 'allow',
    'source', source,
    'scope', scope,
    'reason', reason,
    'limit', limit_value
  )), '{}'::jsonb)
  INTO _result
  FROM (
    SELECT DISTINCT ON (feature_key)
      feature_key, effect, source, scope, reason, limit_value
    FROM (
      SELECT o.feature_key, o.effect, o.source, o.scope, o.reason, o.limit_value,
        CASE o.source
          WHEN 'kill_switch' THEN 1 WHEN 'suspension' THEN 2 WHEN 'revoke' THEN 3
          WHEN 'grant' THEN 4 WHEN 'addon' THEN 5 WHEN 'trial' THEN 6 WHEN 'plan' THEN 7 ELSE 8
        END AS source_rank,
        CASE o.scope
          WHEN 'user' THEN 1 WHEN 'business' THEN 2 WHEN 'firm' THEN 3 WHEN 'plan' THEN 4 ELSE 5
        END AS scope_rank
      FROM public.entitlement_overrides o
      WHERE o.approval_status = 'approved'
        AND (o.starts_at IS NULL OR o.starts_at <= now())
        AND (o.expires_at IS NULL OR o.expires_at > now())
        AND (
          o.scope = 'global'
          OR (o.scope = 'plan' AND o.plan_code = _plan)
          OR (o.scope = 'business' AND o.scope_id = _company_id)
          OR (o.scope = 'user' AND _user_id IS NOT NULL AND o.scope_id = _user_id)
          OR (o.scope = 'firm' AND o.scope_id IN (
            SELECT l.firm_id FROM public.firm_client_links l
            WHERE l.company_id = _company_id AND l.revoked_at IS NULL
          ))
        )
      UNION ALL
      SELECT l.feature_key,
        CASE WHEN l.enabled THEN 'allow' ELSE 'deny' END,
        'plan', 'plan', 'Included on the subscribed plan version.', l.limit_value,
        7, 4
      FROM public.plan_version_limits l
      WHERE l.version_id = _version
      UNION ALL
      SELECT f.key, 'deny', 'suspension', 'business',
        'The business is suspended. Records stay available to read.', NULL::bigint,
        2, 2
      FROM public.billing_features f
      WHERE EXISTS (
        SELECT 1 FROM public.platform_tenant_controls t
        WHERE t.company_id = _company_id AND t.status = 'suspended'
      )
      UNION ALL
      SELECT r.feature_key, 'deny', 'kill_switch', 'global', 'Global kill switch.', NULL::bigint, 1, 5
      FROM public.feature_rollouts r
      WHERE r.mode = 'killed' AND (r.ends_at IS NULL OR r.ends_at > now())
      UNION ALL
      SELECT f.key,
        CASE WHEN f.default_enabled THEN 'allow' ELSE 'deny' END,
        'default', 'global', 'Catalogue default.', NULL::bigint,
        8, 5
      FROM public.billing_features f
    ) candidates
    ORDER BY feature_key, source_rank, scope_rank, CASE effect WHEN 'deny' THEN 0 ELSE 1 END
  ) winners;

  SELECT c.country_code INTO _region FROM public.companies c WHERE c.id = _company_id;
  SELECT s.status = 'trialing' AND s.trial_ends_at > now() INTO _trialing
  FROM public.company_subscriptions s WHERE s.company_id = _company_id;
  _trialing := coalesce(_trialing, false);

  FOR _patch IN SELECT key AS feature_key, value AS decision FROM jsonb_each(_result)
  LOOP
    IF (_patch.decision ->> 'allowed') IS DISTINCT FROM 'true' THEN CONTINUE; END IF;
    IF (_patch.decision ->> 'source') NOT IN ('plan', 'default') THEN CONTINUE; END IF;
    SELECT * INTO _roll FROM public.feature_rollouts r
    WHERE r.feature_key = _patch.feature_key
    ORDER BY r.created_at DESC
    LIMIT 1;
    IF NOT FOUND THEN CONTINUE; END IF;
    _decision := public.rollout_decision(
      _roll.mode, _roll.percent, _company_id::text, _company_id, _patch.feature_key, _roll.allowlist,
      _region, _roll.target_region, _trialing, _roll.starts_at, _roll.ends_at, now()
    );
    IF (_decision ->> 'included') = 'true' THEN CONTINUE; END IF;
    _result := jsonb_set(_result, ARRAY[_patch.feature_key], jsonb_build_object(
      'allowed', false,
      'source', _patch.decision ->> 'source',
      'scope', _patch.decision ->> 'scope',
      'reason', _decision ->> 'reason',
      'limit', _patch.decision -> 'limit'
    ));
  END LOOP;
  RETURN _result;
END;
$$;
