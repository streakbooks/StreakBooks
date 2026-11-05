# Billing platform — country pricing

Phase 3. Migration `20261105173804_billing_pricing_engine.sql`; domain code
`src/lib/billing/domain/country-pricing.ts`; server functions
`src/lib/billing/country-pricing.functions.ts`; admin panel
`src/components/platform/billing/CountryPricingAdmin.tsx` (Superadmin → Platform billing).

## Model

Prices live in the existing versioned price book: `plan_versions` + `plan_prices`. A country price
is a `plan_prices` row with a `country_code`, a `strategy` and, for converted prices, the exact
inputs used (`base_currency`, `base_amount_minor`, `fx_rate_id`, `fx_rate`, `markup_bps`,
`rounding_mode`). Published and archived versions cannot be edited or deleted, so a customer's
price snapshot never changes underneath them.

| Strategy            | Price a customer in that country sees                                    |
| ------------------- | ------------------------------------------------------------------------ |
| (no rule) or `BASE` | The USD base price                                                       |
| `FIXED`             | A local price entered by platform staff (India: INR)                     |
| `CUSTOM`            | A local override entered by platform staff                               |
| `FX_CONVERTED`      | USD base × latest rate × (1 + markup), rounded once with the rule's mode |

Launch values from the brief (USD minor units / INR paise):

| Plan     | USD base (monthly) | India FIXED (monthly) |
| -------- | ------------------ | --------------------- |
| STANDARD | 1000 ($10)         | 49900 (₹499)          |
| PRO      | 2000 ($20)         | 99900 (₹999)          |
| BUSINESS | 5000 ($50)         | 199900 (₹1,999)       |

No yearly prices were given, so yearly billing is not offered for these plans. Adding a yearly base
price makes yearly available for USD and FX countries; FIXED countries need their own yearly price.

## Workflow

1. **Working prices** (`billing.price_inputs`): USD base prices per plan and interval, plus local
   prices for FIXED/CUSTOM countries.
2. **Country rules** (`billing.country_pricing_rules`): strategy, currency, markup (basis points),
   rounding mode (`HALF_UP`, `HALF_EVEN`, `UP`, `DOWN`), optional maximum rate age, active flag.
3. **Exchange rates** (`billing.exchange_rates`): append-only USD→currency rates stored as
   `numeric(24,12)` with source, provider, fetched and effective times. No rate provider is chosen
   (decision D6), so rates are entered manually; a provider adapter will write `source = PROVIDER`.
4. **Draft**: `platform_draft_country_prices(plan)` builds a new version from the inputs, the active
   rules and the latest rates. If any active rule cannot be priced monthly (missing local price,
   missing or stale rate, wrong currency) the whole draft is refused and the problems are listed.
5. **Publish**: a platform owner other than the drafter publishes the version (existing
   Publish button). Finance staff drafts go to review and also need an owner to publish.
6. **Roll back** republishes the previous price-book version; the retired top-tier PRO version is
   never eligible.

Customers read prices only through `public.billing_price_list(country)`, which returns the latest
published version per plan: the country's rows if the version has any, otherwise the USD base rows.
Unknown or unsupported countries get the base prices.

## Country resolution

- Pricing page: the visitor's `x-vercel-ip-country`, or a country chosen in the selector
  (display only, not stored). Without either (for example local development), USD is shown.
- Signed-in subscription panel: the organisation's country.
- Checkout (phase 5) will use the verified billing address country to choose the final price.

## Arithmetic

Conversion is exact: Postgres `numeric` in `billing.fx_convert` / `billing.round_ratio`, and
`bigint` arithmetic in `convertBasePrice` (TypeScript). Rounding happens once, by magnitude, to the
target currency's ISO 4217 minor unit (JPY 0, INR 2, KWD 3). The same test vectors run against both
implementations.

## Not decided (not invented)

Rate provider and refresh schedule (D6), launch FX countries beyond the default (D7), yearly prices,
India tax-inclusive display (D13). Prices are shown with "taxes, where they apply, are shown at
checkout" until tax rules are approved. Online checkout for the new plans opens in phase 5; until
then the published prices are shown and the trial needs no card.
