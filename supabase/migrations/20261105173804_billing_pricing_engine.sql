-- Billing platform, phase 3: country pricing on the existing versioned price book.
-- Base prices are USD. India uses fixed INR prices that are never derived from USD. Other
-- countries can be FX-converted from the USD prices with a recorded rate, markup and rounding
-- mode. Customers only ever see prices on a published plan version, and a price-book version can
-- only be published by a platform owner other than the person who drafted it.
-- Additive and idempotent. Nothing is published by this migration.

-- ---------------------------------------------------------------------------
-- 1. Rule, input and exchange-rate tables (billing schema, no client access)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency char(3) NOT NULL DEFAULT 'USD' REFERENCES billing.currencies(code),
  quote_currency char(3) NOT NULL REFERENCES billing.currencies(code),
  rate numeric(24, 12) NOT NULL CHECK (rate > 0),
  source text NOT NULL CHECK (source IN ('MANUAL', 'PROVIDER')),
  provider text NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 60),
  fetched_at timestamptz NOT NULL,
  effective_at timestamptz NOT NULL,
  recorded_by uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (base_currency <> quote_currency)
);
CREATE INDEX IF NOT EXISTS exchange_rates_lookup_idx
  ON billing.exchange_rates (base_currency, quote_currency, effective_at DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS billing.country_pricing_rules (
  country_code char(2) PRIMARY KEY REFERENCES billing.countries(code),
  strategy text NOT NULL CHECK (strategy IN ('BASE', 'FIXED', 'FX_CONVERTED', 'CUSTOM')),
  currency char(3) NOT NULL REFERENCES billing.currencies(code),
  markup_bps integer NOT NULL DEFAULT 0 CHECK (markup_bps BETWEEN 0 AND 10000),
  rounding_mode text NOT NULL DEFAULT 'HALF_UP' CHECK (rounding_mode IN ('HALF_UP', 'HALF_EVEN', 'UP', 'DOWN')),
  max_rate_age_hours integer CHECK (max_rate_age_hours BETWEEN 1 AND 8760),
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT country_pricing_rules_currency_fits_strategy CHECK (
    (strategy = 'BASE' AND currency = 'USD')
    OR (strategy = 'FX_CONVERTED' AND currency <> 'USD')
    OR strategy IN ('FIXED', 'CUSTOM')
  )
);

-- Working prices that a draft is generated from. Base rows (no country) are USD; country rows hold
-- FIXED / CUSTOM local prices.
CREATE TABLE IF NOT EXISTS billing.price_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code text NOT NULL REFERENCES public.billing_plans(code),
  billing_interval text NOT NULL CHECK (billing_interval IN ('month', 'year')),
  country_code char(2) REFERENCES billing.countries(code),
  currency char(3) NOT NULL REFERENCES billing.currencies(code),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 2147483647),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_inputs_base_is_usd CHECK (country_code IS NOT NULL OR currency = 'USD')
);
CREATE UNIQUE INDEX IF NOT EXISTS price_inputs_base_key
  ON billing.price_inputs (plan_code, billing_interval) WHERE country_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS price_inputs_country_key
  ON billing.price_inputs (plan_code, billing_interval, country_code) WHERE country_code IS NOT NULL;

ALTER TABLE billing.exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.country_pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.price_inputs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing.exchange_rates, billing.country_pricing_rules, billing.price_inputs FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON billing.exchange_rates, billing.country_pricing_rules, billing.price_inputs FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION billing.immutable_exchange_rate() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Exchange rates are append-only; record a new rate instead' USING ERRCODE = '55000';
END $$;
DROP TRIGGER IF EXISTS exchange_rates_immutable ON billing.exchange_rates;
CREATE TRIGGER exchange_rates_immutable BEFORE UPDATE OR DELETE ON billing.exchange_rates
  FOR EACH ROW EXECUTE FUNCTION billing.immutable_exchange_rate();

-- Prices from the brief (USD minor units; India fixed INR). No yearly prices are configured, so
-- yearly billing stays unavailable for the new plans.
INSERT INTO billing.price_inputs (plan_code, billing_interval, country_code, currency, amount_minor)
VALUES
  ('standard', 'month', NULL, 'USD', 1000),
  ('pro', 'month', NULL, 'USD', 2000),
  ('business', 'month', NULL, 'USD', 5000),
  ('standard', 'month', 'IN', 'INR', 49900),
  ('pro', 'month', 'IN', 'INR', 99900),
  ('business', 'month', 'IN', 'INR', 199900)
