# Global subscription checkout — implementation and launch gates

Status: implementation branch, **not certified for live payment acceptance**. Updated 30 October 2026.

## Scope

- LinkBooks subscription payments **to the LinkBooks platform** (not a connected
  organisation's sales-invoice collections, which require a separate provider integration).
- Contact and billing address recorded before checkout. ISO 3166-1 alpha-2 billing countries
  in a dedicated billing selector, independent of the initial six accounting launch markets.
- Presentment currencies: INR India; GBP United Kingdom; AUD Australia; NZD New Zealand;
  USD United States, Canada and currently other countries. No FX rate conversion is implied.
- Server generates final quoted price for the selected billing country and optional promotion.
  In the UI, the price shown in the order summary must match the country-specific quote.
- Stripe Checkout for customers in eligible countries. Payment method selection is dynamic
  based on account configuration, country, payment amount and subscription compatibility.
  Stripe may show cards, wallets and other local payment methods; no particular method
  is guaranteed for every customer.
- Razorpay Subscriptions for India when credentials are present, with UPI AutoPay and
  bank e-mandate eligibility controlled by the merchant account. A standard NEFT transfer
  **is not** an automatically renewing payment mandate.
- Unconfigured providers are not presented as usable payment options; sensitive card,
  UPI and bank credentials remain on provider-hosted pages.
- Stripe paid access requires evidence of a paid checkout or eligible trial. Deferred bank
  payments must not activate at an unpaid checkout-completed event. Invoice-paid events
  can complete a previously pending checkout.
- Razorpay payment event deduplication uses the provider's unique event ID, not the
  subscription ID (which repeats on renewals). Pending/halted events do not activate checkout.

## Release checklist

| Gate | Status / evidence required |
| --- | --- |
| Global billing-country selector | Implemented in this branch; CI pending |
| Server-side provider and country validation | Implemented in this branch; CI pending |
| Country-specific price quote in UI | Implemented in this branch; CI pending |
| Stripe dynamic checkout compatibility | Implemented in this branch; live provider smoke test pending |
| Stripe async payment activation safety | Improved in this branch; webhook integration exercise pending |
| Razorpay webhook event ID and activation | Improved in this branch; real sandbox events pending |
| Stripe and Razorpay account onboarding, keys and webhook secrets | Merchant action pending |
| 3DS/SCA, mandates, payment-failure and retry flows | Provider sandbox verification pending |
| Automated tax collection / VAT / GST / sales tax treatment | **Not implemented**; tax/legal review mandatory |
| Real invoice receipts, credit notes and adjustments for LinkBooks billing | Not verified |
| Subscription plan changes across all provider and mandate types | Not fully verified |
| Live refund, dispute and chargeback handling | Not fully verified |
| Merchant payout reconciliation and revenue recognition | Not verified |
| PayPal direct integration or Paddle merchant of record | **Not implemented** |
| All-country availability guarantee | Not possible: provider coverage and jurisdiction rules vary |

## Test commands

Run `npm ci && npm run typecheck && npm test && npm run build`; then verify payment
flows end-to-end in **test mode**, including one successful card renewal, failed payment,
bank-debit asynchronous confirmation, India UPI mandate, cancellation, and refund.

**Do not set live keys or open subscription collection to real customers** until the tax,
compliance, provider onboarding and end-to-end payment tests above have passed.
