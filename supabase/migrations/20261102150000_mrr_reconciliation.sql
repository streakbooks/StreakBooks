-- Read-only comparison of the latest stored MRR position with the overview total.
-- The TypeScript spec is reconcileMrr in src/lib/platform/revenue-metrics.ts.
-- Latest row per business prefers an open amount when a currency change shares a timestamp.
-- A churned row is not open MRR. Missing history is uncovered, not zero.
-- Does not invoice, charge, or change a subscription.
-- Not applied to the connected production project.
-- Reverse: restore platform_capture_mrr_movements from 20261102140000 and drop platform_reconcile_mrr.

CREATE OR REPLACE FUNCTION public.platform_capture_mrr_movements(_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _rows jsonb;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)';
  END IF;
  WITH active AS (
    SELECT s.company_id, btrim(s.currency::text) AS currency,
      (s.unit_amount_minor / CASE WHEN s.billing_interval = 'year' THEN 12 ELSE 1 END)::bigint AS mrr_minor
    FROM public.company_subscriptions s
    JOIN public.companies c ON c.id = s.company_id
    WHERE NOT c.is_demo
      AND s.status = 'active'
      AND s.unit_amount_minor IS NOT NULL
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
  ),
  previous AS (
    SELECT DISTINCT ON (m.company_id)
      m.company_id, btrim(m.currency) AS currency, m.current_mrr_minor AS mrr_minor
    FROM public.mrr_movements m
    ORDER BY m.company_id, m.captured_at DESC, (m.current_mrr_minor > 0) DESC, m.id DESC
  ),
  changes AS (
    SELECT a.company_id, a.currency,
      CASE WHEN p.company_id IS NULL THEN a.mrr_minor ELSE p.mrr_minor END AS previous_mrr_minor,
      a.mrr_minor AS current_mrr_minor
    FROM active a
    LEFT JOIN previous p ON p.company_id = a.company_id
    WHERE (
      (p.company_id IS NULL AND a.mrr_minor > 0)
      OR (p.company_id IS NOT NULL AND p.currency = a.currency AND a.mrr_minor IS DISTINCT FROM p.mrr_minor)
    )
    UNION ALL
    SELECT p.company_id, p.currency, p.mrr_minor, 0
    FROM previous p
    JOIN active a ON a.company_id = p.company_id
    WHERE p.currency IS DISTINCT FROM a.currency AND p.mrr_minor > 0
    UNION ALL
    SELECT a.company_id, a.currency, 0, a.mrr_minor
    FROM active a
    JOIN previous p ON p.company_id = a.company_id
    WHERE p.currency IS DISTINCT FROM a.currency AND a.mrr_minor > 0
    UNION ALL
    SELECT p.company_id, p.currency, p.mrr_minor, 0
    FROM previous p
    WHERE p.mrr_minor > 0
      AND NOT EXISTS (SELECT 1 FROM active a WHERE a.company_id = p.company_id)
  ),
  labelled AS (
    SELECT company_id, currency, previous_mrr_minor, current_mrr_minor,
      CASE
        WHEN previous_mrr_minor = current_mrr_minor THEN 'baseline'
        WHEN previous_mrr_minor = 0 AND current_mrr_minor > 0 THEN 'new'
        WHEN previous_mrr_minor > 0 AND current_mrr_minor = 0 THEN 'churn'
        WHEN current_mrr_minor > previous_mrr_minor THEN 'expansion'
        ELSE 'contraction'
      END AS movement,
      current_mrr_minor - previous_mrr_minor AS delta_minor
    FROM changes
  ),
  inserted AS (
    INSERT INTO public.mrr_movements (
      company_id, currency, previous_mrr_minor, current_mrr_minor, movement, delta_minor, captured_by
    )
    SELECT company_id, currency, previous_mrr_minor, current_mrr_minor, movement, delta_minor, auth.uid()
    FROM labelled
    RETURNING movement, delta_minor, currency
  )
  SELECT coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) INTO _rows FROM inserted i;
  PERFORM private.platform_log(
    'billing.mrr_capture', 'mrr_movement', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    '{}'::jsonb, jsonb_build_object('rows', coalesce(jsonb_array_length(_rows), 0)), trim(_reason)
  );
  RETURN jsonb_build_object('rows', coalesce(_rows, '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.platform_reconcile_mrr()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _active integer;
  _open integer;
  _missing integer;
  _extra integer;
  _drift integer;
  _rows jsonb;
  _state text;
BEGIN
  IF NOT private.platform_can('billing.view') THEN
    RETURN jsonb_build_object(
      'state', 'forbidden', 'rows', '[]'::jsonb,
      'missingFromStore', 0, 'extraInStore', 0, 'drift', 0
    );
  END IF;
  WITH active AS (
    SELECT s.company_id, btrim(s.currency::text) AS currency,
      (s.unit_amount_minor / CASE WHEN s.billing_interval = 'year' THEN 12 ELSE 1 END)::bigint AS mrr_minor
    FROM public.company_subscriptions s
    JOIN public.companies c ON c.id = s.company_id
    WHERE NOT c.is_demo
      AND s.status = 'active'
      AND s.unit_amount_minor IS NOT NULL
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
  ),
  latest AS (
    SELECT DISTINCT ON (m.company_id)
      m.company_id, btrim(m.currency) AS currency, m.current_mrr_minor
    FROM public.mrr_movements m
    ORDER BY m.company_id, m.captured_at DESC, (m.current_mrr_minor > 0) DESC, m.id DESC
  ),
  missing AS (
    SELECT a.company_id FROM active a
    WHERE NOT EXISTS (SELECT 1 FROM latest l WHERE l.company_id = a.company_id)
  ),
  extra AS (
    SELECT l.company_id FROM latest l
    WHERE l.current_mrr_minor > 0
      AND NOT EXISTS (SELECT 1 FROM active a WHERE a.company_id = l.company_id)
  ),
  drift AS (
    SELECT a.company_id FROM active a
    JOIN latest l ON l.company_id = a.company_id
    WHERE l.currency IS DISTINCT FROM a.currency OR l.current_mrr_minor IS DISTINCT FROM a.mrr_minor
  ),
  currencies AS (
    SELECT currency FROM active
    UNION
    SELECT currency FROM latest WHERE current_mrr_minor > 0
  ),
  totals AS (
    SELECT c.currency,
      coalesce((SELECT sum(a.mrr_minor) FROM active a WHERE a.currency = c.currency), 0)::bigint AS overview_minor,
      coalesce((SELECT sum(l.current_mrr_minor) FROM latest l WHERE l.currency = c.currency AND l.current_mrr_minor > 0), 0)::bigint AS stored_minor
    FROM currencies c
  )
  SELECT
    (SELECT count(*) FROM active),
    (SELECT count(*) FROM latest WHERE current_mrr_minor > 0),
    (SELECT count(*) FROM missing),
    (SELECT count(*) FROM extra),
    (SELECT count(*) FROM drift),
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'currency', t.currency,
        'overviewMinor', t.overview_minor,
        'storedMinor', t.stored_minor,
        'differenceMinor', t.overview_minor - t.stored_minor
      ) ORDER BY t.currency)
      FROM totals t
    ), '[]'::jsonb)
  INTO _active, _open, _missing, _extra, _drift, _rows;
  _state := CASE
    WHEN _active = 0 AND _open = 0 THEN 'empty'
    WHEN _missing > 0 AND _open = 0 AND _extra = 0 AND _drift = 0 THEN 'uncovered'
    WHEN _missing = 0 AND _extra = 0 AND _drift = 0 THEN 'match'
    ELSE 'mismatch'
  END;
  RETURN jsonb_build_object(
    'state', _state,
    'rows', coalesce(_rows, '[]'::jsonb),
    'missingFromStore', _missing,
    'extraInStore', _extra,
    'drift', _drift
  );
END $$;

REVOKE ALL ON FUNCTION public.platform_reconcile_mrr() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_reconcile_mrr() TO authenticated;
