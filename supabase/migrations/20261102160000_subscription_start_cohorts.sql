-- Store a subscription start only when the row is inserted.
-- Existing rows stay null. Do not backfill from the last update.
-- Counts are subscription starts, not revenue, lifetime value, or fees.
-- Not applied to the connected production project.
-- Reverse: drop the function, trigger, and started_at column.

ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

COMMENT ON COLUMN public.company_subscriptions.started_at IS
  'UTC start set on insert. Existing rows stay null. Do not backfill from the last update.';

CREATE OR REPLACE FUNCTION private.company_subscription_set_started_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.started_at IS NULL THEN
    NEW.started_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS company_subscription_set_started_at ON public.company_subscriptions;
CREATE TRIGGER company_subscription_set_started_at
  BEFORE INSERT ON public.company_subscriptions
  FOR EACH ROW EXECUTE FUNCTION private.company_subscription_set_started_at();

CREATE OR REPLACE FUNCTION public.platform_subscription_cohorts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _unknown integer;
  _months jsonb;
BEGIN
  PERFORM private.require_platform('subscriptions.view');
  SELECT count(*) INTO _unknown
  FROM public.company_subscriptions s
  JOIN public.companies c ON c.id = s.company_id
  WHERE NOT c.is_demo AND s.started_at IS NULL;
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.month), '[]'::jsonb) INTO _months
  FROM (
    SELECT to_char(date_trunc('month', s.started_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
      count(*) FILTER (WHERE s.status = 'trialing') AS trialing,
      count(*) FILTER (WHERE s.status = 'active') AS active,
      count(*) FILTER (WHERE s.status = 'past_due') AS past_due,
      count(*) FILTER (WHERE s.status = 'cancelled') AS cancelled,
      count(*) FILTER (WHERE s.status = 'expired') AS expired,
      count(*) FILTER (WHERE s.status = 'complimentary') AS complimentary,
      count(*) FILTER (WHERE s.status = 'paused') AS paused,
      count(*) FILTER (WHERE s.status NOT IN (
        'trialing', 'active', 'past_due', 'cancelled', 'expired', 'complimentary', 'paused'
      )) AS other,
      count(*) AS total
    FROM public.company_subscriptions s
    JOIN public.companies c ON c.id = s.company_id
    WHERE NOT c.is_demo AND s.started_at IS NOT NULL
    GROUP BY 1
  ) r;
  RETURN jsonb_build_object('unknownStart', _unknown, 'months', coalesce(_months, '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.platform_subscription_cohorts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_subscription_cohorts() TO authenticated;
