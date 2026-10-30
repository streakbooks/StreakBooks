-- Organisation subscriptions: plans, promo codes, trials and provider state.
-- Posting maths is unchanged. A lapsed subscription blocks new journals and
-- new documents; existing reports stay readable. Demo companies are complimentary.

CREATE TABLE IF NOT EXISTS public.billing_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  trial_days INTEGER NOT NULL DEFAULT 30 CHECK (trial_days >= 0 AND trial_days <= 365),
  trial_plan_code TEXT NOT NULL DEFAULT 'standard',
  annual_free_months INTEGER NOT NULL DEFAULT 2 CHECK (annual_free_months >= 0 AND annual_free_months <= 11),
  past_due_grace_days INTEGER NOT NULL DEFAULT 7 CHECK (past_due_grace_days >= 0 AND past_due_grace_days <= 60),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.billing_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.billing_plans (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  audience TEXT NOT NULL,
  summary TEXT NOT NULL,
  monthly_gbp INTEGER NOT NULL CHECK (monthly_gbp >= 0),
  monthly_usd INTEGER NOT NULL CHECK (monthly_usd >= 0),
  monthly_inr INTEGER NOT NULL CHECK (monthly_inr >= 0),
  users_included INTEGER NOT NULL CHECK (users_included >= 1),
  invoices_per_month INTEGER CHECK (invoices_per_month IS NULL OR invoices_per_month >= 0),
  bills_per_month INTEGER CHECK (bills_per_month IS NULL OR bills_per_month >= 0),
  multi_currency BOOLEAN NOT NULL DEFAULT false,
  highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.billing_plans (
  code, name, audience, summary, monthly_gbp, monthly_usd, monthly_inr,
  users_included, invoices_per_month, bills_per_month, multi_currency, highlights, sort_order
) VALUES
  ('starter', 'Starter', 'Sole traders', 'Full double-entry books for a one-person business.',
    1200, 1500, 49900, 2, 20, 5, false,
    '["Quotes, invoices, bills, VAT and reports","Bank reconciliation","2 users, including an accountant","20 invoices and 5 bills a month"]'::jsonb, 1),
  ('standard', 'Standard', 'Growing businesses', 'Unlimited documents, multi-currency and projects.',
    2900, 3500, 149900, 5, NULL, NULL, true,
    '["Everything in Starter","Unlimited invoices and bills","5 users","Multi-currency and projects","Bank rules"]'::jsonb, 2),
  ('premium', 'Premium', 'Established businesses', 'More seats, fixed assets, budgets and expense approvals.',
    4900, 5900, 299900, 10, NULL, NULL, true,
    '["Everything in Standard","10 users","Fixed assets and budgets","Expense approvals"]'::jsonb, 3),
  ('practice', 'Practice', 'Accountants', 'Firm tools and a larger team on the same ledger.',
    9900, 11900, 599900, 25, NULL, NULL, true,
    '["Everything in Premium","25 users","Accountant and firm workspace"]'::jsonb, 4)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.billing_offers (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('percent', 'amount', 'extra_trial_days', 'extra_free_months')),
  percent_bps INTEGER NOT NULL DEFAULT 0 CHECK (percent_bps >= 0 AND percent_bps <= 10000),
  amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  amount_currency CHAR(3),
  extra_trial_days INTEGER NOT NULL DEFAULT 0 CHECK (extra_trial_days >= 0 AND extra_trial_days <= 365),
  extra_free_months INTEGER NOT NULL DEFAULT 0 CHECK (extra_free_months >= 0 AND extra_free_months <= 11),
  intervals TEXT NOT NULL DEFAULT 'any' CHECK (intervals IN ('any', 'month', 'year')),
  plan_codes TEXT[] ,
  starts_on DATE,
  ends_on DATE,
  max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions >= 0),
  redemption_count INTEGER NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  is_active BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_offers_window CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

