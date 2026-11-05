-- Billing platform, phase 2: STANDARD / PRO / BUSINESS catalogue, per-plan trials,
-- trial eligibility rules and data-driven plan ranking.
-- Decisions: D1 invoice/bill limits per calendar month; D2 legacy plans hidden from sale;
-- D19 unbuilt features (OCR, inventory, customer API) shown as "coming soon".
-- Additive and idempotent. Prices are NOT set here: the new plans use pricing_source
-- 'price_book' and the legacy checkout refuses them until phase 3 publishes prices.

-- ---------------------------------------------------------------------------
-- 1. Plan and feature attributes
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS plan_rank integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS pricing_source text NOT NULL DEFAULT 'legacy';
DO $$ BEGIN
  ALTER TABLE public.billing_plans ADD CONSTRAINT billing_plans_trial_days_range CHECK (trial_days BETWEEN 1 AND 365);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.billing_plans ADD CONSTRAINT billing_plans_pricing_source_check
    CHECK (pricing_source IN ('legacy', 'price_book'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.billing_features ADD COLUMN IF NOT EXISTS availability text NOT NULL DEFAULT 'available';
DO $$ BEGIN
  ALTER TABLE public.billing_features ADD CONSTRAINT billing_features_availability_check
    CHECK (availability IN ('available', 'coming_soon'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.billing_features (key, label, description, category, module, metering, catalogue_status, default_enabled)
VALUES
  ('tax_reports', 'GST and tax reports', 'Tax summaries and returns for the organisation.', 'module', 'reporting', 'none', 'live', false),
  ('quotes', 'Quotes and estimates', 'Send quotes and convert them into invoices.', 'module', 'sales', 'none', 'live', false),
  ('recurring', 'Recurring invoices and bills', 'Schedules that create invoices and bills automatically.', 'module', 'sales', 'none', 'live', false),
  ('payment_reminders', 'Automated payment reminders', 'Reminder emails for overdue invoices.', 'module', 'sales', 'none', 'live', false),
  ('bank_rules', 'Bank rules and automation', 'Rules that categorise bank transactions.', 'module', 'banking', 'none', 'live', false),
  ('tracking', 'Tracking categories', 'Tag transactions by department, location or class.', 'module', 'accounting', 'none', 'live', false),
  ('advanced_reporting', 'Advanced financial reports', 'Comparisons, custom layouts and analysis.', 'module', 'reporting', 'none', 'live', false),
  ('ocr', 'OCR bill scanning', 'Read supplier bills from uploaded documents.', 'module', 'purchases', 'none', 'live', false),
  ('purchase_orders', 'Purchase orders', 'Raise and track purchase orders.', 'module', 'purchases', 'none', 'live', false),
  ('advanced_permissions', 'Advanced user permissions', 'Per-person access adjustments beyond the duty role.', 'module', 'accounting', 'none', 'live', false),
  ('priority_support', 'Priority customer support', 'Faster response from the support team.', 'module', 'accounting', 'none', 'live', false)
ON CONFLICT (key) DO NOTHING;
UPDATE public.billing_features SET availability = 'coming_soon'
 WHERE key IN ('ocr', 'inventory', 'api') AND availability <> 'coming_soon';

-- ---------------------------------------------------------------------------
-- 2. Plans: new catalogue on sale, legacy plans hidden (D2)
-- ---------------------------------------------------------------------------
-- monthly_* are the legacy price columns (NOT NULL). They are ignored for
-- pricing_source = 'price_book' and the legacy checkout refuses those plans.
INSERT INTO public.billing_plans
  (code, name, audience, summary, monthly_gbp, monthly_usd, monthly_inr, users_included,
   invoices_per_month, bills_per_month, multi_currency, highlights, sort_order, is_public, is_active,
   plan_rank, trial_enabled, trial_days, pricing_source)
VALUES
  ('standard', 'Standard', 'Small businesses getting started',
   'Core bookkeeping, banking, GST reports and accountant access.', 0, 0, 0, 2, 50, 50, false,
   '["2 users", "50 invoices and 50 bills a month", "Bank reconciliation and statement imports", "P&L, balance sheet and GST reports", "Accountant access"]'::jsonb,
   1, true, true, 10, true, 30, 'price_book'),
  ('pro', 'Pro', 'Growing businesses',
   'Unlimited invoices and bills with automation, multi-currency and AI.', 0, 0, 0, 5, NULL, NULL, true,
   '["5 users", "Unlimited invoices, bills and expenses", "Quotes, recurring invoices and payment reminders", "Bank rules, live bank feeds and multi-currency", "Projects, budgets and advanced reports", "AI accounting assistant", "OCR bill scanning (coming soon)"]'::jsonb,
   2, true, true, 20, true, 30, 'price_book'),
  ('business', 'Business', 'Established businesses',
   'Fixed assets, approvals, advanced permissions and priority support.', 0, 0, 0, 10, NULL, NULL, true,
   '["10 users", "Everything in Pro", "Fixed assets and depreciation", "Approval workflows and advanced permissions", "Priority customer support", "Inventory (coming soon)", "API and integrations (coming soon)"]'::jsonb,
   3, true, true, 30, true, 30, 'price_book')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, audience = EXCLUDED.audience, summary = EXCLUDED.summary,
  monthly_gbp = 0, monthly_usd = 0, monthly_inr = 0,
  users_included = EXCLUDED.users_included, invoices_per_month = EXCLUDED.invoices_per_month,
  bills_per_month = EXCLUDED.bills_per_month, multi_currency = EXCLUDED.multi_currency,
  highlights = EXCLUDED.highlights, sort_order = EXCLUDED.sort_order, is_public = true, is_active = true,
  plan_rank = EXCLUDED.plan_rank, trial_enabled = EXCLUDED.trial_enabled, trial_days = EXCLUDED.trial_days,
  pricing_source = 'price_book', updated_at = now()
WHERE public.billing_plans.pricing_source = 'legacy';

UPDATE public.billing_plans
   SET is_public = false,
       trial_enabled = false,
       plan_rank = CASE code WHEN 'starter' THEN 10 WHEN 'growth' THEN 20 WHEN 'premium' THEN 30 ELSE 40 END,
       updated_at = now()
 WHERE code IN ('starter', 'growth', 'premium', 'practice') AND is_public;

-- ---------------------------------------------------------------------------
-- 3. Published plan versions and entitlements
-- ---------------------------------------------------------------------------
-- Keys the brief does not list copy the provisional source allocation
-- (STANDARD <- starter, PRO <- growth, BUSINESS <- current top-tier pro), then the
-- brief's mapping overrides them.
DO $$
DECLARE
  marker constant text := 'Billing platform phase 2 catalogue';
  src_standard uuid;
  src_pro uuid;
  src_business uuid;
  p record;
  vid uuid;
  next_no integer;
BEGIN
  SELECT id INTO src_standard FROM public.plan_versions
   WHERE plan_code = 'starter' AND status = 'published' ORDER BY version_no DESC LIMIT 1;
  SELECT id INTO src_pro FROM public.plan_versions
   WHERE plan_code = 'growth' AND status = 'published' ORDER BY version_no DESC LIMIT 1;
  SELECT id INTO src_business FROM public.plan_versions
   WHERE plan_code = 'pro' AND status = 'published' AND reason IS DISTINCT FROM marker
   ORDER BY version_no DESC LIMIT 1;

  FOR p IN
    SELECT * FROM (VALUES ('standard', src_standard, 1), ('pro', src_pro, 2), ('business', src_business, 3))
      AS v(code, source_id, sort)
  LOOP
    IF EXISTS (SELECT 1 FROM public.plan_versions WHERE plan_code = p.code AND reason = marker) THEN
      CONTINUE;
    END IF;
    SELECT coalesce(max(version_no), 0) + 1 INTO next_no FROM public.plan_versions WHERE plan_code = p.code;
    INSERT INTO public.plan_versions
      (plan_code, version_no, status, name, audience, summary, sort_order, visibility, effective_from, published_at, reason)
    SELECT p.code, next_no, 'published', bp.name, bp.audience, bp.summary, p.sort, 'live', now(), now(), marker
      FROM public.billing_plans bp WHERE bp.code = p.code
    RETURNING id INTO vid;
    UPDATE public.plan_versions SET status = 'archived', visibility = 'hidden'
     WHERE plan_code = p.code AND status = 'published' AND id <> vid;
    INSERT INTO public.plan_version_limits (version_id, feature_key, enabled, limit_value)
    SELECT vid, f.key, coalesce(s.enabled, false), s.limit_value
      FROM public.billing_features f
      LEFT JOIN public.plan_version_limits s ON s.version_id = p.source_id AND s.feature_key = f.key;
  END LOOP;

  -- Hidden legacy versions stay valid for history; they no longer appear on sale.
  UPDATE public.plan_versions SET visibility = 'hidden'
   WHERE plan_code IN ('starter', 'growth', 'premium', 'practice') AND visibility = 'live';
END $$;

WITH mapping (plan_code, feature_key, enabled, limit_value) AS (
  VALUES
    -- Limits (D1: invoices and bills per calendar month)
    ('standard', 'users', true, 2::bigint), ('pro', 'users', true, 5), ('business', 'users', true, 10),
    ('standard', 'invoices', true, 50), ('pro', 'invoices', true, NULL), ('business', 'invoices', true, NULL),
    ('standard', 'bills', true, 50), ('pro', 'bills', true, NULL), ('business', 'bills', true, NULL),
    -- Included on every plan
    ('standard', 'accounting', true, NULL), ('pro', 'accounting', true, NULL), ('business', 'accounting', true, NULL),
    ('standard', 'sales', true, NULL), ('pro', 'sales', true, NULL), ('business', 'sales', true, NULL),
    ('standard', 'purchases', true, NULL), ('pro', 'purchases', true, NULL), ('business', 'purchases', true, NULL),
    ('standard', 'banking', true, NULL), ('pro', 'banking', true, NULL), ('business', 'banking', true, NULL),
    ('standard', 'bank_import', true, NULL), ('pro', 'bank_import', true, NULL), ('business', 'bank_import', true, NULL),
    ('standard', 'reporting', true, NULL), ('pro', 'reporting', true, NULL), ('business', 'reporting', true, NULL),
    ('standard', 'documents', true, NULL), ('pro', 'documents', true, NULL), ('business', 'documents', true, NULL),
    ('standard', 'tax_reports', true, NULL), ('pro', 'tax_reports', true, NULL), ('business', 'tax_reports', true, NULL),
    -- PRO and BUSINESS
    ('standard', 'quotes', false, NULL), ('pro', 'quotes', true, NULL), ('business', 'quotes', true, NULL),
    ('standard', 'recurring', false, NULL), ('pro', 'recurring', true, NULL), ('business', 'recurring', true, NULL),
    ('standard', 'payment_reminders', false, NULL), ('pro', 'payment_reminders', true, NULL), ('business', 'payment_reminders', true, NULL),
    ('standard', 'bank_rules', false, NULL), ('pro', 'bank_rules', true, NULL), ('business', 'bank_rules', true, NULL),
    ('standard', 'bank_feeds', false, NULL), ('pro', 'bank_feeds', true, NULL), ('business', 'bank_feeds', true, NULL),
    ('standard', 'multi_currency', false, NULL), ('pro', 'multi_currency', true, NULL), ('business', 'multi_currency', true, NULL),
    ('standard', 'projects', false, NULL), ('pro', 'projects', true, NULL), ('business', 'projects', true, NULL),
    ('standard', 'budgets', false, NULL), ('pro', 'budgets', true, NULL), ('business', 'budgets', true, NULL),
    ('standard', 'budgeting', false, NULL), ('pro', 'budgeting', true, NULL), ('business', 'budgeting', true, NULL),
    ('standard', 'tracking', false, NULL), ('pro', 'tracking', true, NULL), ('business', 'tracking', true, NULL),
    ('standard', 'advanced_reporting', false, NULL), ('pro', 'advanced_reporting', true, NULL), ('business', 'advanced_reporting', true, NULL),
    ('standard', 'ocr', false, NULL), ('pro', 'ocr', true, NULL), ('business', 'ocr', true, NULL),
    ('standard', 'purchase_orders', false, NULL), ('pro', 'purchase_orders', true, NULL), ('business', 'purchase_orders', true, NULL),
    -- BUSINESS only
    ('standard', 'fixed_assets', false, NULL), ('pro', 'fixed_assets', false, NULL), ('business', 'fixed_assets', true, NULL),
    ('standard', 'inventory', false, NULL), ('pro', 'inventory', false, NULL), ('business', 'inventory', true, NULL),
    ('standard', 'approvals', false, NULL), ('pro', 'approvals', false, NULL), ('business', 'approvals', true, NULL),
    ('standard', 'advanced_permissions', false, NULL), ('pro', 'advanced_permissions', false, NULL), ('business', 'advanced_permissions', true, NULL),
    ('standard', 'api', false, NULL), ('pro', 'api', false, NULL), ('business', 'api', true, NULL),
    ('standard', 'priority_support', false, NULL), ('pro', 'priority_support', false, NULL), ('business', 'priority_support', true, NULL),
    -- AI assistant: PRO and BUSINESS (usage limits keep the source allocation)
    ('standard', 'ai_queries', false, NULL)
)
UPDATE public.plan_version_limits l
   SET enabled = m.enabled, limit_value = m.limit_value
  FROM mapping m
  JOIN public.plan_versions v ON v.plan_code = m.plan_code AND v.reason = 'Billing platform phase 2 catalogue'
 WHERE l.version_id = v.id AND l.feature_key = m.feature_key;

-- Accountant access and the AI assistant are included on every plan above STANDARD's AI
-- exclusion; their numeric allowances keep the source allocation.
UPDATE public.plan_version_limits l SET enabled = true
  FROM public.plan_versions v
 WHERE l.version_id = v.id AND v.reason = 'Billing platform phase 2 catalogue'
   AND (l.feature_key = 'accountant_seats' OR (l.feature_key = 'ai_queries' AND v.plan_code <> 'standard'));

-- The complimentary demo plan keeps every new capability so demo companies are unrestricted.
INSERT INTO public.plan_version_limits (version_id, feature_key, enabled, limit_value)
SELECT v.id, f.key, true, NULL
  FROM public.plan_versions v
 CROSS JOIN public.billing_features f
 WHERE v.plan_code = 'practice' AND v.status = 'published'
   AND f.key IN ('tax_reports', 'quotes', 'recurring', 'payment_reminders', 'bank_rules', 'tracking',
                 'advanced_reporting', 'ocr', 'purchase_orders', 'advanced_permissions', 'priority_support')
ON CONFLICT (version_id, feature_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Trial records and eligibility rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.trial_eligibility_rules (
  rule_key text PRIMARY KEY CHECK (rule_key IN ('max_trials_per_user', 'max_trials_per_billing_account')),
  enabled boolean NOT NULL,
  max_count integer NOT NULL CHECK (max_count >= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
INSERT INTO billing.trial_eligibility_rules (rule_key, enabled, max_count) VALUES
  ('max_trials_per_user', true, 1),
  ('max_trials_per_billing_account', true, 1)
ON CONFLICT (rule_key) DO NOTHING;

-- One row per organisation that has ever started a trial. company_id has no foreign key so
-- trial history survives if a company is deleted.
CREATE TABLE IF NOT EXISTS billing.trial_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE,
  billing_account_id uuid,
  user_id uuid,
  plan_code text NOT NULL,
  started_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  source text NOT NULL CHECK (source IN ('signup', 'manual', 'backfill')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at >= started_at)
);
CREATE INDEX IF NOT EXISTS trial_grants_user_idx ON billing.trial_grants (user_id);
CREATE INDEX IF NOT EXISTS trial_grants_account_idx ON billing.trial_grants (billing_account_id);

ALTER TABLE billing.trial_eligibility_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.trial_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing.trial_eligibility_rules, billing.trial_grants FROM PUBLIC;
DO $$ BEGIN
  EXECUTE 'REVOKE ALL ON billing.trial_eligibility_rules, billing.trial_grants FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL; END $$;

INSERT INTO billing.trial_grants (company_id, billing_account_id, user_id, plan_code, started_at, ends_at, source)
SELECT s.company_id, l.billing_account_id, c.created_by, s.plan_code, s.trial_started_at,
       greatest(coalesce(s.trial_ends_at, s.trial_started_at), s.trial_started_at), 'backfill'
  FROM public.company_subscriptions s
  JOIN public.companies c ON c.id = s.company_id
  LEFT JOIN billing.billing_account_companies l ON l.company_id = s.company_id
 WHERE s.trial_started_at IS NOT NULL
ON CONFLICT (company_id) DO NOTHING;

CREATE OR REPLACE FUNCTION billing.trial_eligibility(_company_id uuid, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  rule billing.trial_eligibility_rules%ROWTYPE;
  acct uuid;
  used integer;
BEGIN
  IF EXISTS (SELECT 1 FROM billing.trial_grants g WHERE g.company_id = _company_id) THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'This organisation has already used its free trial.');
  END IF;
  SELECT * INTO rule FROM billing.trial_eligibility_rules WHERE rule_key = 'max_trials_per_user';
  IF FOUND AND rule.enabled AND _user_id IS NOT NULL THEN
    SELECT count(*) INTO used FROM billing.trial_grants g WHERE g.user_id = _user_id;
    IF used >= rule.max_count THEN
      RETURN jsonb_build_object('eligible', false,
        'reason', 'Your free trial has already been used on another organisation. Choose a plan to continue.');
    END IF;
  END IF;
  SELECT l.billing_account_id INTO acct FROM billing.billing_account_companies l WHERE l.company_id = _company_id;
  SELECT * INTO rule FROM billing.trial_eligibility_rules WHERE rule_key = 'max_trials_per_billing_account';
  IF FOUND AND rule.enabled AND acct IS NOT NULL THEN
    SELECT count(*) INTO used FROM billing.trial_grants g WHERE g.billing_account_id = acct;
    IF used >= rule.max_count THEN
      RETURN jsonb_build_object('eligible', false,
        'reason', 'This billing account has already used its free trial. Choose a plan to continue.');
    END IF;
  END IF;
  RETURN jsonb_build_object('eligible', true, 'reason', NULL);
END $$;
REVOKE ALL ON FUNCTION billing.trial_eligibility(uuid, uuid) FROM PUBLIC;

-- Trial grants made at signup are recorded before the billing account exists (trigger order);
-- link them when the account is created.
CREATE OR REPLACE FUNCTION billing.create_organization_account(_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  co record;
  acct uuid;
  country char(2);
BEGIN
  SELECT l.billing_account_id INTO acct FROM billing.billing_account_companies l WHERE l.company_id = _company_id;
  IF acct IS NOT NULL THEN
    RETURN acct;
  END IF;
  SELECT c.id, c.name, c.created_by, c.country_code INTO co FROM public.companies c WHERE c.id = _company_id;
  IF NOT FOUND OR co.created_by IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT k.code INTO country FROM billing.countries k WHERE k.code = upper(co.country_code);
  INSERT INTO billing.billing_accounts
    (account_type, display_name, owner_user_id, billing_country, country_source, created_by)
  VALUES
    ('ORGANIZATION', left(coalesce(nullif(btrim(co.name), ''), 'Organisation'), 200), co.created_by,
     country, CASE WHEN country IS NULL THEN NULL ELSE 'USER_SELECTED' END, co.created_by)
  RETURNING id INTO acct;
  INSERT INTO billing.billing_account_companies (company_id, billing_account_id, linked_by)
  VALUES (_company_id, acct, co.created_by);
  UPDATE billing.trial_grants SET billing_account_id = acct
   WHERE company_id = _company_id AND billing_account_id IS NULL;
  RETURN acct;
END $$;
REVOKE ALL ON FUNCTION billing.create_organization_account(uuid) FROM PUBLIC;

UPDATE billing.trial_grants g SET billing_account_id = l.billing_account_id
  FROM billing.billing_account_companies l
 WHERE l.company_id = g.company_id AND g.billing_account_id IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Trial start (signup and manual) driven by plan settings and eligibility
-- ---------------------------------------------------------------------------
UPDATE public.billing_settings SET trial_plan_code = 'pro', trial_days = 30
 WHERE id = true AND trial_plan_code IS DISTINCT FROM 'pro';

CREATE OR REPLACE FUNCTION public.attach_company_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _settings public.billing_settings%ROWTYPE;
  _currency CHAR(3);
  _plan public.billing_plans%ROWTYPE;
  _plan_code TEXT;
  _version UUID;
  _ends TIMESTAMPTZ;
BEGIN
  SELECT * INTO _settings FROM public.billing_settings WHERE id = true;
  _currency := CASE
    WHEN NEW.base_currency IN ('USD', 'GBP', 'AUD', 'NZD', 'INR') THEN NEW.base_currency
    ELSE 'USD'
  END;
  _plan_code := CASE WHEN NEW.is_demo THEN 'practice' ELSE COALESCE(_settings.trial_plan_code, 'pro') END;
  SELECT * INTO _plan FROM public.billing_plans WHERE code = _plan_code;
  SELECT id INTO _version FROM public.plan_versions
  WHERE plan_code = _plan_code AND status = 'published'
  ORDER BY version_no DESC LIMIT 1;

  IF NEW.is_demo THEN
    INSERT INTO public.company_subscriptions (
      company_id, plan_code, status, billing_interval, provider, currency, price_version_id
    ) VALUES (NEW.id, _plan_code, 'complimentary', 'month', 'none', _currency, _version)
    ON CONFLICT (company_id) DO NOTHING;
    RETURN NEW;
  END IF;

  IF _plan.code IS NOT NULL AND _plan.is_active AND _plan.trial_enabled
     AND (billing.trial_eligibility(NEW.id, NEW.created_by) ->> 'eligible')::boolean
  THEN
    _ends := now() + make_interval(days => _plan.trial_days);
    INSERT INTO public.company_subscriptions (
      company_id, plan_code, status, billing_interval, provider, currency,
      trial_started_at, trial_ends_at, price_version_id
    ) VALUES (NEW.id, _plan_code, 'trialing', 'month', 'none', _currency, now(), _ends, _version)
    ON CONFLICT (company_id) DO NOTHING;
    IF FOUND THEN
      INSERT INTO billing.trial_grants (company_id, user_id, plan_code, started_at, ends_at, source)
      VALUES (NEW.id, NEW.created_by, _plan_code, now(), _ends, 'signup')
      ON CONFLICT (company_id) DO NOTHING;
    END IF;
  ELSE
    -- No trial available: records can be read and a plan chosen, but nothing posts until paid.
    INSERT INTO public.company_subscriptions (
      company_id, plan_code, status, billing_interval, provider, currency, price_version_id
    ) VALUES (NEW.id, _plan_code, 'expired', 'month', 'none', _currency, _version)
    ON CONFLICT (company_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_company_trial(_company_id uuid, _plan_code text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _plan public.billing_plans%ROWTYPE;
  _eligibility jsonb;
  _ends TIMESTAMPTZ;
  _version UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'billing.manage') THEN
    RAISE EXCEPTION 'You do not have permission to manage billing for this organisation.';
  END IF;
  SELECT * INTO _plan FROM public.billing_plans WHERE code = _plan_code AND is_active AND trial_enabled;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That plan does not offer a free trial.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.company_subscriptions WHERE company_id = _company_id AND status = 'complimentary'
  ) THEN
    RAISE EXCEPTION 'Demo organisations are not billed.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.company_subscriptions WHERE company_id = _company_id AND trial_started_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This organisation has already used its free trial.';
  END IF;
  _eligibility := billing.trial_eligibility(_company_id, auth.uid());
  IF NOT (_eligibility ->> 'eligible')::boolean THEN
    RAISE EXCEPTION '%', _eligibility ->> 'reason';
  END IF;
  _ends := now() + make_interval(days => _plan.trial_days);
  SELECT id INTO _version FROM public.plan_versions
  WHERE plan_code = _plan_code AND status = 'published' ORDER BY version_no DESC LIMIT 1;
  INSERT INTO public.company_subscriptions (
    company_id, plan_code, status, billing_interval, provider, trial_started_at, trial_ends_at, currency, price_version_id
  )
  SELECT _company_id, _plan_code, 'trialing', 'month', 'none', now(), _ends,
    CASE WHEN c.base_currency IN ('USD', 'GBP', 'AUD', 'NZD', 'INR') THEN c.base_currency ELSE 'USD' END, _version
  FROM public.companies c
  WHERE c.id = _company_id
  ON CONFLICT (company_id) DO UPDATE
    SET plan_code = EXCLUDED.plan_code,
        status = 'trialing',
        trial_started_at = EXCLUDED.trial_started_at,
        trial_ends_at = EXCLUDED.trial_ends_at,
        price_version_id = EXCLUDED.price_version_id,
        updated_at = now()
    WHERE public.company_subscriptions.trial_started_at IS NULL
      AND public.company_subscriptions.status <> 'complimentary';
  INSERT INTO billing.trial_grants (company_id, billing_account_id, user_id, plan_code, started_at, ends_at, source)
  SELECT _company_id, l.billing_account_id, auth.uid(), _plan_code, now(), _ends, 'manual'
    FROM (SELECT 1) one
    LEFT JOIN billing.billing_account_companies l ON l.company_id = _company_id
  ON CONFLICT (company_id) DO NOTHING;
  RETURN _ends;
END;
$function$;

-- An organisation created without a trial starts read-only. Its creator still becomes the
-- founding owner (so they can subscribe); every other seat keeps the allowance check.
CREATE OR REPLACE FUNCTION public.enforce_subscription_seats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' AND OLD.role = NEW.role THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT'
     AND NEW.role = 'owner'
     AND EXISTS (SELECT 1 FROM public.companies c WHERE c.id = NEW.company_id AND c.created_by = NEW.user_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.company_members m WHERE m.company_id = NEW.company_id AND m.status = 'active'
     ) THEN
    RETURN NEW;
  END IF;
  PERFORM public.assert_billing_allowance(
    NEW.company_id,
    CASE WHEN NEW.role = 'accountant' THEN 'accountant_seats' ELSE 'users' END,
    1
  );
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Data-driven plan ranking and price-tool plan list
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_company_allowance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _existing INTEGER;
  _limit BIGINT;
  _sample UUID;
BEGIN
  IF NEW.is_demo IS TRUE OR NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO _existing
  FROM public.companies
  WHERE created_by = NEW.created_by AND is_demo IS NOT TRUE AND id IS DISTINCT FROM NEW.id;
  IF _existing = 0 THEN
    RETURN NEW;
  END IF;
  SELECT s.company_id INTO _sample
  FROM public.company_subscriptions s
  JOIN public.companies c ON c.id = s.company_id
  LEFT JOIN public.billing_plans bp ON bp.code = s.plan_code
  WHERE c.created_by = NEW.created_by AND c.is_demo IS NOT TRUE
  ORDER BY coalesce(bp.plan_rank, 0) DESC
  LIMIT 1;
  IF _sample IS NULL THEN
    RAISE EXCEPTION 'Choose a plan that includes another company before opening a second organisation.';
  END IF;
  _limit := (public.get_entitlements(_sample) -> 'limits' ->> 'companies')::bigint;
  IF _limit IS NOT NULL AND _existing >= _limit THEN
    RAISE EXCEPTION 'This plan includes % companies. Upgrade, or add the extra company add-on, before opening another. Existing organisations stay available.', _limit;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.platform_price_action(_action text, _payload jsonb, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE previous public.plan_versions%rowtype; target public.plan_versions%rowtype; vid uuid; staff_role text; amount integer; floor integer; cur text; cadence text; code text; result_status text;
BEGIN
 staff_role:=public.platform_role();
 IF staff_role IS NULL OR staff_role NOT IN ('platform_owner','platform_finance') THEN RAISE EXCEPTION 'Billing staff and an active MFA session are required' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(_reason,'')))<3 THEN RAISE EXCEPTION 'Record a reason'; END IF;
 PERFORM private.platform_rate_limit();
 PERFORM pg_advisory_xact_lock(47329212);
 IF _action='draft' THEN
 code:=_payload->>'planCode';cur:=_payload->>'currency';cadence:=_payload->>'interval';amount:=(_payload->>'amountMinor')::integer;
 IF cur NOT IN ('USD','GBP','AUD','NZD','INR') OR cadence NOT IN ('month','year') OR code NOT IN (SELECT bp.code FROM public.billing_plans bp WHERE bp.is_active) OR amount IS NULL THEN RAISE EXCEPTION 'Choose a supported plan, currency and interval'; END IF;
 floor:=CASE cur WHEN 'USD' THEN 500 WHEN 'GBP' THEN 400 WHEN 'AUD' THEN 800 WHEN 'NZD' THEN 800 WHEN 'INR' THEN 9900 END * CASE cadence WHEN 'year' THEN 8 ELSE 1 END;
 IF amount<floor THEN RAISE EXCEPTION 'Price is below the configured floor'; END IF;
 SELECT * INTO previous FROM public.plan_versions WHERE plan_code=code ORDER BY version_no DESC LIMIT 1;
 result_status:=CASE WHEN staff_role='platform_finance' AND coalesce((SELECT require_owner_approval FROM public.billing_settings WHERE id),true) THEN 'review' ELSE 'draft' END;
 INSERT INTO public.plan_versions(plan_code,version_no,status,name,audience,summary,visibility,created_by,reason) VALUES(code,coalesce(previous.version_no,0)+1,result_status,coalesce(previous.name,code),coalesce(previous.audience,''),coalesce(previous.summary,''),'draft',auth.uid(),_reason) RETURNING id INTO vid;
 SELECT * INTO previous FROM public.plan_versions WHERE plan_code=code AND status='published' ORDER BY version_no DESC LIMIT 1;
 INSERT INTO public.plan_prices(version_id,currency,billing_interval,amount_minor,needs_review) SELECT vid,currency,billing_interval,amount_minor,needs_review FROM public.plan_prices WHERE version_id=previous.id;
 INSERT INTO public.plan_prices(version_id,currency,billing_interval,amount_minor,needs_review) VALUES(vid,cur,cadence,amount,cur<>'USD') ON CONFLICT(version_id,currency,billing_interval) DO UPDATE SET amount_minor=excluded.amount_minor,needs_review=excluded.needs_review;
 INSERT INTO public.plan_version_limits(version_id,feature_key,enabled,limit_value) SELECT vid,feature_key,enabled,limit_value FROM public.plan_version_limits WHERE version_id=previous.id;
 ELSE
 IF staff_role<>'platform_owner' THEN RAISE EXCEPTION 'Only Superadmin may publish or roll back prices' USING ERRCODE='42501'; END IF;
 IF _action='publish' THEN SELECT * INTO target FROM public.plan_versions WHERE id=(_payload->>'versionId')::uuid AND status IN ('draft','review');
 ELSIF _action='rollback' THEN SELECT * INTO target FROM public.plan_versions WHERE plan_code=_payload->>'planCode' AND status='archived' ORDER BY version_no DESC LIMIT 1;
 ELSE RAISE EXCEPTION 'Unknown price action'; END IF;
 IF target.id IS NULL THEN RAISE EXCEPTION 'No eligible price version'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.plan_prices WHERE version_id=target.id) THEN RAISE EXCEPTION 'A price version must contain prices'; END IF;
 SELECT * INTO previous FROM public.plan_versions WHERE plan_code=target.plan_code AND status='published' LIMIT 1;
 UPDATE public.plan_versions SET status='archived',visibility='hidden' WHERE plan_code=target.plan_code AND status='published';
 UPDATE public.plan_versions SET status='published',visibility='live',published_at=now(),effective_from=now(),reason=_reason WHERE id=target.id;
 vid:=target.id;result_status:='published';
 END IF;
 PERFORM private.platform_log('price.'||_action,'plan_version',vid::text,CASE WHEN previous.id IS NULL THEN NULL ELSE jsonb_build_object('id',previous.id,'status',previous.status) END,jsonb_build_object('id',vid,'status',result_status),_reason);
 RETURN jsonb_build_object('versionId',vid,'status',result_status,'marginWarning',null,'grandfathered',true,'ok',true);
END $function$;

-- ---------------------------------------------------------------------------
-- 7. Public catalogue: features (with availability) and trial settings
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_public_billing_plans()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE(jsonb_agg(row_to_json(p)::jsonb ORDER BY p.sort_order), '[]'::jsonb)
  FROM (
    SELECT v.plan_code AS code, v.name, v.audience, v.summary, v.badge, v.sort_order,
      bp.pricing_source AS "pricingSource",
      jsonb_build_object('enabled', bp.trial_enabled, 'days', bp.trial_days) AS trial,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'currency', pr.currency,
          'interval', pr.billing_interval,
          'amountMinor', pr.amount_minor,
          'needsReview', pr.needs_review
        ))
        FROM public.plan_prices pr
        WHERE pr.version_id = v.id AND pr.archived_at IS NULL
          -- A price is shown only where checkout can charge it (price-book checkout is phase 3).
          AND bp.pricing_source = 'legacy'
      ) AS prices,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'key', f.key,
          'label', f.label,
          'enabled', l.enabled,
          'limit', l.limit_value,
          'metering', f.metering,
          'availability', f.availability
        ) ORDER BY f.category, f.label)
        FROM public.plan_version_limits l
        JOIN public.billing_features f ON f.key = l.feature_key
        WHERE l.version_id = v.id
      ) AS features
    FROM public.plan_versions v
    INNER JOIN public.billing_plans bp ON bp.code = v.plan_code
    WHERE v.status = 'published'
      AND v.visibility = 'live'
      AND bp.is_active
      AND bp.is_public
  ) p;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Guards: no checkout or paid plan change on a plan without published prices
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION billing.guard_legacy_checkout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.billing_plans p WHERE p.code = NEW.plan_code AND p.pricing_source = 'legacy'
  ) THEN
    RAISE EXCEPTION 'Checkout for this plan opens once its prices are published.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS billing_checkouts_legacy_guard ON public.billing_checkouts;
