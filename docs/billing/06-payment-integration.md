# Billing platform — payment integration

Phase 5. Migration `20261105182042_billing_payment_pipeline.sql`; provider code in
`src/lib/billing/providers/` (`normalise.ts`, `stripe.server.ts`, `razorpay.server.ts`,
`price-mapping.server.ts`); webhooks in `src/lib/billing/webhooks.ts`; checkout in
`billing.functions.ts`; plan changes in `subscription-actions.functions.ts`; cancellation in
`subscription-lifecycle.functions.ts`; admin panel `src/components/platform/billing/PaymentOperationsAdmin.tsx`.

## Principles

- Test mode only unless `LINKBOOKS_ALLOW_LIVE_PAYMENT_KEYS=true` (existing guard). Provider prices
  are mapped per mode, so test and live never mix.
- Paid access changes only from a verified provider event, or a provider response recorded by the
  service role. Browser redirects never activate anything.
- Every provider state change runs through `public.billing_apply_provider_event` in one database
  transaction: subscription, price snapshot, history, cancellation records and hash-chained audit.
- Provider-specific limits are recorded instead of faked (below).

## Routing and countries

`billing.payment_provider_routes`: a country uses its own enabled routes (best priority first),
otherwise the default routes. Seeded: India → Razorpay; default → Stripe. A country takes paid
checkouts only when a platform owner opens it (`billing.countries.billing_enabled`), after provider
eligibility and tax registration are confirmed (decisions D7, D8, D12). Trials work everywhere.

Online checkout for country-priced plans is available in USD, GBP, AUD, NZD and INR; other
currencies show "not available yet".

## Checkout

1. `billing_checkout_price` (billing managers) returns the published snapshot for the organisation
   country and interval, the routed providers and whether the country is open.
2. The billing address country must match the organisation country.
3. The provider price for that snapshot is created once and stored
   (`billing.provider_price_mappings`): a Stripe Price (idempotency key per snapshot) or a Razorpay
   Plan.
4. `billing_checkouts` stores the snapshot id, country, amount and mode; a database guard refuses any
   amount, currency, interval or country that is not the published price for an open country.
5. Stripe Checkout (subscription mode, mapped price, trial end preserved) or a Razorpay subscription
   (`start_at` at the trial end, 120 monthly / 10 yearly cycles because Razorpay needs a count).

Promo codes for the new plans arrive with phase 7.

## Webhooks

`POST /api/billing/stripe` and `/api/billing/razorpay`:

1. Verify the signature on the raw body (Stripe timestamp tolerance 5 minutes); invalid requests are
   not stored.
2. Store the event in `billing_events` (payload, mode, provider time), deduplicated by provider event
   id (Razorpay: `x-razorpay-event-id`).
3. Claim and process: Stripe subscription events re-read the subscription with the pinned API
   version `2025-03-31.basil` (billing periods on subscription items); Razorpay events use the signed
   entity.
4. Apply; stale events (older than the last applied provider state) are skipped.
5. On failure the payload stays, a retry is scheduled (1 minute doubling to 1 hour, dead after 10
   attempts) and the endpoint returns 500 so the provider redelivers.

`POST /api/billing/webhook-retry` (cron-authenticated with the existing cron secret) retries due
events. Platform staff see the queue and can retry failed or dead events.

## Plan changes

| Provider | Upgrade                                                                                                                       | Downgrade                                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Stripe   | Prorated invoice now with `payment_behavior=pending_if_incomplete`; the plan switches when the payment is confirmed (webhook) | New price from the next invoice, no proration; the plan switches at renewal |
| Razorpay | Scheduled for the cycle end (Razorpay cannot prorate)                                                                         | Scheduled for the cycle end                                                 |

Razorpay subscriptions authorised with UPI or e-mandate cannot change plan (provider limitation): the
customer cancels and subscribes again after the period ends. A change of currency also needs a new
subscription.

## Cancellation

The customer confirms in LinkBooks (policy version recorded), the server cancels at the provider
(Stripe `cancel_at_period_end`; Razorpay cancel at cycle end, or immediately before the first cycle),
and the service role confirms the effective date. If the provider refuses, the request is marked
failed and nothing changes. Stripe cancellations can be withdrawn before the date; Razorpay
cancellations cannot be undone at the provider, so LinkBooks shows them as final. Changes made in the
Stripe customer portal are recorded from webhooks.

## Configuration

Server environment (never `VITE_`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RAZORPAY_KEY_ID`,
`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_CRON_SECRET`
(retry endpoint). Provider webhook endpoints should subscribe to: Stripe
`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`,
`invoice.payment_failed`, `customer.subscription.*` (including `pending_update_applied` and
`pending_update_expired`); Razorpay `subscription.*`.

Scheduling the retry endpoint (pg_cron + pg_net with the cron secret) is a deployment step once the
production URL is known.
