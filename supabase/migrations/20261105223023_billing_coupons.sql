-- Billing platform, phase 7: coupons on the existing billing_offers table.
-- Adds country, per-account, minimum-purchase and duration rules; reservations at checkout and
-- redemption on verified payment; provider coupon mappings (Stripe coupons created once per
-- code and currency; Razorpay offers are created in the Razorpay Dashboard and linked here);
-- discounts snapshotted on payments and invoices. One code per checkout (no stacking). No coupon
-- or discount value is seeded. Additive and idempotent.

-- ---------------------------------------------------------------------------
-- 1. Coupon rules
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_offers
  ADD COLUMN IF NOT EXISTS countries char(2)[],
  ADD COLUMN IF NOT EXISTS duration_type text,
  ADD COLUMN IF NOT EXISTS per_account_limit integer,
  ADD COLUMN IF NOT EXISTS min_purchase_minor bigint,
  ADD COLUMN IF NOT EXISTS min_purchase_currency char(3),
  ADD COLUMN IF NOT EXISTS stackable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by uuid;
UPDATE public.billing_offers
   SET duration_type = CASE WHEN duration_months IS NULL THEN 'once' ELSE 'repeating' END
 WHERE duration_type IS NULL;
ALTER TABLE public.billing_offers ALTER COLUMN duration_type SET DEFAULT 'once';
ALTER TABLE public.billing_offers ALTER COLUMN duration_type SET NOT NULL;
UPDATE public.billing_offers SET per_account_limit = 1 WHERE per_account_limit IS NULL;
ALTER TABLE public.billing_offers ALTER COLUMN per_account_limit SET DEFAULT 1;
DO $$ BEGIN
  ALTER TABLE public.billing_offers ADD CONSTRAINT billing_offers_duration_shape CHECK (
    duration_type IN ('once', 'repeating', 'forever')
    AND (duration_type <> 'repeating' OR duration_months IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.billing_offers ADD CONSTRAINT billing_offers_limits_shape CHECK (
    (per_account_limit IS NULL OR per_account_limit >= 1)
    AND ((min_purchase_minor IS NULL) = (min_purchase_currency IS NULL))
    AND (min_purchase_minor IS NULL OR min_purchase_minor >= 1));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- One code per checkout: stacking is not offered.
DO $$ BEGIN
  ALTER TABLE public.billing_offers ADD CONSTRAINT billing_offers_no_stacking CHECK (NOT stackable);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS billing.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_code text NOT NULL REFERENCES public.billing_offers(code),
  billing_account_id uuid,
  company_id uuid NOT NULL,
  checkout_id uuid NOT NULL UNIQUE REFERENCES public.billing_checkouts(id),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'redeemed', 'released')),
  discount jsonb NOT NULL,
  reserved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  released_at timestamptz
);
CREATE INDEX IF NOT EXISTS coupon_redemptions_account_idx
  ON billing.coupon_redemptions (offer_code, billing_account_id) WHERE status IN ('reserved', 'redeemed');

CREATE TABLE IF NOT EXISTS billing.provider_coupon_mappings (
  offer_code text NOT NULL REFERENCES public.billing_offers(code),
  provider text NOT NULL CHECK (provider IN ('stripe', 'razorpay')),
  mode text NOT NULL CHECK (mode IN ('test', 'live')),
  currency text NOT NULL DEFAULT '*' CHECK (currency = '*' OR currency ~ '^[A-Z]{3}$'),
  provider_coupon_id text NOT NULL CHECK (char_length(provider_coupon_id) BETWEEN 3 AND 120),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (offer_code, provider, mode, currency)
);

ALTER TABLE billing.coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.provider_coupon_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing.coupon_redemptions, billing.provider_coupon_mappings FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON billing.coupon_redemptions, billing.provider_coupon_mappings FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2. Evaluation (server-side; discounts never go below zero)
-- ---------------------------------------------------------------------------
-- Reservations count for 24 hours, so an abandoned checkout releases its slot.
CREATE OR REPLACE FUNCTION billing.coupon_evaluation(
  _code text, _company_id uuid, _plan_code text, _interval text, _currency text, _amount_minor bigint
) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  offer public.billing_offers%ROWTYPE;
  country char(2);
  account uuid;
  used integer;
  discount bigint;
  label text := upper(btrim(coalesce(_code, '')));