CREATE TRIGGER billing_checkouts_legacy_guard BEFORE INSERT ON public.billing_checkouts
  FOR EACH ROW EXECUTE FUNCTION billing.guard_legacy_checkout();

CREATE OR REPLACE FUNCTION billing.guard_paid_plan_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.plan_code IS DISTINCT FROM OLD.plan_code
     AND NEW.provider <> 'none'
     AND EXISTS (SELECT 1 FROM public.billing_plans p WHERE p.code = NEW.plan_code AND p.pricing_source <> 'legacy')
  THEN
    RAISE EXCEPTION 'Paid subscriptions can move to this plan once its prices are published.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS company_subscriptions_paid_plan_guard ON public.company_subscriptions;
CREATE TRIGGER company_subscriptions_paid_plan_guard BEFORE UPDATE OF plan_code ON public.company_subscriptions
  FOR EACH ROW EXECUTE FUNCTION billing.guard_paid_plan_change();

-- ---------------------------------------------------------------------------
-- 9. Existing subscriptions: Growth trials continue on PRO (same allocation), dates kept
-- ---------------------------------------------------------------------------
UPDATE public.company_subscriptions s
   SET plan_code = 'pro',
       price_version_id = (SELECT v.id FROM public.plan_versions v
                            WHERE v.plan_code = 'pro' AND v.status = 'published'
                            ORDER BY v.version_no DESC LIMIT 1),
       updated_at = now()
 WHERE s.plan_code = 'growth' AND s.status = 'trialing' AND s.provider = 'none';

