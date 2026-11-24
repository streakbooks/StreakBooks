# Automatic subscription localization (StreakBooks)

- Public pricing: trusted Vercel `x-vercel-ip-country` header resolves region.
  No country/currency selector. Show an explicit USD fallback if geo is missing.
- Signed-in pricing: organisation country controls billing, even if a member is
  travelling. Accounting base currency remains independent.
- Checkout: country and currency are shown, not selectable. The checkout POST
  is validated against the server's region before creating a provider session.
- India: UPI AutoPay is preferred when Razorpay is configured; otherwise Stripe
  presents its dynamically eligible methods. No gateway credentials are stored
  in frontend code, and payment methods require merchant activation.

## Current coverage / mandatory launch gates

Fixed local pricing: INR India, GBP UK, AUD Australia, NZD New Zealand, USD
United States. All other countries currently see USD international pricing.
Geolocation works worldwide, but local-currency pricing and domestic acquiring
are **not** yet supported in every country. Do not misrepresent USD as local.

IP location does not prove legal billing/tax jurisdiction. Incorrect organisation
country must be corrected in organisation settings. Global payment acceptance,
tax, refunds, disputes, mandates, SCA, billing receipts and provider onboarding
must pass the gates in `global-subscriptions.md` before live collection.

Verify with `npm ci && npm run typecheck && npm test && npm run build`,
then run checkout + webhook sandbox tests for each enabled provider.