INSERT INTO public.billing_offers (code, name, kind, percent_bps, intervals, is_active)
VALUES ('WELCOME20', 'Welcome 20% off', 'percent', 2000, 'any', false)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.billing_operators (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_subscriptions (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL REFERENCES public.billing_plans(code),
  status TEXT NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'expired', 'complimentary')),
  billing_interval TEXT NOT NULL DEFAULT 'month' CHECK (billing_interval IN ('month', 'year')),
  provider TEXT NOT NULL DEFAULT 'none' CHECK (provider IN ('none', 'stripe', 'razorpay')),
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  offer_code TEXT,
  currency CHAR(3) NOT NULL DEFAULT 'GBP',
  unit_amount_minor INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_checkouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL REFERENCES public.billing_plans(code),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('month', 'year')),
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'razorpay')),
  currency CHAR(3) NOT NULL,
  unit_amount_minor INTEGER NOT NULL CHECK (unit_amount_minor >= 0),
  offer_code TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'complete', 'expired')),
  provider_session_id TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_checkouts_company_idx ON public.billing_checkouts (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  event_id TEXT,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_events_provider_event_uidx
  ON public.billing_events (provider, event_id)
  WHERE event_id IS NOT NULL;

ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_billing_operator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.billing_operators WHERE user_id = auth.uid())
    OR (
      NOT EXISTS (SELECT 1 FROM public.billing_operators)
      AND EXISTS (
        SELECT 1 FROM public.company_members
        WHERE user_id = auth.uid() AND role = 'owner' AND status = 'active'
      )
    );
$$;

REVOKE ALL ON FUNCTION public.is_billing_operator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_billing_operator() TO authenticated;

DROP POLICY IF EXISTS billing_settings_select ON public.billing_settings;
CREATE POLICY billing_settings_select ON public.billing_settings
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS billing_settings_write ON public.billing_settings;
CREATE POLICY billing_settings_write ON public.billing_settings
  FOR UPDATE TO authenticated USING (public.is_billing_operator()) WITH CHECK (public.is_billing_operator());

DROP POLICY IF EXISTS billing_plans_select ON public.billing_plans;
CREATE POLICY billing_plans_select ON public.billing_plans
  FOR SELECT TO authenticated USING (is_public OR public.is_billing_operator());
DROP POLICY IF EXISTS billing_plans_write ON public.billing_plans;
CREATE POLICY billing_plans_write ON public.billing_plans
  FOR ALL TO authenticated USING (public.is_billing_operator()) WITH CHECK (public.is_billing_operator());

DROP POLICY IF EXISTS billing_offers_select ON public.billing_offers;
CREATE POLICY billing_offers_select ON public.billing_offers
  FOR SELECT TO authenticated USING (public.is_billing_operator());
DROP POLICY IF EXISTS billing_offers_write ON public.billing_offers;
CREATE POLICY billing_offers_write ON public.billing_offers
  FOR ALL TO authenticated USING (public.is_billing_operator()) WITH CHECK (public.is_billing_operator());

DROP POLICY IF EXISTS billing_operators_select ON public.billing_operators;
CREATE POLICY billing_operators_select ON public.billing_operators
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_billing_operator());
DROP POLICY IF EXISTS billing_operators_insert ON public.billing_operators;
CREATE POLICY billing_operators_insert ON public.billing_operators
  FOR INSERT TO authenticated WITH CHECK (
    (
      NOT EXISTS (SELECT 1 FROM public.billing_operators)
      AND user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.company_members
        WHERE user_id = auth.uid() AND role = 'owner' AND status = 'active'
      )
    )
    OR EXISTS (SELECT 1 FROM public.billing_operators WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS company_subscriptions_select ON public.company_subscriptions;
CREATE POLICY company_subscriptions_select ON public.company_subscriptions
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS billing_checkouts_select ON public.billing_checkouts;
CREATE POLICY billing_checkouts_select ON public.billing_checkouts
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
DROP POLICY IF EXISTS billing_checkouts_insert ON public.billing_checkouts;
CREATE POLICY billing_checkouts_insert ON public.billing_checkouts
  FOR INSERT TO authenticated WITH CHECK (
    public.has_company_permission(company_id, 'billing.manage') AND created_by = auth.uid()
  );
DROP POLICY IF EXISTS billing_checkouts_update ON public.billing_checkouts;
CREATE POLICY billing_checkouts_update ON public.billing_checkouts
  FOR UPDATE TO authenticated
  USING (public.has_company_permission(company_id, 'billing.manage') AND status = 'open')
  WITH CHECK (public.has_company_permission(company_id, 'billing.manage'));

DROP POLICY IF EXISTS billing_events_select ON public.billing_events;
CREATE POLICY billing_events_select ON public.billing_events
  FOR SELECT TO authenticated USING (
    company_id IS NOT NULL AND public.has_company_permission(company_id, 'billing.manage')
  );

INSERT INTO public.role_permissions (role, permission)
SELECT 'admin'::public.company_role, 'billing.manage'
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions WHERE role = 'admin' AND permission = 'billing.manage'
);

CREATE OR REPLACE FUNCTION public.attach_company_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings public.billing_settings%ROWTYPE;
  _currency CHAR(3);