-- ---------------------------------------------------------------------------
-- 10. Platform administration (aal2 platform staff; every change is audited)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_set_plan_trial(
  _plan_code text, _enabled boolean, _days integer, _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  before_row public.billing_plans%ROWTYPE;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF _enabled IS NULL OR _days IS NULL OR _days NOT BETWEEN 1 AND 365 THEN
    RAISE EXCEPTION 'Trial length must be between 1 and 365 days' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO before_row FROM public.billing_plans WHERE code = _plan_code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown plan' USING ERRCODE = '22023';
  END IF;
  UPDATE public.billing_plans SET trial_enabled = _enabled, trial_days = _days, updated_at = now()
   WHERE code = _plan_code;
  PERFORM private.platform_log('plan.trial_updated', 'billing_plan', _plan_code,
    jsonb_build_object('trialEnabled', before_row.trial_enabled, 'trialDays', before_row.trial_days),
    jsonb_build_object('trialEnabled', _enabled, 'trialDays', _days), _reason);
  RETURN jsonb_build_object('planCode', _plan_code, 'trialEnabled', _enabled, 'trialDays', _days);
END $$;

CREATE OR REPLACE FUNCTION public.platform_set_trial_rule(
  _rule_key text, _enabled boolean, _max_count integer, _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  before_row billing.trial_eligibility_rules%ROWTYPE;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF _enabled IS NULL OR _max_count IS NULL OR _max_count < 1 THEN
    RAISE EXCEPTION 'A trial rule needs an on/off state and a maximum of at least 1' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO before_row FROM billing.trial_eligibility_rules WHERE rule_key = _rule_key FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown trial rule' USING ERRCODE = '22023';
  END IF;
  UPDATE billing.trial_eligibility_rules
     SET enabled = _enabled, max_count = _max_count, updated_at = now(), updated_by = auth.uid()
   WHERE rule_key = _rule_key;
  PERFORM private.platform_log('trial_rule.updated', 'trial_rule', _rule_key,
    jsonb_build_object('enabled', before_row.enabled, 'maxCount', before_row.max_count),
    jsonb_build_object('enabled', _enabled, 'maxCount', _max_count), _reason);
  RETURN jsonb_build_object('ruleKey', _rule_key, 'enabled', _enabled, 'maxCount', _max_count);
END $$;

-- Feature and limit changes never edit a published version (customers keep what they bought).
-- They create a draft version, copied from the published one, that is published through the
-- existing price workflow.
CREATE OR REPLACE FUNCTION public.platform_draft_plan_limits(_plan_code text, _changes jsonb, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  published public.plan_versions%ROWTYPE;
  vid uuid;
  staff_role text := public.platform_role();
  change jsonb;
  feature text;
  status_text text;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason' USING ERRCODE = '22023';
  END IF;
  IF _changes IS NULL OR jsonb_typeof(_changes) <> 'array' OR jsonb_array_length(_changes) = 0
     OR jsonb_array_length(_changes) > 100 THEN
    RAISE EXCEPTION 'Provide between 1 and 100 feature changes' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO published FROM public.plan_versions
   WHERE plan_code = _plan_code AND status = 'published' ORDER BY version_no DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The plan has no published version to start from' USING ERRCODE = '22023';
  END IF;
  status_text := CASE WHEN staff_role = 'platform_finance'
    AND coalesce((SELECT require_owner_approval FROM public.billing_settings WHERE id), true)
    THEN 'review' ELSE 'draft' END;
  INSERT INTO public.plan_versions (plan_code, version_no, status, name, audience, summary, badge, sort_order, visibility, created_by, reason)
  SELECT _plan_code, max(v.version_no) + 1, status_text, published.name, published.audience, published.summary,
         published.badge, published.sort_order, 'draft', auth.uid(), _reason
    FROM public.plan_versions v WHERE v.plan_code = _plan_code
  RETURNING id INTO vid;
  INSERT INTO public.plan_prices (version_id, currency, billing_interval, amount_minor, needs_review)
  SELECT vid, currency, billing_interval, amount_minor, needs_review
    FROM public.plan_prices WHERE version_id = published.id AND archived_at IS NULL;
  INSERT INTO public.plan_version_limits (version_id, feature_key, enabled, limit_value)
  SELECT vid, feature_key, enabled, limit_value FROM public.plan_version_limits WHERE version_id = published.id;

  FOR change IN SELECT value FROM jsonb_array_elements(_changes) LOOP
    feature := change ->> 'featureKey';
    IF feature IS NULL OR NOT EXISTS (SELECT 1 FROM public.billing_features f WHERE f.key = feature) THEN
      RAISE EXCEPTION 'Unknown feature %', coalesce(feature, '(missing)') USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(change -> 'enabled') <> 'boolean'
       OR (change ? 'limit' AND jsonb_typeof(change -> 'limit') NOT IN ('number', 'null'))
       OR (jsonb_typeof(change -> 'limit') = 'number' AND (change ->> 'limit')::numeric < 0)
    THEN
      RAISE EXCEPTION 'Feature % needs enabled true/false and a non-negative limit or null', feature USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.plan_version_limits (version_id, feature_key, enabled, limit_value)
    VALUES (vid, feature, (change ->> 'enabled')::boolean,
            CASE WHEN jsonb_typeof(change -> 'limit') = 'number' THEN (change ->> 'limit')::bigint END)
    ON CONFLICT (version_id, feature_key) DO UPDATE
      SET enabled = EXCLUDED.enabled, limit_value = EXCLUDED.limit_value;
  END LOOP;

  PERFORM private.platform_log('plan.limits_drafted', 'plan_version', vid::text,
    jsonb_build_object('fromVersionId', published.id), jsonb_build_object('changes', _changes, 'status', status_text), _reason);
  RETURN jsonb_build_object('versionId', vid, 'status', status_text, 'fromVersionId', published.id);
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'billing.trial_eligibility(uuid, uuid)', 'billing.guard_legacy_checkout()', 'billing.guard_paid_plan_change()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', f);
    EXCEPTION WHEN undefined_object THEN NULL; END;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.platform_set_plan_trial(text, boolean, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_set_trial_rule(text, boolean, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_draft_plan_limits(text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_plan_trial(text, boolean, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_set_trial_rule(text, boolean, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_draft_plan_limits(text, jsonb, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_company_trial(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_company_trial(uuid, text) TO authenticated, service_role;