ON CONFLICT DO NOTHING;
INSERT INTO billing.country_pricing_rules (country_code, strategy, currency)
VALUES ('IN', 'FIXED', 'INR')
ON CONFLICT (country_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Price-book versions and country price snapshots
-- ---------------------------------------------------------------------------
ALTER TABLE public.plan_versions ADD COLUMN IF NOT EXISTS price_book boolean NOT NULL DEFAULT false;
UPDATE public.plan_versions v SET price_book = true
 WHERE NOT v.price_book
   AND EXISTS (
     SELECT 1 FROM public.plan_versions c
       JOIN public.billing_plans bp ON bp.code = c.plan_code AND bp.pricing_source = 'price_book'
      WHERE c.plan_code = v.plan_code
        AND c.reason = 'Billing platform phase 2 catalogue'
        AND v.version_no >= c.version_no
   );

ALTER TABLE public.plan_prices
  ADD COLUMN IF NOT EXISTS country_code char(2),
  ADD COLUMN IF NOT EXISTS strategy text NOT NULL DEFAULT 'BASE',
  ADD COLUMN IF NOT EXISTS base_currency char(3),
  ADD COLUMN IF NOT EXISTS base_amount_minor bigint,
  ADD COLUMN IF NOT EXISTS fx_rate_id uuid,
  ADD COLUMN IF NOT EXISTS fx_rate numeric(24, 12),
  ADD COLUMN IF NOT EXISTS markup_bps integer,
  ADD COLUMN IF NOT EXISTS rounding_mode text;
DO $$ BEGIN
  ALTER TABLE public.plan_prices ADD CONSTRAINT plan_prices_country_fk
    FOREIGN KEY (country_code) REFERENCES billing.countries(code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.plan_prices ADD CONSTRAINT plan_prices_fx_rate_fk
    FOREIGN KEY (fx_rate_id) REFERENCES billing.exchange_rates(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.plan_prices ADD CONSTRAINT plan_prices_strategy_shape CHECK (
    (strategy = 'BASE' AND country_code IS NULL)
    OR (strategy IN ('FIXED', 'CUSTOM') AND country_code IS NOT NULL)
    OR (strategy = 'FX_CONVERTED' AND country_code IS NOT NULL AND fx_rate_id IS NOT NULL AND fx_rate > 0
        AND base_currency IS NOT NULL AND base_amount_minor IS NOT NULL AND markup_bps IS NOT NULL
        AND rounding_mode IS NOT NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Several countries may share a currency, so country rows are unique per country; rows without
-- a country keep the original one-price-per-currency rule.
ALTER TABLE public.plan_prices DROP CONSTRAINT IF EXISTS plan_prices_version_id_currency_billing_interval_key;
CREATE UNIQUE INDEX IF NOT EXISTS plan_prices_base_key
  ON public.plan_prices (version_id, currency, billing_interval) WHERE country_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS plan_prices_country_key
  ON public.plan_prices (version_id, country_code, billing_interval) WHERE country_code IS NOT NULL;

-- A published or archived version's prices are a snapshot customers may have bought.
CREATE OR REPLACE FUNCTION billing.guard_plan_price_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  version_status text;
BEGIN
  SELECT status INTO version_status FROM public.plan_versions WHERE id = OLD.version_id;
  IF version_status IN ('published', 'archived') THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Prices on a published version cannot be removed' USING ERRCODE = '55000';
    END IF;
    IF (NEW.version_id, NEW.currency, NEW.billing_interval, NEW.amount_minor, NEW.country_code, NEW.strategy,
        NEW.base_currency, NEW.base_amount_minor, NEW.fx_rate_id, NEW.fx_rate, NEW.markup_bps, NEW.rounding_mode)
       IS DISTINCT FROM
       (OLD.version_id, OLD.currency, OLD.billing_interval, OLD.amount_minor, OLD.country_code, OLD.strategy,
        OLD.base_currency, OLD.base_amount_minor, OLD.fx_rate_id, OLD.fx_rate, OLD.markup_bps, OLD.rounding_mode) THEN
      RAISE EXCEPTION 'Prices on a published version cannot change; draft a new version' USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS plan_prices_snapshot_guard ON public.plan_prices;
CREATE TRIGGER plan_prices_snapshot_guard BEFORE UPDATE OR DELETE ON public.plan_prices
  FOR EACH ROW EXECUTE FUNCTION billing.guard_plan_price_snapshot();

-- ---------------------------------------------------------------------------
-- 3. Exact conversion (numeric only; mirrors src/lib/billing/domain/country-pricing.ts)
-- ---------------------------------------------------------------------------
-- Rounds the exact ratio _n / _d to a whole number of minor units, by magnitude.
CREATE OR REPLACE FUNCTION billing.round_ratio(_n numeric, _d numeric, _mode text) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  negative boolean := (_n < 0) <> (_d < 0);
  n numeric := abs(_n);
  d numeric := abs(_d);
  q numeric;
  twice numeric;
BEGIN
  IF d = 0 THEN
    RAISE EXCEPTION 'Division by zero' USING ERRCODE = '22012';
  END IF;
  q := div(n, d);
  twice := 2 * (n - q * d);
  IF twice <> 0 THEN
    IF _mode = 'UP' THEN
      q := q + 1;
    ELSIF _mode = 'HALF_UP' THEN
      IF twice >= d THEN q := q + 1; END IF;
    ELSIF _mode = 'HALF_EVEN' THEN
      IF twice > d OR (twice = d AND mod(q, 2) = 1) THEN q := q + 1; END IF;
    ELSIF _mode <> 'DOWN' THEN
      RAISE EXCEPTION 'Unknown rounding mode %', _mode USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN (CASE WHEN negative THEN -q ELSE q END)::bigint;
END $$;

CREATE OR REPLACE FUNCTION billing.fx_convert(
  _amount bigint, _from char(3), _to char(3), _rate numeric, _markup_bps integer, _mode text
) RETURNS bigint
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  shift integer;
BEGIN
  IF _rate IS NULL OR _rate <= 0 THEN
    RAISE EXCEPTION 'Exchange rate must be positive' USING ERRCODE = '22023';
  END IF;
  SELECT t.minor_units - f.minor_units INTO shift
    FROM billing.currencies f, billing.currencies t WHERE f.code = _from AND t.code = _to;
  IF shift IS NULL THEN
    RAISE EXCEPTION 'Unknown currency' USING ERRCODE = '22023';
  END IF;
  RETURN billing.round_ratio(
    _amount::numeric * _rate * (10000 + _markup_bps) * (10::numeric ^ greatest(shift, 0)),
    10000 * (10::numeric ^ greatest(-shift, 0)),
    _mode);
END $$;

CREATE OR REPLACE FUNCTION billing.latest_rate(_quote char(3)) RETURNS billing.exchange_rates
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT r.* FROM billing.exchange_rates r
   WHERE r.base_currency = 'USD' AND r.quote_currency = _quote AND r.effective_at <= now()
   ORDER BY r.effective_at DESC, r.created_at DESC
   LIMIT 1;
$$;

-- Rows a customer in _country is offered from one version: the country's own rows when the
-- version has any, otherwise the USD base rows.
CREATE OR REPLACE FUNCTION billing.country_price_rows(_version_id uuid, _country text)
RETURNS SETOF public.plan_prices
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT p.* FROM public.plan_prices p
   WHERE p.version_id = _version_id
     AND CASE
           WHEN EXISTS (SELECT 1 FROM public.plan_prices c WHERE c.version_id = _version_id AND c.country_code = _country)
             THEN p.country_code = _country
           ELSE p.country_code IS NULL AND p.currency = 'USD'
         END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Platform administration (aal2 platform staff; every change is audited)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_set_country_pricing_rule(
  _country text, _strategy text, _currency text, _markup_bps integer, _rounding_mode text,
  _max_rate_age_hours integer, _active boolean, _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  before_row billing.country_pricing_rules%ROWTYPE;
  country char(2) := upper(btrim(coalesce(_country, '')));
  cur char(3) := upper(btrim(coalesce(_currency, '')));
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF NOT EXISTS (SELECT 1 FROM billing.countries c WHERE c.code = country) THEN
    RAISE EXCEPTION 'Unknown country' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM billing.currencies c WHERE c.code = cur AND c.is_active) THEN
    RAISE EXCEPTION 'Unknown or inactive currency' USING ERRCODE = '22023';
  END IF;
  IF _strategy NOT IN ('BASE', 'FIXED', 'FX_CONVERTED', 'CUSTOM') THEN
    RAISE EXCEPTION 'Strategy must be BASE, FIXED, FX_CONVERTED or CUSTOM' USING ERRCODE = '22023';
  END IF;
  IF (_strategy = 'BASE' AND cur <> 'USD') OR (_strategy = 'FX_CONVERTED' AND cur = 'USD') THEN
    RAISE EXCEPTION 'BASE prices are USD; FX_CONVERTED needs a non-USD currency' USING ERRCODE = '22023';
  END IF;
  IF _markup_bps IS NULL OR _markup_bps NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'Markup must be between 0 and 10000 basis points' USING ERRCODE = '22023';
  END IF;
  IF _rounding_mode NOT IN ('HALF_UP', 'HALF_EVEN', 'UP', 'DOWN') THEN
    RAISE EXCEPTION 'Unknown rounding mode' USING ERRCODE = '22023';
  END IF;
  IF _max_rate_age_hours IS NOT NULL AND _max_rate_age_hours NOT BETWEEN 1 AND 8760 THEN
    RAISE EXCEPTION 'Maximum rate age must be between 1 and 8760 hours' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO before_row FROM billing.country_pricing_rules WHERE country_code = country FOR UPDATE;
  INSERT INTO billing.country_pricing_rules AS r
    (country_code, strategy, currency, markup_bps, rounding_mode, max_rate_age_hours, is_active, updated_by, updated_at)
  VALUES (country, _strategy, cur, _markup_bps, _rounding_mode, _max_rate_age_hours, coalesce(_active, true), auth.uid(), now())
  ON CONFLICT (country_code) DO UPDATE SET
    strategy = EXCLUDED.strategy, currency = EXCLUDED.currency, markup_bps = EXCLUDED.markup_bps,
    rounding_mode = EXCLUDED.rounding_mode, max_rate_age_hours = EXCLUDED.max_rate_age_hours,
    is_active = EXCLUDED.is_active, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;
  PERFORM private.platform_log('pricing.country_rule_set', 'country_pricing_rule', country,
    CASE WHEN before_row.country_code IS NULL THEN NULL ELSE to_jsonb(before_row) - 'updated_by' - 'updated_at' END,
    jsonb_build_object('strategy', _strategy, 'currency', cur, 'markupBps', _markup_bps, 'roundingMode', _rounding_mode,
      'maxRateAgeHours', _max_rate_age_hours, 'active', coalesce(_active, true)),
    _reason);
  RETURN jsonb_build_object('country', country, 'strategy', _strategy, 'currency', cur);
END $$;

CREATE OR REPLACE FUNCTION public.platform_set_price_input(
  _plan_code text, _interval text, _country text, _currency text, _amount_minor bigint, _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  country char(2) := nullif(upper(btrim(coalesce(_country, ''))), '');
  cur char(3) := upper(btrim(coalesce(_currency, '')));
  before_amount bigint;
  before_currency char(3);
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans bp WHERE bp.code = _plan_code AND bp.pricing_source = 'price_book') THEN
    RAISE EXCEPTION 'Choose a price-book plan' USING ERRCODE = '22023';
  END IF;
  IF _interval NOT IN ('month', 'year') THEN
    RAISE EXCEPTION 'Interval must be month or year' USING ERRCODE = '22023';
  END IF;
  IF country IS NOT NULL AND NOT EXISTS (SELECT 1 FROM billing.countries c WHERE c.code = country) THEN
    RAISE EXCEPTION 'Unknown country' USING ERRCODE = '22023';
  END IF;
  IF country IS NULL AND cur <> 'USD' THEN
    RAISE EXCEPTION 'Base prices are in USD' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM billing.currencies c WHERE c.code = cur AND c.is_active) THEN
    RAISE EXCEPTION 'Unknown or inactive currency' USING ERRCODE = '22023';
  END IF;
  IF _amount_minor IS NOT NULL AND _amount_minor NOT BETWEEN 1 AND 2147483647 THEN
    RAISE EXCEPTION 'Enter a positive amount in minor units' USING ERRCODE = '22023';
  END IF;

  SELECT i.amount_minor, i.currency INTO before_amount, before_currency FROM billing.price_inputs i
   WHERE i.plan_code = _plan_code AND i.billing_interval = _interval AND i.country_code IS NOT DISTINCT FROM country
   FOR UPDATE;
  DELETE FROM billing.price_inputs i
   WHERE i.plan_code = _plan_code AND i.billing_interval = _interval AND i.country_code IS NOT DISTINCT FROM country;
  IF _amount_minor IS NOT NULL THEN
    INSERT INTO billing.price_inputs (plan_code, billing_interval, country_code, currency, amount_minor, updated_by)
    VALUES (_plan_code, _interval, country, cur, _amount_minor, auth.uid());
  END IF;
  PERFORM private.platform_log('pricing.input_set', 'price_input',
    _plan_code || ':' || _interval || ':' || coalesce(country, 'BASE'),
    CASE WHEN before_amount IS NULL THEN NULL ELSE jsonb_build_object('currency', before_currency, 'amountMinor', before_amount) END,
    CASE WHEN _amount_minor IS NULL THEN NULL ELSE jsonb_build_object('currency', cur, 'amountMinor', _amount_minor) END,
    _reason);
  RETURN jsonb_build_object('planCode', _plan_code, 'interval', _interval, 'country', country,
    'currency', cur, 'amountMinor', _amount_minor);
END $$;

CREATE OR REPLACE FUNCTION public.platform_record_exchange_rate(
  _quote_currency text, _rate text, _effective_at timestamptz, _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  cur char(3) := upper(btrim(coalesce(_quote_currency, '')));
  parsed numeric;
  rid uuid;
  effective timestamptz := coalesce(_effective_at, now());
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF cur = 'USD' OR NOT EXISTS (SELECT 1 FROM billing.currencies c WHERE c.code = cur AND c.is_active) THEN
    RAISE EXCEPTION 'Choose an active currency other than USD' USING ERRCODE = '22023';
  END IF;
  IF coalesce(_rate, '') !~ '^[0-9]{1,12}(\.[0-9]{1,12})?$' THEN
    RAISE EXCEPTION 'Enter the rate as a decimal with up to 12 decimal places' USING ERRCODE = '22023';
  END IF;
  parsed := _rate::numeric;
  IF parsed <= 0 THEN
    RAISE EXCEPTION 'Exchange rate must be positive' USING ERRCODE = '22023';
  END IF;
  INSERT INTO billing.exchange_rates (quote_currency, rate, source, provider, fetched_at, effective_at, recorded_by, reason)
  VALUES (cur, parsed, 'MANUAL', 'manual', now(), effective, auth.uid(), _reason)
  RETURNING id INTO rid;
  PERFORM private.platform_log('pricing.fx_rate_recorded', 'exchange_rate', rid::text, NULL,
    jsonb_build_object('base', 'USD', 'quote', cur, 'rate', parsed::text, 'effectiveAt', effective), _reason);
  RETURN jsonb_build_object('id', rid, 'quoteCurrency', cur, 'rate', parsed::text, 'effectiveAt', effective);
END $$;

-- Generates a draft price-book version from the inputs, rules and latest rates. The whole draft is
-- refused if any active country rule cannot be priced for the monthly interval.
CREATE OR REPLACE FUNCTION public.platform_draft_country_prices(_plan_code text, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  staff_role text := public.platform_role();
  published public.plan_versions%ROWTYPE;
  pricing_rule billing.country_pricing_rules%ROWTYPE;
  fx billing.exchange_rates%ROWTYPE;
  base_input billing.price_inputs%ROWTYPE;
  vid uuid;
  status_text text;
  problems text[] := '{}';
  converted bigint;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason' USING ERRCODE = '22023';
  END IF;
  PERFORM private.platform_rate_limit();
  PERFORM pg_advisory_xact_lock(47329212);
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans bp WHERE bp.code = _plan_code AND bp.is_active AND bp.pricing_source = 'price_book') THEN
    RAISE EXCEPTION 'Choose an active price-book plan' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO published FROM public.plan_versions
   WHERE plan_code = _plan_code AND status = 'published' ORDER BY version_no DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The plan has no published version to start from' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM billing.price_inputs i WHERE i.plan_code = _plan_code AND i.country_code IS NULL AND i.billing_interval = 'month') THEN
    RAISE EXCEPTION 'Set the monthly USD base price first' USING ERRCODE = '22023';
  END IF;

  status_text := CASE WHEN staff_role = 'platform_finance'
    AND coalesce((SELECT require_owner_approval FROM public.billing_settings WHERE id), true)
    THEN 'review' ELSE 'draft' END;
  INSERT INTO public.plan_versions (plan_code, version_no, status, name, audience, summary, badge, sort_order,
                                    visibility, created_by, reason, price_book)
  SELECT _plan_code, max(v.version_no) + 1, status_text, published.name, published.audience, published.summary,
         published.badge, published.sort_order, 'draft', auth.uid(), _reason, true
    FROM public.plan_versions v WHERE v.plan_code = _plan_code
  RETURNING id INTO vid;
  INSERT INTO public.plan_version_limits (version_id, feature_key, enabled, limit_value)
  SELECT vid, feature_key, enabled, limit_value FROM public.plan_version_limits WHERE version_id = published.id;

  INSERT INTO public.plan_prices (version_id, currency, billing_interval, amount_minor, needs_review, strategy)
  SELECT vid, 'USD', i.billing_interval, i.amount_minor, false, 'BASE'
    FROM billing.price_inputs i WHERE i.plan_code = _plan_code AND i.country_code IS NULL;

  FOR pricing_rule IN SELECT * FROM billing.country_pricing_rules r WHERE r.is_active AND r.strategy <> 'BASE' ORDER BY r.country_code LOOP
    IF pricing_rule.strategy IN ('FIXED', 'CUSTOM') THEN
      IF NOT EXISTS (SELECT 1 FROM billing.price_inputs i WHERE i.plan_code = _plan_code
                       AND i.country_code = pricing_rule.country_code AND i.billing_interval = 'month') THEN
        problems := problems || format('%s: no monthly %s price', pricing_rule.country_code, pricing_rule.currency);
        CONTINUE;
      END IF;
      IF EXISTS (SELECT 1 FROM billing.price_inputs i WHERE i.plan_code = _plan_code
                   AND i.country_code = pricing_rule.country_code AND i.currency <> pricing_rule.currency) THEN
        problems := problems || format('%s: prices must be in %s', pricing_rule.country_code, pricing_rule.currency);
        CONTINUE;
      END IF;
      INSERT INTO public.plan_prices (version_id, currency, billing_interval, amount_minor, needs_review, strategy, country_code)
      SELECT vid, i.currency, i.billing_interval, i.amount_minor, false, pricing_rule.strategy, pricing_rule.country_code
        FROM billing.price_inputs i WHERE i.plan_code = _plan_code AND i.country_code = pricing_rule.country_code;
    ELSE
      fx := billing.latest_rate(pricing_rule.currency);
      IF fx.id IS NULL THEN
        problems := problems || format('%s: no USD/%s exchange rate', pricing_rule.country_code, pricing_rule.currency);
        CONTINUE;
      END IF;
      IF pricing_rule.max_rate_age_hours IS NOT NULL AND fx.fetched_at < now() - make_interval(hours => pricing_rule.max_rate_age_hours) THEN
        problems := problems || format('%s: USD/%s rate is older than %s hours', pricing_rule.country_code, pricing_rule.currency, pricing_rule.max_rate_age_hours);
        CONTINUE;
      END IF;
      FOR base_input IN SELECT * FROM billing.price_inputs i WHERE i.plan_code = _plan_code AND i.country_code IS NULL LOOP
        converted := billing.fx_convert(base_input.amount_minor, 'USD', pricing_rule.currency, fx.rate, pricing_rule.markup_bps, pricing_rule.rounding_mode);
        IF converted < 1 OR converted > 2147483647 THEN
          problems := problems || format('%s: converted %s price is out of range', pricing_rule.country_code, base_input.billing_interval);
          CONTINUE;
        END IF;
        INSERT INTO public.plan_prices (version_id, currency, billing_interval, amount_minor, needs_review, strategy,
          country_code, base_currency, base_amount_minor, fx_rate_id, fx_rate, markup_bps, rounding_mode)
        VALUES (vid, pricing_rule.currency, base_input.billing_interval, converted, false, 'FX_CONVERTED',
          pricing_rule.country_code, 'USD', base_input.amount_minor, fx.id, fx.rate, pricing_rule.markup_bps, pricing_rule.rounding_mode);
      END LOOP;
    END IF;
  END LOOP;

  IF cardinality(problems) > 0 THEN
    RAISE EXCEPTION 'Country prices are incomplete: %', array_to_string(problems, '; ') USING ERRCODE = '22023';
  END IF;

  PERFORM private.platform_log('price.country_draft', 'plan_version', vid::text,
    jsonb_build_object('fromVersionId', published.id),
    jsonb_build_object('status', status_text,
      'prices', (SELECT count(*) FROM public.plan_prices WHERE version_id = vid),
      'countries', (SELECT count(DISTINCT country_code) FROM public.plan_prices WHERE version_id = vid AND country_code IS NOT NULL)),
    _reason);
  RETURN jsonb_build_object('versionId', vid, 'status', status_text, 'fromVersionId', published.id,
    'prices', (SELECT count(*) FROM public.plan_prices WHERE version_id = vid));
END $$;

CREATE OR REPLACE FUNCTION public.platform_country_pricing() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_platform('billing.view');
  RETURN jsonb_build_object(
    'baseCurrency', 'USD',
    'rules', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'country', r.country_code, 'strategy', r.strategy, 'currency', r.currency, 'markupBps', r.markup_bps,
        'roundingMode', r.rounding_mode, 'maxRateAgeHours', r.max_rate_age_hours, 'active', r.is_active,
        'updatedAt', r.updated_at) ORDER BY r.country_code)
      FROM billing.country_pricing_rules r), '[]'::jsonb),
    'inputs', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'planCode', i.plan_code, 'interval', i.billing_interval, 'country', i.country_code,
        'currency', i.currency, 'amountMinor', i.amount_minor, 'updatedAt', i.updated_at)
        ORDER BY i.plan_code, i.country_code NULLS FIRST, i.billing_interval)
      FROM billing.price_inputs i), '[]'::jsonb),
    'rates', coalesce((SELECT jsonb_agg(x ORDER BY x->>'quote') FROM (
        SELECT DISTINCT ON (r.quote_currency) jsonb_build_object(
          'id', r.id, 'quote', r.quote_currency, 'rate', r.rate::text, 'source', r.source,
          'effectiveAt', r.effective_at, 'fetchedAt', r.fetched_at) AS x
          FROM billing.exchange_rates r
         WHERE r.base_currency = 'USD' AND r.effective_at <= now()
         ORDER BY r.quote_currency, r.effective_at DESC, r.created_at DESC) latest), '[]'::jsonb),
    'currencies', coalesce((SELECT jsonb_agg(jsonb_build_object('code', c.code, 'name', c.name,
        'minorUnits', c.minor_units) ORDER BY c.code) FROM billing.currencies c WHERE c.is_active), '[]'::jsonb)
  );