BEGIN
  SELECT * INTO offer FROM public.billing_offers o WHERE upper(o.code) = label;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', format('Promo code %s was not found.', label));
  END IF;
  IF NOT offer.is_active OR (offer.starts_on IS NOT NULL AND offer.starts_on > current_date)
     OR (offer.ends_on IS NOT NULL AND offer.ends_on < current_date) THEN
    RETURN jsonb_build_object('valid', false, 'reason', format('Promo code %s is not active.', offer.code));
  END IF;
  IF offer.kind NOT IN ('percent', 'amount') THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This code only applies to earlier plans.');
  END IF;
  IF offer.intervals <> 'any' AND offer.intervals <> _interval THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This code does not apply to this billing period.');
  END IF;
  IF offer.plan_codes IS NOT NULL AND NOT (_plan_code = ANY (offer.plan_codes)) THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This code does not apply to this plan.');
  END IF;
  SELECT upper(c.country_code) INTO country FROM public.companies c WHERE c.id = _company_id;
  IF offer.countries IS NOT NULL AND NOT (country = ANY (offer.countries)) THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This code is not available in your country.');
  END IF;
  IF offer.kind = 'amount' AND offer.amount_currency IS DISTINCT FROM _currency THEN
    RETURN jsonb_build_object('valid', false, 'reason', format('This code is not valid for %s prices.', _currency));
  END IF;
  IF offer.min_purchase_minor IS NOT NULL AND (offer.min_purchase_currency <> _currency OR _amount_minor < offer.min_purchase_minor) THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This plan does not meet the code''s minimum purchase.');
  END IF;
  IF offer.max_redemptions IS NOT NULL AND offer.redemption_count + (SELECT count(*) FROM billing.coupon_redemptions r
       WHERE r.offer_code = offer.code AND r.status = 'reserved' AND r.created_at > now() - interval '24 hours') >= offer.max_redemptions THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This code has been fully redeemed.');
  END IF;
  account := (SELECT l.billing_account_id FROM billing.billing_account_companies l WHERE l.company_id = _company_id);
  used := (SELECT count(*) FROM billing.coupon_redemptions r
            WHERE r.offer_code = offer.code AND r.billing_account_id IS NOT DISTINCT FROM account
              AND (r.status = 'redeemed' OR (r.status = 'reserved' AND r.created_at > now() - interval '24 hours')));
  IF offer.per_account_limit IS NOT NULL AND used >= offer.per_account_limit THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'You have already used this code.');
  END IF;
  discount := CASE WHEN offer.kind = 'percent'
                   THEN billing.round_ratio(_amount_minor::numeric * offer.percent_bps, 10000, 'DOWN')
                   ELSE least(offer.amount_minor::bigint, _amount_minor) END;
  RETURN jsonb_build_object('valid', true, 'code', offer.code, 'name', offer.name, 'kind', offer.kind,
    'percentBps', offer.percent_bps, 'amountMinor', offer.amount_minor, 'currency', _currency,
    'discountMinor', greatest(discount, 0), 'durationType', offer.duration_type, 'durationMonths', offer.duration_months,
    'billingAccountId', account);
END $$;