BEGIN
  SELECT * INTO _settings FROM public.billing_settings WHERE id = true;
  _currency := CASE
    WHEN NEW.base_currency IN ('GBP', 'USD', 'INR') THEN NEW.base_currency
    ELSE 'GBP'
  END;
  INSERT INTO public.company_subscriptions (
    company_id, plan_code, status, billing_interval, provider, currency,
    trial_started_at, trial_ends_at
  ) VALUES (
    NEW.id,
    CASE WHEN NEW.is_demo THEN 'practice' ELSE COALESCE(_settings.trial_plan_code, 'standard') END,
    CASE WHEN NEW.is_demo THEN 'complimentary' ELSE 'trialing' END,
    'month',
    'none',
    _currency,
    CASE WHEN NEW.is_demo THEN NULL ELSE now() END,
    CASE
      WHEN NEW.is_demo THEN NULL
      ELSE now() + make_interval(days => COALESCE(_settings.trial_days, 30))
    END
  )
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_attach_subscription ON public.companies;
CREATE TRIGGER companies_attach_subscription
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.attach_company_subscription();

INSERT INTO public.company_subscriptions (
  company_id, plan_code, status, billing_interval, provider, currency, trial_started_at, trial_ends_at
)
SELECT
  c.id,
  CASE WHEN c.is_demo THEN 'practice' ELSE 'standard' END,
  CASE WHEN c.is_demo THEN 'complimentary' ELSE 'trialing' END,
  'month',
  'none',
  CASE WHEN c.base_currency IN ('GBP', 'USD', 'INR') THEN c.base_currency ELSE 'GBP' END,
  CASE WHEN c.is_demo THEN NULL ELSE now() END,
  CASE WHEN c.is_demo THEN NULL ELSE now() + interval '30 days' END
FROM public.companies c
ON CONFLICT (company_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.subscription_allows_posting(_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN s.status = 'complimentary' THEN true
      WHEN s.status = 'trialing' AND s.trial_ends_at > now() THEN true
      WHEN s.status IN ('active', 'cancelled')
        AND (s.current_period_end IS NULL OR s.current_period_end > now()) THEN true
      WHEN s.status = 'past_due'
        AND (
          s.current_period_end IS NULL
          OR s.current_period_end + make_interval(days => COALESCE(st.past_due_grace_days, 7)) > now()
        ) THEN true
      ELSE false
    END
    FROM public.company_subscriptions s
    LEFT JOIN public.billing_settings st ON st.id = true
    WHERE s.company_id = _company_id
  ), true);
$$;

CREATE OR REPLACE FUNCTION public.enforce_subscription_posting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.subscription_allows_posting(NEW.company_id) THEN
    RAISE EXCEPTION 'This organisation''s trial or subscription has ended. Choose a plan in Settings → Subscription. Existing reports stay available.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journals_subscription_posting ON public.journals;
CREATE TRIGGER journals_subscription_posting
  BEFORE INSERT ON public.journals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_posting();

CREATE OR REPLACE FUNCTION public.enforce_document_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limit INTEGER;
  _used INTEGER;
  _multi BOOLEAN;
  _base CHAR(3);
  _label TEXT;
BEGIN
  IF NOT public.subscription_allows_posting(NEW.company_id) THEN
    RAISE EXCEPTION 'This organisation''s trial or subscription has ended. Choose a plan in Settings → Subscription. Existing reports stay available.';
  END IF;

  SELECT
    CASE WHEN TG_TABLE_NAME = 'sales_invoices' THEN p.invoices_per_month ELSE p.bills_per_month END,
    p.multi_currency
  INTO _limit, _multi
  FROM public.company_subscriptions s
  JOIN public.billing_plans p ON p.code = s.plan_code
  WHERE s.company_id = NEW.company_id AND s.status <> 'complimentary';

  SELECT base_currency INTO _base FROM public.companies WHERE id = NEW.company_id;
  IF COALESCE(_multi, true) = false AND NEW.currency_code IS DISTINCT FROM _base THEN
    RAISE EXCEPTION 'Multi-currency is included from Standard upwards. Change this document to % or upgrade in Settings → Subscription.', _base;
  END IF;

  IF _limit IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'sales_invoices' THEN
    SELECT count(*) INTO _used
    FROM public.sales_invoices
    WHERE company_id = NEW.company_id
      AND created_at >= date_trunc('month', now());
    _label := 'invoices';
  ELSE
    SELECT count(*) INTO _used
    FROM public.purchase_bills
    WHERE company_id = NEW.company_id
      AND created_at >= date_trunc('month', now());
    _label := 'bills';
  END IF;

  IF _used >= _limit THEN
    RAISE EXCEPTION 'This plan includes % % a month. Upgrade in Settings → Subscription.', _limit, _label;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_invoices_subscription_quota ON public.sales_invoices;