END $$;

-- ---------------------------------------------------------------------------
-- 5. Publishing: price-book versions need a second owner; legacy flow unchanged
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.platform_price_action(_action text, _payload jsonb, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
DECLARE previous public.plan_versions%rowtype; target public.plan_versions%rowtype; vid uuid; staff_role text; amount integer; floor integer; cur text; cadence text; code text; result_status text; is_price_book boolean;
BEGIN
 staff_role:=public.platform_role();
 IF staff_role IS NULL OR staff_role NOT IN ('platform_owner','platform_finance') THEN RAISE EXCEPTION 'Billing staff and an active MFA session are required' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(_reason,'')))<3 THEN RAISE EXCEPTION 'Record a reason'; END IF;
 PERFORM private.platform_rate_limit();
 PERFORM pg_advisory_xact_lock(47329212);
 IF _action='draft' THEN
 code:=_payload->>'planCode';cur:=_payload->>'currency';cadence:=_payload->>'interval';amount:=(_payload->>'amountMinor')::integer;
 IF EXISTS (SELECT 1 FROM public.billing_plans bp WHERE bp.code=code AND bp.pricing_source='price_book') THEN RAISE EXCEPTION 'This plan is priced by country. Use country pricing to draft its prices.' USING ERRCODE='22023'; END IF;
 IF cur NOT IN ('USD','GBP','AUD','NZD','INR') OR cadence NOT IN ('month','year') OR code NOT IN (SELECT bp.code FROM public.billing_plans bp WHERE bp.is_active) OR amount IS NULL THEN RAISE EXCEPTION 'Choose a supported plan, currency and interval'; END IF;
 floor:=CASE cur WHEN 'USD' THEN 500 WHEN 'GBP' THEN 400 WHEN 'AUD' THEN 800 WHEN 'NZD' THEN 800 WHEN 'INR' THEN 9900 END * CASE cadence WHEN 'year' THEN 8 ELSE 1 END;
 IF amount<floor THEN RAISE EXCEPTION 'Price is below the configured floor'; END IF;
 SELECT * INTO previous FROM public.plan_versions WHERE plan_code=code ORDER BY version_no DESC LIMIT 1;
 result_status:=CASE WHEN staff_role='platform_finance' AND coalesce((SELECT require_owner_approval FROM public.billing_settings WHERE id),true) THEN 'review' ELSE 'draft' END;
 INSERT INTO public.plan_versions(plan_code,version_no,status,name,audience,summary,visibility,created_by,reason) VALUES(code,coalesce(previous.version_no,0)+1,result_status,coalesce(previous.name,code),coalesce(previous.audience,''),coalesce(previous.summary,''),'draft',auth.uid(),_reason) RETURNING id INTO vid;
 SELECT * INTO previous FROM public.plan_versions WHERE plan_code=code AND status='published' ORDER BY version_no DESC LIMIT 1;
 INSERT INTO public.plan_prices(version_id,currency,billing_interval,amount_minor,needs_review,country_code,strategy,base_currency,base_amount_minor,fx_rate_id,fx_rate,markup_bps,rounding_mode) SELECT vid,currency,billing_interval,amount_minor,needs_review,country_code,strategy,base_currency,base_amount_minor,fx_rate_id,fx_rate,markup_bps,rounding_mode FROM public.plan_prices WHERE version_id=previous.id;
 INSERT INTO public.plan_prices(version_id,currency,billing_interval,amount_minor,needs_review) VALUES(vid,cur,cadence,amount,cur<>'USD') ON CONFLICT(version_id,currency,billing_interval) WHERE country_code IS NULL DO UPDATE SET amount_minor=excluded.amount_minor,needs_review=excluded.needs_review;
 INSERT INTO public.plan_version_limits(version_id,feature_key,enabled,limit_value) SELECT vid,feature_key,enabled,limit_value FROM public.plan_version_limits WHERE version_id=previous.id;
 ELSE
 IF staff_role<>'platform_owner' THEN RAISE EXCEPTION 'Only Superadmin may publish or roll back prices' USING ERRCODE='42501'; END IF;
 code:=CASE WHEN _action='rollback' THEN _payload->>'planCode' ELSE (SELECT v.plan_code FROM public.plan_versions v WHERE v.id=(_payload->>'versionId')::uuid) END;
 is_price_book:=coalesce((SELECT bp.pricing_source='price_book' FROM public.billing_plans bp WHERE bp.code=code),false);
 IF _action='publish' THEN SELECT * INTO target FROM public.plan_versions WHERE id=(_payload->>'versionId')::uuid AND status IN ('draft','review') AND (NOT is_price_book OR price_book);
 ELSIF _action='rollback' THEN SELECT * INTO target FROM public.plan_versions WHERE plan_code=code AND status='archived' AND (NOT is_price_book OR price_book) ORDER BY version_no DESC LIMIT 1;
 ELSE RAISE EXCEPTION 'Unknown price action'; END IF;
 IF target.id IS NULL THEN RAISE EXCEPTION 'No eligible price version'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.plan_prices WHERE version_id=target.id) THEN RAISE EXCEPTION 'A price version must contain prices'; END IF;
 IF is_price_book THEN
   IF _action='publish' AND target.created_by IS NOT DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Another platform owner must publish prices you drafted' USING ERRCODE='42501'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.plan_prices p WHERE p.version_id=target.id AND p.country_code IS NULL AND p.currency='USD' AND p.billing_interval='month') THEN RAISE EXCEPTION 'A price-book version needs a monthly USD base price' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT * INTO previous FROM public.plan_versions WHERE plan_code=target.plan_code AND status='published' LIMIT 1;
 UPDATE public.plan_versions SET status='archived',visibility='hidden' WHERE plan_code=target.plan_code AND status='published';
 UPDATE public.plan_versions SET status='published',visibility='live',published_at=now(),effective_from=now(),reason=_reason WHERE id=target.id;
 vid:=target.id;result_status:='published';
 END IF;
 PERFORM private.platform_log('price.'||_action,'plan_version',vid::text,CASE WHEN previous.id IS NULL THEN NULL ELSE jsonb_build_object('id',previous.id,'status',previous.status) END,jsonb_build_object('id',vid,'status',result_status),_reason);
 RETURN jsonb_build_object('versionId',vid,'status',result_status,'marginWarning',null,'grandfathered',true,'ok',true);
