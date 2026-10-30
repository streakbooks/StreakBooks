-- Extends the subscription sketch into versioned plans, entitlements and platform roles.
-- Does not drop ledger data or the original billing tables.

ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS card_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_owner_approval BOOLEAN NOT NULL DEFAULT true;

INSERT INTO public.billing_plans (
  code, name, audience, summary, monthly_gbp, monthly_usd, monthly_inr,
  users_included, invoices_per_month, bills_per_month, multi_currency, highlights, sort_order, is_public
) VALUES
  ('growth', 'Growth', 'Growing businesses', 'The plan most businesses start on after the trial.',
    2400, 3000, 249900, 5, NULL, NULL, true,
    '["Most popular","5 users and 2 accountant seats","3 companies","Unlimited invoices and bills"]'::jsonb, 2, true),
  ('pro', 'Pro', 'Established businesses', 'Inventory, projects, budgeting and API access.',
    4700, 6000, 499900, 15, NULL, NULL, true,
    '["15 users and 3 accountant seats","10 companies","Inventory, projects and budgeting","API access"]'::jsonb, 3, true)
ON CONFLICT (code) DO NOTHING;

UPDATE public.billing_plans SET
  name = 'Starter',
  monthly_gbp = 900, monthly_usd = 1200, monthly_inr = 99900,
  users_included = 1, invoices_per_month = 150, bills_per_month = 50,
  summary = 'Full double-entry books for a one-person business.',
  highlights = '["1 user and 1 accountant seat","1 company","150 invoices and 50 bills a month","CSV and OFX bank import"]'::jsonb
WHERE code = 'starter';

UPDATE public.billing_plans SET
  name = 'Practice',
  monthly_gbp = 7800, monthly_usd = 9900, monthly_inr = 829900,
  users_included = 1000,
  summary = 'For accountants and CPA firms.',
  highlights = '["15 client companies included","Extra client company is an add-on","Firm workspace"]'::jsonb,
  sort_order = 4
WHERE code = 'practice';

UPDATE public.billing_plans SET is_public = false WHERE code IN ('standard', 'premium');

UPDATE public.billing_settings
SET trial_days = 14, trial_plan_code = 'growth', annual_free_months = 2, card_required = false
WHERE id = true;

ALTER TABLE public.billing_offers
  ADD COLUMN IF NOT EXISTS duration_months INTEGER CHECK (duration_months IS NULL OR duration_months BETWEEN 1 AND 36);

ALTER TABLE public.billing_offers DROP CONSTRAINT IF EXISTS billing_offers_kind_check;
ALTER TABLE public.billing_offers
  ADD CONSTRAINT billing_offers_kind_check
  CHECK (kind IN ('percent', 'amount', 'extra_trial_days', 'extra_free_months', 'price_lock'));

CREATE TABLE IF NOT EXISTS public.platform_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('platform_owner', 'platform_finance', 'platform_support')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.platform_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.platform_roles WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.platform_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_billing_operator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.platform_role() IN ('platform_owner', 'platform_finance');
$$;

DROP POLICY IF EXISTS platform_roles_select ON public.platform_roles;
CREATE POLICY platform_roles_select ON public.platform_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.platform_role() = 'platform_owner');

DROP POLICY IF EXISTS platform_roles_write ON public.platform_roles;
CREATE POLICY platform_roles_write ON public.platform_roles
  FOR ALL TO authenticated
  USING (public.platform_role() = 'platform_owner')
  WITH CHECK (public.platform_role() = 'platform_owner' AND role IN ('platform_finance', 'platform_support', 'platform_owner'));

GRANT SELECT ON public.platform_roles TO authenticated;

CREATE TABLE IF NOT EXISTS public.plan_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code TEXT NOT NULL REFERENCES public.billing_plans(code),
  version_no INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'review', 'published', 'archived')),
  name TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  badge TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'live' CHECK (visibility IN ('draft', 'live', 'hidden')),
  effective_from TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_by UUID,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_code, version_no)
);

