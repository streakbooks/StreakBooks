# Hybrid payment architecture (Stripe + Razorpay)

**Verdict:** Existing stack already supports hybrid billing. This document records the audit and the incremental hardening completed so India → Razorpay and international → Stripe are enforced end-to-end without rewriting working flows.

## Architecture verdict

| Layer | Status |
| ----- | ------ |
| DB country routes (`billing.payment_provider_routes` / `country_providers`) | **Present** — IN→razorpay, default→stripe |
| Provider locking on `company_subscriptions.provider` | **Present** — plan change / cancel / webhooks honour lock |
| Dual webhooks + normalised events | **Present** |
| Country price book + provider price mappings | **Present** |
| Shared `PaymentProvider` OOP interface | **Not required** — parallel adapters + `Normalised*` types |
| Checkout UI filtered by DB routes | **Hardened** (`provider-resolution.ts`) |
| Legacy checkout provider gate | **Hardened** (resolves routes even without price-book snapshot) |

## Resolution rules (server authority)

1. Prefer `billing_checkout_price.providers` / `billing_price_list.providers` from `billing.country_providers`.
2. Never trust a client-supplied provider id.
3. Do not use IP geolocation as the sole country signal; organisation billing country + checkout region assert.
4. Once subscribed, all lifecycle ops use the **locked** provider. No silent Stripe↔Razorpay migration.
5. Configurable routes via platform Payment Operations (`platform_set_provider_route`).

## Capability matrix (honest)

| Operation | Stripe | Razorpay |
| --------- | ------ | -------- |
| Checkout / subscribe | Yes | Yes (UPI / e-mandate) |
| Upgrade with proration | Yes | Limited — scheduled / provider rules |
| Downgrade at period end | Yes | Yes (provider schedule) |
| Interval month↔year | Yes (anchor rules) | Per Razorpay plan constraints |
| Hosted customer portal | Yes | Not via Stripe portal — clear error |
| Manual subscription sync | Stripe pull | Webhook-authoritative |
| Invoices list | Stripe API + platform | Platform tax invoices |

## Code map

| Concern | Location |
| ------- | -------- |
| Route filter + defaults | `src/lib/billing/provider-resolution.ts` |
| Checkout create | `createCheckoutFor` in `billing.functions.ts` |
| Plan change lock | `billing_prepare_plan_change` + `changePlanFor` |
| Webhooks | `webhooks.ts` → `/api/billing/stripe` \| `/api/billing/razorpay` |
| Admin route edits | `payment-admin.functions.ts` |

## Production readiness

**Not claimed.** Still require: staging/prod migration apply for any pending billing migrations, webhook + cron verification, and authenticated UI E2E with both providers in test mode.

See also: `18-production-release.md`, `15-plan-change-policy.md`, `22-razorpay-test-mode-setup.md`.