END $function$;

-- Limit drafts keep every price column and the price-book flag of the version they copy.
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
  INSERT INTO public.plan_versions (plan_code, version_no, status, name, audience, summary, badge, sort_order,
                                    visibility, created_by, reason, price_book)
  SELECT _plan_code, max(v.version_no) + 1, status_text, published.name, published.audience, published.summary,
         published.badge, published.sort_order, 'draft', auth.uid(), _reason, published.price_book
    FROM public.plan_versions v WHERE v.plan_code = _plan_code
  RETURNING id INTO vid;
  INSERT INTO public.plan_prices (version_id, currency, billing_interval, amount_minor, needs_review, country_code,
    strategy, base_currency, base_amount_minor, fx_rate_id, fx_rate, markup_bps, rounding_mode)
  SELECT vid, currency, billing_interval, amount_minor, needs_review, country_code,
    strategy, base_currency, base_amount_minor, fx_rate_id, fx_rate, markup_bps, rounding_mode
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

-- ---------------------------------------------------------------------------
-- 6. Customer-facing price list (published versions only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_price_list(_country text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH c AS (
    SELECT (SELECT co.code FROM billing.countries co WHERE co.code = upper(btrim(coalesce(_country, '')))) AS code
  )
  SELECT jsonb_build_object(
    'country', (SELECT code FROM c),
    'baseCurrency', 'USD',
    'plans', coalesce(jsonb_agg(jsonb_build_object(
      'code', bp.code,
      'name', v.name,
      'versionId', v.id,
      'publishedAt', v.published_at,
      'prices', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'priceId', p.id, 'interval', p.billing_interval, 'currency', p.currency,
          'amountMinor', p.amount_minor, 'strategy', p.strategy, 'country', p.country_code)
          ORDER BY p.billing_interval)
          FROM billing.country_price_rows(v.id, (SELECT code FROM c)) p
         WHERE p.archived_at IS NULL), '[]'::jsonb)
    ) ORDER BY bp.plan_rank), '[]'::jsonb)
  )
  FROM public.billing_plans bp
  JOIN LATERAL (
    SELECT pv.* FROM public.plan_versions pv
     WHERE pv.plan_code = bp.code AND pv.status = 'published' AND pv.visibility = 'live' AND pv.price_book
     ORDER BY pv.version_no DESC LIMIT 1
  ) v ON true
  WHERE bp.is_active AND bp.is_public AND bp.pricing_source = 'price_book';
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'billing.immutable_exchange_rate()', 'billing.guard_plan_price_snapshot()',
    'billing.round_ratio(numeric, numeric, text)', 'billing.fx_convert(bigint, character, character, numeric, integer, text)',
    'billing.latest_rate(character)', 'billing.country_price_rows(uuid, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', f);
    EXCEPTION WHEN undefined_object THEN NULL; END;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.platform_set_country_pricing_rule(text, text, text, integer, text, integer, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_set_price_input(text, text, text, text, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_record_exchange_rate(text, text, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_draft_country_prices(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_country_pricing() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_country_pricing_rule(text, text, text, integer, text, integer, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_set_price_input(text, text, text, text, bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_record_exchange_rate(text, text, timestamptz, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_draft_country_prices(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_country_pricing() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.billing_price_list(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_price_list(text) TO anon, authenticated, service_role;