CREATE INDEX IF NOT EXISTS plan_versions_published_idx
  ON public.plan_versions (plan_code) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS public.plan_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES public.plan_versions(id) ON DELETE CASCADE,
  currency CHAR(3) NOT NULL,
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('month', 'year')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  needs_review BOOLEAN NOT NULL DEFAULT false,
  stripe_price_id TEXT,
  archived_at TIMESTAMPTZ,
  UNIQUE (version_id, currency, billing_interval)
);

CREATE TABLE IF NOT EXISTS public.billing_features (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.plan_version_limits (
  version_id UUID NOT NULL REFERENCES public.plan_versions(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL REFERENCES public.billing_features(key),
  enabled BOOLEAN NOT NULL DEFAULT true,
  limit_value BIGINT,
  PRIMARY KEY (version_id, feature_key)
);

CREATE TABLE IF NOT EXISTS public.billing_addons (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  currency CHAR(3) NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  unit_label TEXT NOT NULL,
  self_serve BOOLEAN NOT NULL DEFAULT true,
  needs_review BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.billing_cost_inputs (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  unit_cost_minor_usd INTEGER NOT NULL,
  typical_quantity INTEGER NOT NULL DEFAULT 0,
  max_quantity INTEGER NOT NULL DEFAULT 0,
  source_url TEXT,
  needs_review BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.price_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  action TEXT NOT NULL,
  plan_code TEXT,
  before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_billing_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.usage_counters (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  metric TEXT NOT NULL,
  quantity BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, period_start, metric)
);

ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS price_version_id UUID REFERENCES public.plan_versions(id),
  ADD COLUMN IF NOT EXISTS grandfathered BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS scheduled_plan_code TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_only_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_lock_until TIMESTAMPTZ;

ALTER TABLE public.company_subscriptions DROP CONSTRAINT IF EXISTS company_subscriptions_status_check;
ALTER TABLE public.company_subscriptions
  ADD CONSTRAINT company_subscriptions_status_check
  CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'expired', 'complimentary', 'paused'));

ALTER TABLE public.plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_version_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_cost_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_billing_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_versions_select ON public.plan_versions;
CREATE POLICY plan_versions_select ON public.plan_versions
  FOR SELECT TO authenticated
  USING (status = 'published' AND visibility = 'live' OR public.platform_role() IS NOT NULL);

DROP POLICY IF EXISTS plan_prices_select ON public.plan_prices;
CREATE POLICY plan_prices_select ON public.plan_prices
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.plan_versions v
      WHERE v.id = version_id AND v.status = 'published' AND v.visibility = 'live'
    )
    OR public.platform_role() IS NOT NULL
  );

DROP POLICY IF EXISTS billing_features_select ON public.billing_features;
CREATE POLICY billing_features_select ON public.billing_features
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS plan_limits_select ON public.plan_version_limits;
CREATE POLICY plan_limits_select ON public.plan_version_limits
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS billing_addons_select ON public.billing_addons;
CREATE POLICY billing_addons_select ON public.billing_addons
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS billing_cost_select ON public.billing_cost_inputs;
CREATE POLICY billing_cost_select ON public.billing_cost_inputs
  FOR SELECT TO authenticated USING (public.platform_role() IS NOT NULL);

DROP POLICY IF EXISTS price_change_select ON public.price_change_log;
CREATE POLICY price_change_select ON public.price_change_log
  FOR SELECT TO authenticated USING (public.platform_role() IS NOT NULL);

DROP POLICY IF EXISTS platform_audit_select ON public.platform_billing_audit;
CREATE POLICY platform_audit_select ON public.platform_billing_audit
  FOR SELECT TO authenticated USING (public.platform_role() IS NOT NULL);

DROP POLICY IF EXISTS usage_counters_select ON public.usage_counters;
CREATE POLICY usage_counters_select ON public.usage_counters
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS billing_checkouts_update ON public.billing_checkouts;

