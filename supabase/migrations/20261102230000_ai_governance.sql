-- READY-TO-APPLY. Not applied. Reads the existing entitlement, cap, and one live unit price.
-- It does not call a provider or store a second price. It does not read usage event text.
-- Reverse:
--   DROP FUNCTION IF EXISTS public.platform_ai_governance(uuid);

CREATE FUNCTION public.platform_ai_governance(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ent jsonb;
  _decision jsonb;
  _allowed boolean;
  _source text;
  _cap bigint;
  _used bigint;
  _prices integer;
  _unit integer;
  _spend bigint;
  _status text;
BEGIN
  PERFORM private.require_platform('features.view');
  _ent := public.get_entitlements(_company_id);
  _decision := _ent -> 'decisions' -> 'ai_queries';
  _allowed := coalesce((_decision ->> 'allowed')::boolean, false);
  _source := _decision ->> 'source';
  _cap := (_decision ->> 'limit')::bigint;
  _used := coalesce((_ent -> 'usage' ->> 'ai_queries')::bigint, 0);
  SELECT count(*)::integer, min(amount_minor) INTO _prices, _unit
  FROM public.feature_prices
  WHERE feature_key = 'ai_queries' AND status = 'live' AND model IN ('per_unit', 'usage')
    AND billing_interval = 'month';
  _spend := CASE WHEN _prices = 1 THEN _used * _unit ELSE NULL END;
  _status := CASE
    WHEN _source = 'kill_switch' AND NOT _allowed THEN 'killed'
    WHEN NOT _allowed THEN 'denied'
    WHEN _cap IS NOT NULL AND _used >= _cap THEN 'capped'
    WHEN _cap IS NULL THEN 'no_cap'
    ELSE 'allowed'
  END;
  PERFORM private.platform_log(
    'ai.governance', 'company', _company_id::text, NULL,
    jsonb_build_object('status', _status), 'Read AI governance'
  );
  RETURN jsonb_build_object(
    'status', _status,
    'allowed', _status IN ('allowed', 'no_cap'),
    'spendMinor', _spend,
    'providerCalled', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_ai_governance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_ai_governance(uuid) TO authenticated;
