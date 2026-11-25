-- Launch billing: enable checkout countries and publish price-book snapshots
-- on the phase-2 catalogue versions (standard / pro / business).

UPDATE billing.countries
   SET billing_enabled = true,
       updated_at = now()
 WHERE code IN ('GB', 'US', 'IN', 'AU', 'NZ', 'IE', 'CA');

INSERT INTO billing.country_pricing_rules (country_code, strategy, currency, is_active)
VALUES ('GB', 'FIXED', 'GBP', true)
ON CONFLICT (country_code) DO UPDATE
  SET strategy = EXCLUDED.strategy,
      currency = EXCLUDED.currency,
      is_active = true,
      updated_at = now();

INSERT INTO billing.price_inputs (plan_code, billing_interval, country_code, currency, amount_minor)
VALUES
  ('standard', 'month', 'GB', 'GBP', 2900),
  ('pro', 'month', 'GB', 'GBP', 5900),
  ('business', 'month', 'GB', 'GBP', 9900)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  vid uuid;
  rec record;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('standard'::text, 1000::int, 10000::int, 2900::int, 29000::int, 49900::int, 499000::int),
      ('pro',          2000,  20000,  5900,  59000,  99900,   999000),
      ('business',     5000,  50000,  9900,  99000,  199900, 1999000)
    ) AS t(plan_code, usd_month, usd_year, gbp_month, gbp_year, inr_month, inr_year)
  LOOP
    SELECT v.id INTO vid
      FROM public.plan_versions v
     WHERE v.plan_code = rec.plan_code
       AND v.status = 'published'
       AND v.price_book
     ORDER BY v.version_no DESC
     LIMIT 1;

    IF vid IS NULL THEN
      RAISE NOTICE 'No published price-book version for plan %', rec.plan_code;
      CONTINUE;
    END IF;

    INSERT INTO public.plan_prices (version_id, currency, billing_interval, amount_minor, needs_review, strategy)
    VALUES (vid, 'USD', 'month', rec.usd_month, false, 'BASE')
    ON CONFLICT (version_id, currency, billing_interval) WHERE country_code IS NULL DO NOTHING;

    INSERT INTO public.plan_prices (version_id, currency, billing_interval, amount_minor, needs_review, strategy)
    VALUES (vid, 'USD', 'year', rec.usd_year, false, 'BASE')
    ON CONFLICT (version_id, currency, billing_interval) WHERE country_code IS NULL DO NOTHING;

    INSERT INTO public.plan_prices (version_id, currency, billing_interval, amount_minor, needs_review, strategy, country_code)
    VALUES (vid, 'GBP', 'month', rec.gbp_month, false, 'FIXED', 'GB')
    ON CONFLICT (version_id, country_code, billing_interval) WHERE country_code IS NOT NULL DO NOTHING;

    INSERT INTO public.plan_prices (version_id, currency, billing_interval, amount_minor, needs_review, strategy, country_code)
    VALUES (vid, 'GBP', 'year', rec.gbp_year, false, 'FIXED', 'GB')
    ON CONFLICT (version_id, country_code, billing_interval) WHERE country_code IS NOT NULL DO NOTHING;

    INSERT INTO public.plan_prices (version_id, currency, billing_interval, amount_minor, needs_review, strategy, country_code)
    VALUES (vid, 'INR', 'month', rec.inr_month, false, 'FIXED', 'IN')
    ON CONFLICT (version_id, country_code, billing_interval) WHERE country_code IS NOT NULL DO NOTHING;

    INSERT INTO public.plan_prices (version_id, currency, billing_interval, amount_minor, needs_review, strategy, country_code)
    VALUES (vid, 'INR', 'year', rec.inr_year, false, 'FIXED', 'IN')
    ON CONFLICT (version_id, country_code, billing_interval) WHERE country_code IS NOT NULL DO NOTHING;
  END LOOP;
END $$;