GRANT SELECT ON public.plan_versions, public.plan_prices, public.billing_features,
  public.plan_version_limits, public.billing_addons, public.usage_counters TO authenticated;
GRANT SELECT ON public.billing_cost_inputs, public.price_change_log, public.platform_billing_audit TO authenticated;

INSERT INTO public.billing_features (key, label) VALUES
  ('companies', 'Companies'),
  ('users', 'Users'),
  ('accountant_seats', 'Accountant seats'),
  ('invoices', 'Invoices per month'),
  ('bills', 'Bills per month'),
  ('storage_bytes', 'File storage'),
  ('ai_queries', 'AI questions per month'),
  ('voice_minutes', 'Voice minutes per month'),
  ('bank_import', 'CSV and OFX bank import'),
  ('bank_feeds', 'Live bank feeds'),
  ('multi_currency', 'Multi-currency'),
  ('approvals', 'Approvals'),
  ('client_portal', 'Client portal'),
  ('expense_claims', 'Expense claims'),
  ('inventory', 'Inventory'),
  ('projects', 'Projects'),
  ('budgeting', 'Budgeting'),
  ('custom_fields', 'Custom fields'),
  ('api', 'API access'),
  ('audit_centre', 'Advanced audit centre'),
  ('white_label', 'White-label portal')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.billing_addons (code, name, description, currency, amount_minor, unit_label, self_serve, needs_review) VALUES
  ('extra_user', 'Extra user', 'One additional user seat.', 'USD', 600, 'user / month', true, false),
  ('extra_company', 'Extra client company', 'One additional client company on Practice.', 'USD', 400, 'company / month', true, false),
  ('ai_pack', 'AI question pack', '500 additional AI questions.', 'USD', 1000, 'pack', true, true),
  ('voice_pack', 'Voice minute pack', '60 additional voice minutes.', 'USD', 1500, 'pack', true, true),
  ('storage_10gb', 'Extra 10 GB', 'Additional file storage.', 'USD', 500, '10 GB / month', true, true),
  ('managed_bookkeeping', 'Managed bookkeeping', 'Quoted by Link Business Advisory. Not sold in checkout.', 'USD', 0, 'quote', false, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.billing_cost_inputs (key, label, unit_cost_minor_usd, typical_quantity, max_quantity, source_url, needs_review) VALUES
  ('card_fee_bps', 'Card fee on the subscription charge, basis points', 290, 1, 1, 'https://stripe.com/pricing', true),
  ('card_fixed_minor', 'Card fixed fee, US cents', 30, 1, 1, 'https://stripe.com/pricing', true),
  ('ai_query', 'Model cost per AI question, US cents', 2, 20, 500, 'https://openai.com/api/pricing/', true),
  ('storage_gb', 'Object storage per GB-month, US cents', 3, 1, 50, 'https://aws.amazon.com/s3/pricing/', true),
  ('bank_feed', 'Bank-feed connection per month, US cents', 150, 0, 3, 'https://plaid.com/pricing/', true)
ON CONFLICT (key) DO NOTHING;

-- Published version 1 for the four live plans. Non-USD prices are a rounding draft.
DO $$
DECLARE
  _plan RECORD;
  _version UUID;
BEGIN
  FOR _plan IN
    SELECT * FROM (VALUES
      ('starter', 'Starter', 'Sole traders', 'Full double-entry for one company.', NULL, 1),
      ('growth', 'Growth', 'Growing businesses', 'Most businesses start here.', 'Most popular', 2),
      ('pro', 'Pro', 'Established businesses', 'Inventory, projects, budgeting and API.', NULL, 3),
      ('practice', 'Practice', 'Accountants', 'Fifteen client companies and a firm workspace.', NULL, 4)
    ) AS t(code, name, audience, summary, badge, sort_order)
  LOOP
    INSERT INTO public.plan_versions (
      plan_code, version_no, status, name, audience, summary, badge, sort_order, visibility, effective_from, published_at, reason
    ) VALUES (
      _plan.code, 1, 'published', _plan.name, _plan.audience, _plan.summary, _plan.badge, _plan.sort_order, 'live', now(), now(), 'Initial published version'
    )
    ON CONFLICT (plan_code, version_no) DO NOTHING;

    SELECT id INTO _version FROM public.plan_versions WHERE plan_code = _plan.code AND version_no = 1;

    INSERT INTO public.plan_prices (version_id, currency, billing_interval, amount_minor, needs_review) VALUES
      (_version, 'USD', 'month', (SELECT monthly_usd FROM public.billing_plans WHERE code = _plan.code), false),
      (_version, 'USD', 'year', (SELECT monthly_usd * 10 FROM public.billing_plans WHERE code = _plan.code), false),
      (_version, 'GBP', 'month', (SELECT monthly_gbp FROM public.billing_plans WHERE code = _plan.code), true),
      (_version, 'GBP', 'year', (SELECT monthly_gbp * 10 FROM public.billing_plans WHERE code = _plan.code), true),
      (_version, 'INR', 'month', (SELECT monthly_inr FROM public.billing_plans WHERE code = _plan.code), true),
      (_version, 'INR', 'year', (SELECT monthly_inr * 10 FROM public.billing_plans WHERE code = _plan.code), true)
    ON CONFLICT (version_id, currency, billing_interval) DO NOTHING;

    IF _plan.code = 'starter' THEN
      INSERT INTO public.plan_prices (version_id, currency, billing_interval, amount_minor, needs_review) VALUES
        (_version, 'AUD', 'month', 1800, true), (_version, 'AUD', 'year', 18000, true),
        (_version, 'NZD', 'month', 2000, true), (_version, 'NZD', 'year', 20000, true)
      ON CONFLICT DO NOTHING;
    ELSIF _plan.code = 'growth' THEN
      INSERT INTO public.plan_prices (version_id, currency, billing_interval, amount_minor, needs_review) VALUES
        (_version, 'AUD', 'month', 4600, true), (_version, 'AUD', 'year', 46000, true),
        (_version, 'NZD', 'month', 5000, true), (_version, 'NZD', 'year', 50000, true)
      ON CONFLICT DO NOTHING;
    ELSIF _plan.code = 'pro' THEN
      INSERT INTO public.plan_prices (version_id, currency, billing_interval, amount_minor, needs_review) VALUES
        (_version, 'AUD', 'month', 9100, true), (_version, 'AUD', 'year', 91000, true),
        (_version, 'NZD', 'month', 10000, true), (_version, 'NZD', 'year', 100000, true)
      ON CONFLICT DO NOTHING;
    ELSE
      INSERT INTO public.plan_prices (version_id, currency, billing_interval, amount_minor, needs_review) VALUES
        (_version, 'AUD', 'month', 15000, true), (_version, 'AUD', 'year', 150000, true),
        (_version, 'NZD', 'month', 16400, true), (_version, 'NZD', 'year', 164000, true)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Limits: null means unlimited. enabled false means the feature is off.
INSERT INTO public.plan_version_limits (version_id, feature_key, enabled, limit_value)
SELECT v.id, x.feature_key, x.enabled, x.limit_value
FROM public.plan_versions v
JOIN (VALUES
  ('starter', 'companies', true, 1::bigint),
  ('starter', 'users', true, 1),
  ('starter', 'accountant_seats', true, 1),
  ('starter', 'invoices', true, 150),
  ('starter', 'bills', true, 50),
  ('starter', 'storage_bytes', true, 1073741824),
  ('starter', 'ai_queries', true, 50),
  ('starter', 'voice_minutes', false, 0),
  ('starter', 'bank_import', true, NULL),
  ('starter', 'bank_feeds', false, 0),
  ('starter', 'multi_currency', false, 0),
  ('growth', 'companies', true, 3),
  ('growth', 'users', true, 5),
  ('growth', 'accountant_seats', true, 2),
  ('growth', 'invoices', true, NULL),
  ('growth', 'bills', true, NULL),
  ('growth', 'storage_bytes', true, 10737418240),
  ('growth', 'ai_queries', true, 500),
  ('growth', 'voice_minutes', true, 60),
  ('growth', 'bank_feeds', true, NULL),
  ('growth', 'multi_currency', true, NULL),
  ('growth', 'approvals', true, NULL),
  ('growth', 'client_portal', true, NULL),
  ('growth', 'expense_claims', true, NULL),
  ('pro', 'companies', true, 10),
  ('pro', 'users', true, 15),
  ('pro', 'accountant_seats', true, 3),
  ('pro', 'invoices', true, NULL),
  ('pro', 'bills', true, NULL),
  ('pro', 'storage_bytes', true, 53687091200),
  ('pro', 'ai_queries', true, 2000),
  ('pro', 'voice_minutes', true, 300),
  ('pro', 'inventory', true, NULL),
  ('pro', 'projects', true, NULL),
  ('pro', 'budgeting', true, NULL),
  ('pro', 'custom_fields', true, NULL),
  ('pro', 'api', true, NULL),
  ('pro', 'audit_centre', true, NULL),
  ('practice', 'companies', true, 15),
  ('practice', 'users', true, NULL),
  ('practice', 'accountant_seats', true, NULL),
  ('practice', 'invoices', true, NULL),
  ('practice', 'bills', true, NULL),
  ('practice', 'storage_bytes', true, 107374182400),
  ('practice', 'ai_queries', true, 5000),
  ('practice', 'voice_minutes', true, 600),
  ('practice', 'white_label', true, NULL),
  ('practice', 'api', true, NULL),
  ('practice', 'audit_centre', true, NULL)
) AS x(plan_code, feature_key, enabled, limit_value) ON x.plan_code = v.plan_code AND v.version_no = 1
ON CONFLICT DO NOTHING;

UPDATE public.company_subscriptions SET plan_code = 'growth'
WHERE plan_code = 'standard' AND provider = 'none';
UPDATE public.company_subscriptions SET plan_code = 'pro'
WHERE plan_code = 'premium' AND provider = 'none';

UPDATE public.company_subscriptions s
SET price_version_id = v.id
FROM public.plan_versions v
WHERE v.plan_code = s.plan_code AND v.status = 'published' AND s.price_version_id IS NULL;

CREATE OR REPLACE FUNCTION public.subscription_allows_posting(_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.companies c WHERE c.id = _company_id AND c.is_demo) THEN true
    WHEN NOT EXISTS (SELECT 1 FROM public.company_subscriptions s WHERE s.company_id = _company_id) THEN false
    ELSE COALESCE((
      SELECT CASE
        WHEN s.status = 'complimentary' THEN true
        WHEN s.status = 'paused' THEN false
        WHEN s.status IN ('cancelled', 'expired') THEN false
        WHEN s.status = 'trialing' AND s.trial_ends_at > now() THEN true
        WHEN s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > now()) THEN true
        WHEN s.status = 'past_due' AND (
          s.current_period_end IS NULL
          OR s.current_period_end + make_interval(days => COALESCE(st.past_due_grace_days, 7)) > now()
        ) THEN true
        ELSE false
      END
      FROM public.company_subscriptions s
      LEFT JOIN public.billing_settings st ON st.id = true
      WHERE s.company_id = _company_id
    ), false)
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_entitlements(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub public.company_subscriptions%ROWTYPE;
  _version UUID;
  _access TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_company_member(_company_id) AND public.platform_role() IS NULL THEN
    RAISE EXCEPTION 'You do not have access to that organisation.';
  END IF;
  SELECT * INTO _sub FROM public.company_subscriptions WHERE company_id = _company_id;
  _access := CASE WHEN public.subscription_allows_posting(_company_id) THEN 'full' ELSE 'read_only' END;
  _version := _sub.price_version_id;
  IF _version IS NULL AND _sub.plan_code IS NOT NULL THEN
    SELECT id INTO _version FROM public.plan_versions
    WHERE plan_code = _sub.plan_code AND status = 'published'
    ORDER BY version_no DESC LIMIT 1;
  END IF;
  RETURN jsonb_build_object(
    'access', _access,
    'planCode', _sub.plan_code,
    'versionId', _version,
    'limits', COALESCE((
      SELECT jsonb_object_agg(feature_key, limit_value)
      FROM public.plan_version_limits WHERE version_id = _version AND enabled
    ), '{}'::jsonb),
    'features', COALESCE((
      SELECT jsonb_object_agg(feature_key, enabled)
      FROM public.plan_version_limits WHERE version_id = _version
    ), '{}'::jsonb),
    'usage', jsonb_build_object(
      'invoices', (SELECT count(*) FROM public.sales_invoices WHERE company_id = _company_id AND created_at >= date_trunc('month', now())),
      'bills', (SELECT count(*) FROM public.purchase_bills WHERE company_id = _company_id AND created_at >= date_trunc('month', now())),
      'users', (SELECT count(*) FROM public.company_members WHERE company_id = _company_id AND status = 'active' AND role <> 'accountant'),
      'accountant_seats', (SELECT count(*) FROM public.company_members WHERE company_id = _company_id AND status = 'active' AND role = 'accountant'),
      'storage_bytes', COALESCE((SELECT sum(size_bytes) FROM public.document_attachments WHERE company_id = _company_id), 0),
      'ai_queries', COALESCE((SELECT quantity FROM public.usage_counters WHERE company_id = _company_id AND metric = 'ai_queries' AND period_start = date_trunc('month', now())::date), 0)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_entitlements(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_entitlements(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.assert_billing_allowance(
  _company_id UUID,
  _metric TEXT,
  _adding BIGINT DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ent JSONB;
  _limit BIGINT;
  _used BIGINT;
  _enabled BOOLEAN;
BEGIN
  IF EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id AND is_demo) THEN
    RETURN;
  END IF;
  IF NOT public.subscription_allows_posting(_company_id) THEN
    RAISE EXCEPTION 'This organisation is read-only until a plan is active. Existing reports and files stay available. Open Settings → Subscription.';
  END IF;
  _ent := public.get_entitlements(_company_id);
  _enabled := COALESCE((_ent -> 'features' ->> _metric)::boolean, true);
  IF _enabled IS FALSE THEN
    RAISE EXCEPTION 'This feature is not included on the current plan. Open Settings → Subscription to compare plans. Existing records stay available.';
  END IF;
  IF (_ent -> 'limits' ->> _metric) IS NULL THEN
    RETURN;
  END IF;
  _limit := (_ent -> 'limits' ->> _metric)::bigint;
  _used := COALESCE((_ent -> 'usage' ->> _metric)::bigint, 0);
  IF _used + COALESCE(_adding, 1) > _limit THEN
    RAISE EXCEPTION 'The % limit of % is reached. Open Settings → Subscription to upgrade. Existing records stay available.', replace(_metric, '_', ' '), _limit;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_billing_allowance(UUID, TEXT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_billing_allowance(UUID, TEXT, BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_billing_usage(_company_id UUID, _metric TEXT, _adding BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'You do not have access to that organisation.';
  END IF;
  INSERT INTO public.usage_counters (company_id, period_start, metric, quantity)
  VALUES (_company_id, date_trunc('month', now())::date, _metric, GREATEST(_adding, 0))
  ON CONFLICT (company_id, period_start, metric)
  DO UPDATE SET quantity = public.usage_counters.quantity + GREATEST(_adding, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.record_billing_usage(UUID, TEXT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_billing_usage(UUID, TEXT, BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_public_billing_plans()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(p)::jsonb ORDER BY p.sort_order), '[]'::jsonb)
  FROM (
    SELECT v.plan_code AS code, v.name, v.audience, v.summary, v.badge, v.sort_order,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'currency', pr.currency,
          'interval', pr.billing_interval,
          'amountMinor', pr.amount_minor,
          'needsReview', pr.needs_review
        ))
        FROM public.plan_prices pr
        WHERE pr.version_id = v.id AND pr.archived_at IS NULL
      ) AS prices
    FROM public.plan_versions v
    WHERE v.status = 'published' AND v.visibility = 'live'
  ) p;
$$;

REVOKE ALL ON FUNCTION public.list_public_billing_plans() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_billing_plans() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_document_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _base CHAR(3);
  _foreign BOOLEAN;
BEGIN
  SELECT base_currency INTO _base FROM public.companies WHERE id = NEW.company_id;
  _foreign := NEW.currency_code IS NOT NULL AND _base IS NOT NULL AND NEW.currency_code <> _base;
  IF _foreign AND COALESCE((public.get_entitlements(NEW.company_id) -> 'features' ->> 'multi_currency')::boolean, false) IS FALSE THEN
    RAISE EXCEPTION 'Multi-currency documents need a plan that includes them. The document currency has to match the organisation currency, or you can upgrade.';
  END IF;
  PERFORM public.assert_billing_allowance(
    NEW.company_id,
    CASE WHEN TG_TABLE_NAME = 'sales_invoices' THEN 'invoices' ELSE 'bills' END,
    1
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_subscription_seats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' AND OLD.role = NEW.role THEN
    RETURN NEW;
  END IF;
  PERFORM public.assert_billing_allowance(
    NEW.company_id,
    CASE WHEN NEW.role = 'accountant' THEN 'accountant_seats' ELSE 'users' END,
    1
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_storage_allowance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_billing_allowance(NEW.company_id, 'storage_bytes', COALESCE(NEW.size_bytes, 0));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS document_attachments_storage_allowance ON public.document_attachments;
CREATE TRIGGER document_attachments_storage_allowance
  BEFORE INSERT ON public.document_attachments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_storage_allowance();

CREATE OR REPLACE FUNCTION public.enforce_company_allowance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  WHERE c.created_by = NEW.created_by AND c.is_demo IS NOT TRUE
  ORDER BY CASE s.plan_code WHEN 'practice' THEN 4 WHEN 'pro' THEN 3 WHEN 'growth' THEN 2 ELSE 1 END DESC
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
$$;

DROP TRIGGER IF EXISTS companies_plan_allowance ON public.companies;
CREATE TRIGGER companies_plan_allowance
  BEFORE INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_company_allowance();

CREATE OR REPLACE FUNCTION public.redeem_billing_offer(_code TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.billing_offers
  SET redemption_count = redemption_count + 1
  WHERE upper(code) = upper(btrim(_code))
    AND (max_redemptions IS NULL OR redemption_count < max_redemptions);
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_billing_offer(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.attach_company_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings public.billing_settings%ROWTYPE;
  _currency CHAR(3);
  _plan TEXT;
  _version UUID;
BEGIN
  SELECT * INTO _settings FROM public.billing_settings WHERE id = true;
  _currency := CASE
    WHEN NEW.base_currency IN ('USD', 'GBP', 'AUD', 'NZD', 'INR') THEN NEW.base_currency
    ELSE 'USD'
  END;
  _plan := CASE WHEN NEW.is_demo THEN 'practice' ELSE COALESCE(_settings.trial_plan_code, 'growth') END;
  SELECT id INTO _version FROM public.plan_versions
  WHERE plan_code = _plan AND status = 'published'
  ORDER BY version_no DESC LIMIT 1;
  INSERT INTO public.company_subscriptions (
    company_id, plan_code, status, billing_interval, provider, currency,
    trial_started_at, trial_ends_at, price_version_id
  ) VALUES (
    NEW.id,
    _plan,
    CASE WHEN NEW.is_demo THEN 'complimentary' ELSE 'trialing' END,
    'month',
    'none',
    _currency,
    CASE WHEN NEW.is_demo THEN NULL ELSE now() END,
    CASE WHEN NEW.is_demo THEN NULL ELSE now() + make_interval(days => COALESCE(_settings.trial_days, 14)) END,
    _version
  )
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$$;