CREATE OR REPLACE FUNCTION public.billing_quote_coupon(_company_id uuid, _plan_code text, _interval text, _code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  price jsonb;
  coupon jsonb;
  net bigint;
  tax jsonb;
  tax_amount bigint := 0;
BEGIN
  price := public.billing_checkout_price(_company_id, _plan_code, _interval);
  coupon := billing.coupon_evaluation(_code, _company_id, _plan_code, _interval, price ->> 'currency',
    (price ->> 'amountMinor')::bigint);
  IF NOT (coupon ->> 'valid')::boolean THEN
    RAISE EXCEPTION '%', coupon ->> 'reason' USING ERRCODE = 'P0001';
  END IF;
  net := (price ->> 'amountMinor')::bigint - (coupon ->> 'discountMinor')::bigint;
  tax := price -> 'tax';
  IF tax IS NOT NULL AND jsonb_typeof(tax) = 'object' AND tax ->> 'treatment' = 'standard'
     AND (tax ->> 'rateBps')::integer > 0 THEN
    tax_amount := CASE WHEN tax ->> 'mode' = 'exclusive' THEN billing.exclusive_tax(net, (tax ->> 'rateBps')::integer)
                       ELSE billing.inclusive_tax(net, (tax ->> 'rateBps')::integer) END;
    tax := tax || jsonb_build_object('taxMinor', tax_amount);
  END IF;
  RETURN price || jsonb_build_object('coupon', coupon, 'tax', tax,
    'totalMinor', net + CASE WHEN tax ->> 'mode' = 'exclusive' THEN tax_amount ELSE 0 END);
END $$;

-- The checkout creator attaches a code to their own open checkout; the slot is reserved.
CREATE OR REPLACE FUNCTION public.billing_attach_coupon(_checkout_id uuid, _code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  chk public.billing_checkouts%ROWTYPE;
  coupon jsonb;
BEGIN
  SELECT * INTO chk FROM public.billing_checkouts WHERE id = _checkout_id FOR UPDATE;
  IF NOT FOUND OR chk.status <> 'open' OR chk.created_by IS DISTINCT FROM auth.uid()
     OR NOT public.has_company_permission(chk.company_id, 'billing.manage') THEN
    RAISE EXCEPTION 'Choose your own open checkout' USING ERRCODE = '42501';
  END IF;
  IF chk.plan_price_id IS NULL THEN
    RAISE EXCEPTION 'Codes for earlier plans are applied by the previous checkout' USING ERRCODE = 'P0001';
  END IF;
  -- Serialise redemptions of the same code so limits cannot be exceeded concurrently.
  PERFORM 1 FROM public.billing_offers o WHERE upper(o.code) = upper(btrim(_code)) FOR UPDATE;
  coupon := billing.coupon_evaluation(_code, chk.company_id, chk.plan_code, chk.billing_interval, chk.currency,
    chk.unit_amount_minor);
  IF NOT (coupon ->> 'valid')::boolean THEN
    RAISE EXCEPTION '%', coupon ->> 'reason' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO billing.coupon_redemptions (offer_code, billing_account_id, company_id, checkout_id, discount, reserved_by)
  VALUES (coupon ->> 'code', nullif(coupon ->> 'billingAccountId', '')::uuid, chk.company_id, chk.id, coupon, auth.uid());
  UPDATE public.billing_checkouts SET offer_code = coupon ->> 'code' WHERE id = chk.id;
  RETURN coupon;
END $$;

-- Service role only: a verified checkout redeems its reserved code (legacy checkouts just count).
CREATE OR REPLACE FUNCTION public.billing_redeem_coupon(_checkout_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  red billing.coupon_redemptions%ROWTYPE;
  legacy_code text;
BEGIN
  SELECT * INTO red FROM billing.coupon_redemptions WHERE checkout_id = _checkout_id FOR UPDATE;
  IF FOUND THEN
    IF red.status = 'redeemed' THEN
      RETURN jsonb_build_object('result', 'exists');
    END IF;
    UPDATE billing.coupon_redemptions SET status = 'redeemed', redeemed_at = now() WHERE id = red.id;
    UPDATE public.billing_offers SET redemption_count = redemption_count + 1 WHERE code = red.offer_code;
    PERFORM billing.write_audit('coupon.redeemed', 'coupon', red.offer_code, red.billing_account_id, NULL,
      red.discount || jsonb_build_object('checkoutId', _checkout_id), 'Verified checkout');
    RETURN jsonb_build_object('result', 'redeemed', 'code', red.offer_code);
  END IF;
  SELECT c.offer_code INTO legacy_code FROM public.billing_checkouts c WHERE c.id = _checkout_id;
  IF legacy_code IS NULL THEN
    RETURN jsonb_build_object('result', 'none');
  END IF;
  UPDATE public.billing_offers SET redemption_count = redemption_count + 1
   WHERE upper(billing_offers.code) = upper(legacy_code) AND (max_redemptions IS NULL OR redemption_count < max_redemptions);
  RETURN jsonb_build_object('result', 'counted', 'code', legacy_code);
END $$;

-- ---------------------------------------------------------------------------
-- 3. Provider coupon mappings
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_provider_coupon(_code text, _provider text, _mode text, _currency text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.provider_coupon_id FROM billing.provider_coupon_mappings m
   WHERE m.offer_code = _code AND m.provider = _provider AND m.mode = _mode AND m.currency IN (_currency, '*')
   ORDER BY (m.currency = _currency) DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.billing_record_provider_coupon(
  _code text, _provider text, _mode text, _currency text, _coupon_id text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO billing.provider_coupon_mappings (offer_code, provider, mode, currency, provider_coupon_id)
  VALUES (_code, _provider, _mode, coalesce(_currency, '*'), _coupon_id)
  ON CONFLICT (offer_code, provider, mode, currency) DO NOTHING;
  RETURN public.billing_provider_coupon(_code, _provider, _mode, coalesce(_currency, '*'));
END $$;

-- Razorpay offers are created in the Razorpay Dashboard; platform staff link the offer id here.
CREATE OR REPLACE FUNCTION public.platform_link_provider_coupon(
  _code text, _provider text, _mode text, _coupon_id text, _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF _provider NOT IN ('stripe', 'razorpay') OR _mode NOT IN ('test', 'live')
     OR coalesce(_coupon_id, '') !~ '^[A-Za-z0-9_-]{3,120}$' THEN
    RAISE EXCEPTION 'Choose a provider, a mode and the provider''s offer id' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.billing_offers o WHERE o.code = _code) THEN
    RAISE EXCEPTION 'Unknown code' USING ERRCODE = '22023';
  END IF;
  INSERT INTO billing.provider_coupon_mappings (offer_code, provider, mode, currency, provider_coupon_id, created_by)
  VALUES (_code, _provider, _mode, '*', _coupon_id, auth.uid())
  ON CONFLICT (offer_code, provider, mode, currency) DO UPDATE SET provider_coupon_id = EXCLUDED.provider_coupon_id,
    created_by = EXCLUDED.created_by, created_at = now();
  PERFORM private.platform_log('coupon.provider_linked', 'coupon', _code, NULL,
    jsonb_build_object('provider', _provider, 'mode', _mode, 'couponId', _coupon_id), _reason);
  RETURN jsonb_build_object('code', _code, 'provider', _provider, 'mode', _mode);
END $$;

-- ---------------------------------------------------------------------------
-- 4. Platform administration
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_coupons() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_platform('billing.view');
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(o) || jsonb_build_object(
      'reserved', (SELECT count(*) FROM billing.coupon_redemptions r WHERE r.offer_code = o.code AND r.status = 'reserved'
                    AND r.created_at > now() - interval '24 hours'),
      'mappings', coalesce((SELECT jsonb_agg(jsonb_build_object('provider', m.provider, 'mode', m.mode,
                    'currency', m.currency, 'couponId', m.provider_coupon_id)) FROM billing.provider_coupon_mappings m
                    WHERE m.offer_code = o.code), '[]'::jsonb),
      'termsLocked', o.redemption_count > 0 OR EXISTS (SELECT 1 FROM billing.coupon_redemptions r WHERE r.offer_code = o.code)
                    OR EXISTS (SELECT 1 FROM billing.provider_coupon_mappings m WHERE m.offer_code = o.code))
    ORDER BY o.updated_at DESC) FROM public.billing_offers o), '[]'::jsonb);
END $$;

-- Creates or updates a coupon. Discount terms (kind, value, currency, duration) are fixed once the
-- code has been used or mapped at a provider, so customers and providers never disagree.
CREATE OR REPLACE FUNCTION public.platform_save_coupon(_data jsonb, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  code_value text := upper(btrim(coalesce(_data ->> 'code', '')));
  existing public.billing_offers%ROWTYPE;
  locked boolean := false;
  plans text[];
  country_list char(2)[];
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF code_value !~ '^[A-Z0-9_-]{3,40}$' THEN
    RAISE EXCEPTION 'Codes use 3-40 capital letters, digits, dashes or underscores' USING ERRCODE = '22023';
  END IF;
  IF (_data ->> 'kind') NOT IN ('percent', 'amount') THEN
    RAISE EXCEPTION 'Choose a percentage or a fixed amount' USING ERRCODE = '22023';
  END IF;
  IF _data ->> 'kind' = 'percent' AND coalesce((_data ->> 'percentBps')::integer, 0) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'A percentage discount is between 0.01%% and the 50%% cap' USING ERRCODE = '22023';
  END IF;
  IF _data ->> 'kind' = 'amount' AND (coalesce((_data ->> 'amountMinor')::bigint, 0) < 1
       OR coalesce(_data ->> 'amountCurrency', '') !~ '^[A-Z]{3}$') THEN
    RAISE EXCEPTION 'A fixed discount needs an amount and a currency' USING ERRCODE = '22023';
  END IF;
  plans := ARRAY(SELECT jsonb_array_elements_text(coalesce(_data -> 'planCodes', '[]'::jsonb)));
  IF EXISTS (SELECT 1 FROM unnest(plans) p WHERE NOT EXISTS (SELECT 1 FROM public.billing_plans bp WHERE bp.code = p)) THEN
    RAISE EXCEPTION 'Unknown plan in the code''s plans' USING ERRCODE = '22023';
  END IF;
  country_list := ARRAY(SELECT upper(x) FROM jsonb_array_elements_text(coalesce(_data -> 'countries', '[]'::jsonb)) x);
  IF EXISTS (SELECT 1 FROM unnest(country_list) c WHERE NOT EXISTS (SELECT 1 FROM billing.countries k WHERE k.code = c)) THEN
    RAISE EXCEPTION 'Unknown country in the code''s countries' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO existing FROM public.billing_offers o WHERE o.code = code_value FOR UPDATE;
  IF FOUND THEN
    locked := existing.redemption_count > 0
      OR EXISTS (SELECT 1 FROM billing.coupon_redemptions r WHERE r.offer_code = code_value)
      OR EXISTS (SELECT 1 FROM billing.provider_coupon_mappings m WHERE m.offer_code = code_value);
    IF locked AND (existing.kind, existing.percent_bps, existing.amount_minor, existing.amount_currency,
                   existing.duration_type, existing.duration_months)
       IS DISTINCT FROM (_data ->> 'kind', coalesce((_data ->> 'percentBps')::integer, 0),
                         coalesce((_data ->> 'amountMinor')::integer, 0), nullif(_data ->> 'amountCurrency', '')::char(3),
                         coalesce(_data ->> 'durationType', 'once'), nullif(_data ->> 'durationMonths', '')::integer) THEN
      RAISE EXCEPTION 'This code has been used, so its discount cannot change. Create a new code.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  INSERT INTO public.billing_offers AS o (code, name, kind, percent_bps, amount_minor, amount_currency, extra_trial_days,
    extra_free_months, intervals, plan_codes, starts_on, ends_on, max_redemptions, is_active, duration_months,
    duration_type, countries, per_account_limit, min_purchase_minor, min_purchase_currency, created_by, updated_at)
  VALUES (code_value, coalesce(nullif(btrim(_data ->> 'name'), ''), code_value), _data ->> 'kind',
    CASE WHEN _data ->> 'kind' = 'percent' THEN (_data ->> 'percentBps')::integer ELSE 0 END,
    CASE WHEN _data ->> 'kind' = 'amount' THEN (_data ->> 'amountMinor')::integer ELSE 0 END,
    CASE WHEN _data ->> 'kind' = 'amount' THEN (_data ->> 'amountCurrency')::char(3) END,
    0, 0, coalesce(_data ->> 'intervals', 'any'), CASE WHEN cardinality(plans) = 0 THEN NULL ELSE plans END,
    nullif(_data ->> 'startsOn', '')::date, nullif(_data ->> 'endsOn', '')::date,
    nullif(_data ->> 'maxRedemptions', '')::integer, coalesce((_data ->> 'active')::boolean, false),
    nullif(_data ->> 'durationMonths', '')::integer, coalesce(_data ->> 'durationType', 'once'),
    CASE WHEN cardinality(country_list) = 0 THEN NULL ELSE country_list END,
    nullif(_data ->> 'perAccountLimit', '')::integer,
    nullif(_data ->> 'minPurchaseMinor', '')::bigint, nullif(_data ->> 'minPurchaseCurrency', '')::char(3),
    auth.uid(), now())
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, percent_bps = EXCLUDED.percent_bps,
    amount_minor = EXCLUDED.amount_minor, amount_currency = EXCLUDED.amount_currency, intervals = EXCLUDED.intervals,
    plan_codes = EXCLUDED.plan_codes, starts_on = EXCLUDED.starts_on, ends_on = EXCLUDED.ends_on,
    max_redemptions = EXCLUDED.max_redemptions, is_active = EXCLUDED.is_active, duration_months = EXCLUDED.duration_months,
    duration_type = EXCLUDED.duration_type, countries = EXCLUDED.countries, per_account_limit = EXCLUDED.per_account_limit,
    min_purchase_minor = EXCLUDED.min_purchase_minor, min_purchase_currency = EXCLUDED.min_purchase_currency,
    updated_at = now();
  PERFORM private.platform_log('coupon.saved', 'coupon', code_value,
    CASE WHEN existing.code IS NULL THEN NULL ELSE to_jsonb(existing) END, _data, _reason);
  RETURN jsonb_build_object('code', code_value);
EXCEPTION
  WHEN check_violation OR invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Check the dates, limits and duration (repeating codes need 1-36 months)' USING ERRCODE = '22023';
END $$;

-- ---------------------------------------------------------------------------
-- 5. Discounts on payments and invoices
-- ---------------------------------------------------------------------------
ALTER TABLE billing.payments
  ADD COLUMN IF NOT EXISTS discount_minor bigint CHECK (discount_minor IS NULL OR discount_minor >= 0),
  ADD COLUMN IF NOT EXISTS offer_code text;
ALTER TABLE billing.invoices
  ADD COLUMN IF NOT EXISTS discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  ADD COLUMN IF NOT EXISTS offer_code text;

-- Invoices and payments carry the coupon discount the provider applied.
CREATE OR REPLACE FUNCTION public.billing_record_provider_payment(_provider text, _mode text, _payment jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  sub public.company_subscriptions%ROWTYPE;
  payment_id uuid;
BEGIN
  SELECT * INTO sub FROM public.company_subscriptions
   WHERE provider = _provider AND provider_subscription_id = nullif(_payment ->> 'subscriptionId', '');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'skipped', 'reason', 'unknown subscription');
  END IF;
  INSERT INTO billing.payments (company_id, billing_account_id, provider, mode, provider_payment_id, provider_invoice_id,
    provider_subscription_id, currency, amount_minor, provider_tax_minor, method, period_start, period_end, plan_code,
    plan_price_id, paid_at, discount_minor, offer_code)
  VALUES (sub.company_id,
    (SELECT l.billing_account_id FROM billing.billing_account_companies l WHERE l.company_id = sub.company_id),
    _provider, _mode, _payment ->> 'paymentId', nullif(_payment ->> 'invoiceRef', ''), sub.provider_subscription_id,
    upper(_payment ->> 'currency'), (_payment ->> 'amountMinor')::bigint,
    nullif(_payment ->> 'taxMinor', '')::bigint, nullif(_payment ->> 'method', ''),
    nullif(_payment ->> 'periodStart', '')::timestamptz, nullif(_payment ->> 'periodEnd', '')::timestamptz,
    sub.plan_code, sub.plan_price_id, coalesce(nullif(_payment ->> 'paidAt', '')::timestamptz, now()),
    nullif(_payment ->> 'discountMinor', '')::bigint, sub.offer_code)
  ON CONFLICT (provider, mode, provider_payment_id) DO NOTHING
  RETURNING id INTO payment_id;
  IF payment_id IS NULL THEN
    SELECT p.id INTO payment_id FROM billing.payments p
     WHERE p.provider = _provider AND p.mode = _mode AND p.provider_payment_id = _payment ->> 'paymentId';
  END IF;
  RETURN jsonb_build_object('paymentId', payment_id) || billing.issue_invoice(payment_id);
END $$;

CREATE OR REPLACE FUNCTION billing.issue_invoice(_payment_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  pay billing.payments%ROWTYPE;
  cust jsonb;
  cust_country text;
  is_b2b boolean;
  seller billing.seller_entities%ROWTYPE;
  series_id uuid;
  rule billing.tax_rules%ROWTYPE;
  tax_amount bigint;
  doc_number text;
  invoice_id uuid;
  problem text;
  plan_name text;
BEGIN
  SELECT * INTO pay FROM billing.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown payment' USING ERRCODE = '22023';
  END IF;
  SELECT i.id INTO invoice_id FROM billing.invoices i WHERE i.payment_id = pay.id;
  IF invoice_id IS NOT NULL THEN
    RETURN jsonb_build_object('result', 'exists', 'invoiceId', invoice_id);
  END IF;
  cust := billing.customer_snapshot(pay.company_id);
  cust_country := cust ->> 'country';
  is_b2b := cust ->> 'taxId' IS NOT NULL;
  seller := billing.seller_for_country(cust_country);
  IF seller.id IS NULL THEN
    problem := format('No active seller entity for %s', cust_country);
  ELSE
    series_id := billing.active_series(seller.id, 'invoice');
    IF series_id IS NULL THEN
      problem := 'The seller has no active invoice numbering series';
    END IF;
  END IF;
  IF problem IS NULL THEN
    rule := billing.resolve_tax_rule(cust_country, cust ->> 'region', is_b2b, pay.paid_at::date);
    IF rule.id IS NULL THEN
      problem := format('No approved tax rule for %s on %s', cust_country, pay.paid_at::date);
    ELSIF rule.treatment <> 'standard' OR rule.rate_bps = 0 THEN
      IF coalesce(pay.provider_tax_minor, 0) > 0 THEN
        problem := 'The provider charged tax but the approved rule charges none';
      END IF;
      tax_amount := 0;
    ELSIF rule.price_mode = 'inclusive' THEN
      tax_amount := billing.inclusive_tax(pay.amount_minor, rule.rate_bps);
    ELSIF pay.provider_tax_minor IS NULL THEN
      problem := 'The approved rule adds tax but the provider did not charge it';
    ELSE
      tax_amount := pay.provider_tax_minor;
    END IF;
  END IF;
  IF problem IS NOT NULL THEN
    UPDATE billing.payments SET invoice_issue_error = problem WHERE id = pay.id;
    RETURN jsonb_build_object('result', 'pending', 'reason', problem);
  END IF;

  doc_number := billing.allocate_document_number(series_id);
  plan_name := (SELECT bp.name FROM public.billing_plans bp WHERE bp.code = pay.plan_code);
  INSERT INTO billing.invoices (invoice_number, series_id, seller_entity_id, seller, company_id, billing_account_id,
    customer, customer_type, currency, subtotal_minor, tax_minor, total_minor, tax_rule_id, tax, payment_id,
    plan_code, plan_price_id, period_start, period_end, issued_at, discount_minor, offer_code)
  VALUES (doc_number, series_id, seller.id, billing.seller_snapshot(seller), pay.company_id, pay.billing_account_id,
    cust, CASE WHEN is_b2b THEN 'B2B' ELSE 'B2C' END, pay.currency, pay.amount_minor - tax_amount, tax_amount,
    pay.amount_minor, rule.id,
    jsonb_build_object('label', rule.tax_label, 'rateBps', rule.rate_bps, 'mode', rule.price_mode,
      'treatment', rule.treatment, 'note', rule.invoice_note),
    pay.id, pay.plan_code, pay.plan_price_id, pay.period_start, pay.period_end, now(),
    coalesce(pay.discount_minor, 0), CASE WHEN coalesce(pay.discount_minor, 0) > 0 THEN pay.offer_code END)
  RETURNING id INTO invoice_id;
  INSERT INTO billing.invoice_lines (invoice_id, line_no, description, net_minor, tax_minor, total_minor, period_start, period_end)
  VALUES (invoice_id, 1, 'LinkBooks ' || coalesce(plan_name, pay.plan_code, 'subscription') || ' subscription',
    pay.amount_minor - tax_amount, tax_amount, pay.amount_minor, pay.period_start, pay.period_end);
  UPDATE billing.payments SET invoice_issue_error = NULL WHERE id = pay.id;
  PERFORM billing.write_audit('invoice.issued', 'invoice', invoice_id::text, pay.billing_account_id, NULL,
    jsonb_build_object('number', doc_number, 'currency', pay.currency, 'total', pay.amount_minor, 'tax', tax_amount,
      'paymentId', pay.id), 'Payment received');
  RETURN jsonb_build_object('result', 'issued', 'invoiceId', invoice_id, 'number', doc_number);
END $$;

CREATE OR REPLACE FUNCTION public.billing_document(_kind text, _id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  inv billing.invoices%ROWTYPE;
  note billing.credit_notes%ROWTYPE;
  owner_company uuid;
BEGIN
  IF _kind = 'invoice' THEN
    SELECT * INTO inv FROM billing.invoices WHERE id = _id;
    owner_company := inv.company_id;
  ELSIF _kind = 'credit_note' THEN
    SELECT * INTO note FROM billing.credit_notes WHERE id = _id;
    owner_company := note.company_id;
    SELECT * INTO inv FROM billing.invoices WHERE id = note.invoice_id;
  ELSE
    RAISE EXCEPTION 'Unknown document type' USING ERRCODE = '22023';
  END IF;
  IF owner_company IS NULL OR NOT (public.has_company_permission(owner_company, 'billing.view')
       OR private.platform_can('billing.view')) THEN
    RAISE EXCEPTION 'Document not found' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'kind', _kind,
    'id', _id,
    'companyId', owner_company,
    'number', CASE WHEN _kind = 'invoice' THEN inv.invoice_number ELSE note.credit_note_number END,
    'invoiceNumber', inv.invoice_number,
    'issuedAt', CASE WHEN _kind = 'invoice' THEN inv.issued_at ELSE note.issued_at END,
    'seller', inv.seller,
    'customer', inv.customer,
    'currency', inv.currency,
    'tax', inv.tax,
    'subtotalMinor', CASE WHEN _kind = 'invoice' THEN inv.subtotal_minor ELSE note.subtotal_minor END,
    'taxMinor', CASE WHEN _kind = 'invoice' THEN inv.tax_minor ELSE note.tax_minor END,
    'totalMinor', CASE WHEN _kind = 'invoice' THEN inv.total_minor ELSE note.total_minor END,
    'reason', note.reason,
    'discountMinor', CASE WHEN _kind = 'invoice' THEN inv.discount_minor ELSE 0 END,
    'offerCode', CASE WHEN _kind = 'invoice' THEN inv.offer_code END,
    'periodStart', inv.period_start,
    'periodEnd', inv.period_end,
    'lines', CASE WHEN _kind = 'invoice' THEN coalesce((SELECT jsonb_agg(jsonb_build_object('description', l.description,
        'quantity', l.quantity, 'netMinor', l.net_minor, 'taxMinor', l.tax_minor, 'totalMinor', l.total_minor)
        ORDER BY l.line_no) FROM billing.invoice_lines l WHERE l.invoice_id = inv.id), '[]'::jsonb)
      ELSE jsonb_build_array(jsonb_build_object('description', 'Credit against invoice ' || inv.invoice_number,
        'quantity', 1, 'netMinor', note.subtotal_minor, 'taxMinor', note.tax_minor, 'totalMinor', note.total_minor)) END,
    'pdfPath', CASE WHEN _kind = 'invoice' THEN inv.pdf_path ELSE note.pdf_path END);
END $$;

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION billing.coupon_evaluation(text, uuid, text, text, text, bigint) FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON FUNCTION billing.coupon_evaluation(text, uuid, text, text, text, bigint) FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
REVOKE ALL ON FUNCTION public.billing_redeem_coupon(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_provider_coupon(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_record_provider_coupon(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_redeem_coupon(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_provider_coupon(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_record_provider_coupon(text, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.billing_quote_coupon(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_attach_coupon(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_link_provider_coupon(text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_coupons() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_save_coupon(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_quote_coupon(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_attach_coupon(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_link_provider_coupon(text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_coupons() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_save_coupon(jsonb, text) TO authenticated, service_role;
