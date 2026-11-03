-- Historical MRR movements for the control centre.
-- Current MRR uses the same active, non-demo, integer definition as private.platform_overview.
-- Leaving that set is churn for this record, including pause and past due.
-- A currency change closes the old currency and opens the new one.
-- Rows are append-only. This does not invoice, charge, or change a subscription.
-- Not applied to the connected production project.
-- Reverse: drop the trigger, function, and table.

CREATE TABLE IF NOT EXISTS public.mrr_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  currency text NOT NULL,
  previous_mrr_minor bigint NOT NULL CHECK (previous_mrr_minor >= 0),
  current_mrr_minor bigint NOT NULL CHECK (current_mrr_minor >= 0),
  movement text NOT NULL CHECK (movement IN ('baseline', 'new', 'expansion', 'contraction', 'churn')),
  delta_minor bigint NOT NULL,
  captured_by uuid,
  CONSTRAINT mrr_movements_class CHECK (
    (movement = 'baseline' AND previous_mrr_minor = current_mrr_minor AND current_mrr_minor > 0 AND delta_minor = 0)
    OR (movement = 'new' AND previous_mrr_minor = 0 AND current_mrr_minor > 0 AND delta_minor = current_mrr_minor)
    OR (movement = 'churn' AND current_mrr_minor = 0 AND previous_mrr_minor > 0 AND delta_minor = -previous_mrr_minor)
    OR (movement = 'expansion' AND previous_mrr_minor > 0 AND current_mrr_minor > previous_mrr_minor AND delta_minor = current_mrr_minor - previous_mrr_minor)
    OR (movement = 'contraction' AND current_mrr_minor > 0 AND current_mrr_minor < previous_mrr_minor AND delta_minor = current_mrr_minor - previous_mrr_minor)
  )
);

CREATE INDEX IF NOT EXISTS mrr_movements_company_captured_idx
  ON public.mrr_movements (company_id, captured_at DESC, id DESC);

ALTER TABLE public.mrr_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mrr_movements FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS mrr_movements_select ON public.mrr_movements;
CREATE POLICY mrr_movements_select ON public.mrr_movements
  FOR SELECT TO authenticated
  USING (private.platform_can('billing.view'));

GRANT SELECT ON public.mrr_movements TO authenticated;

CREATE OR REPLACE FUNCTION private.mrr_movements_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'MRR movements are append-only';
END $$;

DROP TRIGGER IF EXISTS mrr_movements_immutable ON public.mrr_movements;
CREATE TRIGGER mrr_movements_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.mrr_movements
  FOR EACH STATEMENT EXECUTE FUNCTION private.mrr_movements_immutable();

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
    SELECT s.company_id, s.currency::text AS currency,
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
      m.company_id, m.currency, m.current_mrr_minor AS mrr_minor
    FROM public.mrr_movements m
    ORDER BY m.company_id, m.captured_at DESC, m.id DESC
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

REVOKE ALL ON FUNCTION public.platform_capture_mrr_movements(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_capture_mrr_movements(text) TO authenticated;