CREATE TRIGGER sales_invoices_subscription_quota
  BEFORE INSERT ON public.sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_document_quota();

DROP TRIGGER IF EXISTS purchase_bills_subscription_quota ON public.purchase_bills;
CREATE TRIGGER purchase_bills_subscription_quota
  BEFORE INSERT ON public.purchase_bills
  FOR EACH ROW EXECUTE FUNCTION public.enforce_document_quota();

CREATE OR REPLACE FUNCTION public.enforce_subscription_seats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limit INTEGER;
  _used INTEGER;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;
  SELECT p.users_included INTO _limit
  FROM public.company_subscriptions s
  JOIN public.billing_plans p ON p.code = s.plan_code
  WHERE s.company_id = NEW.company_id AND s.status <> 'complimentary';
  IF _limit IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO _used
  FROM public.company_members
  WHERE company_id = NEW.company_id AND status = 'active' AND id IS DISTINCT FROM NEW.id;
  IF _used >= _limit THEN
    RAISE EXCEPTION 'This plan includes % users. Upgrade in Settings → Subscription.', _limit;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_members_subscription_seats ON public.company_members;
CREATE TRIGGER company_members_subscription_seats
  BEFORE INSERT OR UPDATE ON public.company_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_seats();

CREATE OR REPLACE FUNCTION public.start_company_trial(_company_id UUID, _plan_code TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _days INTEGER;
  _ends TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'billing.manage') THEN
    RAISE EXCEPTION 'You do not have permission to manage billing for this organisation.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE code = _plan_code AND is_active) THEN
    RAISE EXCEPTION 'Choose an active plan.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.company_subscriptions
    WHERE company_id = _company_id AND trial_started_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This organisation has already used its free trial.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.company_subscriptions
    WHERE company_id = _company_id AND status = 'complimentary'
  ) THEN
    RAISE EXCEPTION 'Demo organisations are not billed.';
  END IF;
  SELECT trial_days INTO _days FROM public.billing_settings WHERE id = true;
  _ends := now() + make_interval(days => COALESCE(_days, 30));
  INSERT INTO public.company_subscriptions (
    company_id, plan_code, status, billing_interval, provider, trial_started_at, trial_ends_at, currency
  )
  SELECT _company_id, _plan_code, 'trialing', 'month', 'none', now(), _ends,
    CASE WHEN c.base_currency IN ('GBP', 'USD', 'INR') THEN c.base_currency ELSE 'GBP' END
  FROM public.companies c
  WHERE c.id = _company_id
  ON CONFLICT (company_id) DO UPDATE
    SET plan_code = EXCLUDED.plan_code,
        status = 'trialing',
        trial_started_at = EXCLUDED.trial_started_at,
        trial_ends_at = EXCLUDED.trial_ends_at,
        updated_at = now()
    WHERE public.company_subscriptions.trial_started_at IS NULL
      AND public.company_subscriptions.status <> 'complimentary';
  RETURN _ends;
END;
$$;

REVOKE ALL ON FUNCTION public.start_company_trial(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_company_trial(UUID, TEXT) TO authenticated;

-- Exact-code lookup so a customer can apply a promo without listing every code.
CREATE OR REPLACE FUNCTION public.lookup_billing_offer(_code TEXT)
RETURNS TABLE (
  code TEXT,
  kind TEXT,
  percent_bps INTEGER,
  amount_minor INTEGER,
  amount_currency CHAR(3),
  extra_trial_days INTEGER,
  extra_free_months INTEGER,
  intervals TEXT,
  plan_codes TEXT[],
  starts_on DATE,
  ends_on DATE,
  max_redemptions INTEGER,
  redemption_count INTEGER,
  is_active BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.code, o.kind, o.percent_bps, o.amount_minor, o.amount_currency,
    o.extra_trial_days, o.extra_free_months, o.intervals, o.plan_codes,
    o.starts_on, o.ends_on, o.max_redemptions, o.redemption_count, o.is_active
  FROM public.billing_offers o
  WHERE upper(o.code) = upper(trim(_code));
$$;

REVOKE ALL ON FUNCTION public.lookup_billing_offer(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_billing_offer(TEXT) TO authenticated;

GRANT SELECT ON public.billing_settings, public.billing_plans, public.billing_offers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.billing_checkouts TO authenticated;
GRANT SELECT ON public.company_subscriptions, public.billing_events, public.billing_operators TO authenticated;
GRANT INSERT ON public.billing_operators TO authenticated;
GRANT UPDATE ON public.billing_settings, public.billing_plans TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.billing_offers, public.billing_plans TO authenticated;
