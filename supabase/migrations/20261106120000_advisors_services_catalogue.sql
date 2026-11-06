-- AD-01: LinkBooks Advisors public services and plan catalogue foundation.
-- Additive. Public visitors may read published rows only. No paid subscription
-- is started from this migration. Admin draft/publish workflow arrives in AD-02.

CREATE TABLE IF NOT EXISTS public.advisors_services (
  code text PRIMARY KEY,
  name text NOT NULL,
  headline text NOT NULL,
  description text NOT NULL,
  cta_label text NOT NULL DEFAULT 'Choose this service',
  starting_amount_minor integer NOT NULL CHECK (starting_amount_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'USD',
  cadence text NOT NULL CHECK (cadence IN ('month', 'session')),
  starting_label text NOT NULL,
  benefits jsonb NOT NULL DEFAULT '[]'::jsonb,
  illustration_key text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT advisors_services_code_check CHECK (code IN ('bookkeeping', 'coaching'))
);

CREATE TABLE IF NOT EXISTS public.advisors_service_plans (
  code text PRIMARY KEY,
  service_code text NOT NULL REFERENCES public.advisors_services(code) ON DELETE CASCADE,
  name text NOT NULL,
  audience text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'USD',
  cadence text NOT NULL CHECK (cadence IN ('month', 'session')),
  inclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS advisors_services_published_sort_idx
  ON public.advisors_services (is_published, sort_order);
CREATE INDEX IF NOT EXISTS advisors_service_plans_service_published_idx
  ON public.advisors_service_plans (service_code, is_published, sort_order);

ALTER TABLE public.advisors_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisors_service_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS advisors_services_public_read ON public.advisors_services;
CREATE POLICY advisors_services_public_read
  ON public.advisors_services
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS advisors_service_plans_public_read ON public.advisors_service_plans;
CREATE POLICY advisors_service_plans_public_read
  ON public.advisors_service_plans
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

REVOKE INSERT, UPDATE, DELETE ON public.advisors_services FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.advisors_service_plans FROM anon, authenticated;
GRANT SELECT ON public.advisors_services TO anon, authenticated;
GRANT SELECT ON public.advisors_service_plans TO anon, authenticated;

INSERT INTO public.advisors_services (
  code, name, headline, description, cta_label, starting_amount_minor, currency, cadence,
  starting_label, benefits, illustration_key, sort_order, is_published
) VALUES
  (
    'bookkeeping',
    'We do your books',
    'We do your books',
    'Stay focused on your business while our bookkeeping team keeps your financial records organized, accurate and ready for review.',
    'Choose this service',
    19900,
    'USD',
    'month',
    'Starting from $199/month',
    '[
      {"key":"monthly","label":"Monthly bookkeeping"},
      {"key":"categorization","label":"Transaction categorization"},
      {"key":"reconciliation","label":"Bank reconciliation"},
      {"key":"reports","label":"Financial reports"},
      {"key":"year_end","label":"Organized year-end records"},
      {"key":"support","label":"Professional bookkeeping support"}
    ]'::jsonb,
    'we-do-your-books',
    10,
    true
  ),
  (
    'coaching',
    'We coach you',
    'We coach you',
    'Build confidence in your bookkeeping with practical, personalized guidance from an experienced advisor.',
    'Choose this service',
    7900,
    'USD',
    'session',
    'Starting from $79/session',
    '[
      {"key":"one_to_one","label":"One-to-one coaching"},
      {"key":"software","label":"Accounting software guidance"},
      {"key":"training","label":"Bookkeeping training"},
      {"key":"explanations","label":"Financial report explanations"},
      {"key":"support","label":"Personalized support"}
    ]'::jsonb,
    'we-coach-you',
    20,
    true
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  headline = EXCLUDED.headline,
  description = EXCLUDED.description,
  cta_label = EXCLUDED.cta_label,
  starting_amount_minor = EXCLUDED.starting_amount_minor,
  currency = EXCLUDED.currency,
  cadence = EXCLUDED.cadence,
  starting_label = EXCLUDED.starting_label,
  benefits = EXCLUDED.benefits,
  illustration_key = EXCLUDED.illustration_key,
  sort_order = EXCLUDED.sort_order,
  is_published = true,
  updated_at = now();

INSERT INTO public.advisors_service_plans (
  code, service_code, name, audience, summary, amount_minor, currency, cadence,
  inclusions, sort_order, is_published
) VALUES
  ('essential_books', 'bookkeeping', 'Essential Books', 'For small businesses.',
   'Core monthly bookkeeping with essential reports.', 19900, 'USD', 'month',
   '["Up to 100 monthly transactions","Up to 2 bank or credit accounts","Monthly transaction categorization","Bank reconciliation","Monthly Profit & Loss","Monthly Balance Sheet","Organized year-end bookkeeping records","Standard customer support"]'::jsonb,
   10, true),
  ('growth_books', 'bookkeeping', 'Growth Books', 'For growing businesses.',
   'Everything in Essential plus AP/AR tracking and a monthly advisor meeting.', 34900, 'USD', 'month',
   '["Everything in Essential","Up to 300 monthly transactions","Up to 5 bank or credit accounts","Accounts payable and receivable tracking","Monthly financial review","Basic management reporting","One 30-minute advisor meeting per month","Priority support"]'::jsonb,
   20, true),
  ('complete_books', 'bookkeeping', 'Complete Books', 'For businesses needing advanced bookkeeping support.',
   'Higher volume limits, custom reporting and dedicated advisor support.', 59900, 'USD', 'month',
   '["Everything in Growth","Up to 600 monthly transactions","Up to 10 bank or credit accounts","Advanced management reporting","Custom reporting","Multi-account reconciliation","One 60-minute advisor meeting per month","Dedicated advisor support"]'::jsonb,
   30, true),
  ('quick_guidance', 'coaching', 'Quick Guidance', 'Focused one-off help.',
   'One personalized coaching session.', 7900, 'USD', 'session',
   '["One 45-minute session","Personalized bookkeeping assistance","Software or reporting guidance"]'::jsonb,
   10, true),
  ('monthly_coaching', 'coaching', 'Monthly Coaching', 'Steady monthly guidance.',
   'Two coaching sessions each month with follow-up support.', 14900, 'USD', 'month',
   '["Two 45-minute sessions monthly","Bookkeeping questions and guidance","Financial report explanations","Follow-up support"]'::jsonb,
   20, true),
  ('business_coaching', 'coaching', 'Business Coaching', 'Intensive coaching cadence.',
   'Four sessions monthly with prioritized guidance.', 24900, 'USD', 'month',
   '["Four coaching sessions monthly","Bookkeeping reviews","Personalized improvement recommendations","Priority guidance"]'::jsonb,
   30, true)
ON CONFLICT (code) DO UPDATE SET
  service_code = EXCLUDED.service_code,
  name = EXCLUDED.name,
  audience = EXCLUDED.audience,
  summary = EXCLUDED.summary,
  amount_minor = EXCLUDED.amount_minor,
  currency = EXCLUDED.currency,
  cadence = EXCLUDED.cadence,
  inclusions = EXCLUDED.inclusions,
  sort_order = EXCLUDED.sort_order,
  is_published = true,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.list_public_advisor_services()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(s)::jsonb ORDER BY s.sort_order), '[]'::jsonb)
  FROM (
    SELECT
      svc.code,
      svc.name,
      svc.headline,
      svc.description,
      svc.cta_label AS "ctaLabel",
      svc.starting_amount_minor AS "startingAmountMinor",
      svc.currency,
      svc.cadence,
      svc.starting_label AS "startingLabel",
      svc.benefits,
      svc.illustration_key AS "illustrationKey",
      svc.sort_order AS "sortOrder",
      (
        SELECT COALESCE(jsonb_agg(row_to_json(p)::jsonb ORDER BY p.sort_order), '[]'::jsonb)
        FROM (
          SELECT
            pl.code,
            pl.service_code AS "serviceCode",
            pl.name,
            pl.audience,
            pl.summary,
            pl.amount_minor AS "amountMinor",
            pl.currency,
            pl.cadence,
            pl.inclusions,
            pl.sort_order AS "sortOrder"
          FROM public.advisors_service_plans pl
          WHERE pl.service_code = svc.code AND pl.is_published = true
        ) p
      ) AS plans
    FROM public.advisors_services svc
    WHERE svc.is_published = true
  ) s;
$$;

REVOKE ALL ON FUNCTION public.list_public_advisor_services() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_advisor_services() TO anon, authenticated;
