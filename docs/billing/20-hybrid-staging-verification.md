# Hybrid billing — staging-readiness verification

**Date:** 2026-11-27  
**Project host checked:** `qugoaaizclvkzesptovm.supabase.co`  
**Verdict:** **Not production-ready.** Live **route policy matches** repository seed; automated SQL/unit/routing checks pass. Authenticated Razorpay/Stripe sandbox checkout, renewal, and webhook dashboard verification remain **manual**.

Execution attempt (Playwright hybrid harness + webhook probes): see `21-hybrid-authenticated-staging-execution.md`.

Legend: **Automated** = ran in this session · **Live API** = read-only RPC against linked project · **Manual** = needs your login / dashboard · **Blocked** = credentials or app session missing

---

## 1. Database verification

### Repository seed (source of truth)

`supabase/migrations/20261105182042_billing_payment_pipeline.sql`:

| Route | Provider | Priority |
| ----- | -------- | -------- |
| `IN` | `razorpay` | 10 |
| `NULL` (default) | `stripe` | 100 |

`billing.country_providers(country)`: if the country has any **enabled** country-specific row, use those; else use default (`country_code IS NULL`). Disabling a country override falls back to Stripe.

### Live project vs seed (**Live API**, read-only `billing_price_list`)

| Country | providers (live) | Expected | billingEnabled | Result |
| ------- | ---------------- | -------- | -------------- | ------ |
| IN | `["razorpay"]` | Razorpay only | true | **Pass** — no Stripe |
| GB | `["stripe"]` | Stripe | true | **Pass** |
| US | `["stripe"]` | Stripe | true | **Pass** |
| AU | `["stripe"]` | Stripe | true | **Pass** |
| CA | `["stripe"]` | Stripe | true | **Pass** |
| NZ | `["stripe"]` | Stripe | true | **Pass** |
| IE | `["stripe"]` | Stripe | true | **Pass** |
| DE | `["stripe"]` | Stripe | **false** | **Pass** (routed Stripe; checkout closed) |

Re-run:

```bash
node scripts/verify-hybrid-provider-routes.mjs
```

### Admin route override (**Automated** SQL suite)

`billing-04-provider-payments.sql`:

- Enable AU→Razorpay → `country_providers('AU') = [razorpay]`
- Disable AU route → falls back to `[stripe]`

### Provider locking (**Automated** + code review)

| Check | Evidence | Result |
| ----- | -------- | ------ |
| Plan change uses `sub.provider` | `billing_prepare_plan_change` | Pass (SQL + code) |
| Cancel uses locked provider | `cancelAtProvider` | Pass |
| Second checkout blocked while paid | `createCheckoutFor` | Pass |
| Razorpay cannot open Stripe portal | `openBillingPortal` throws | Pass (code + unit-adjacent) |
| Stripe sync refused for Razorpay | `syncOrganisationSubscription` | Pass (code) |

**Not verified live:** raw `SELECT * FROM billing.payment_provider_routes` (needs service role / SQL editor). Publishable RPC only exposes derived `providers`.

**Production:** do not modify routes automatically.

---

## 2. Indian customer E2E

| Step | Status |
| ---- | ------ |
| India billing country → INR pricing | **Live API** — IN price list 3 plans, providers razorpay |
| Razorpay only eligible provider | **Automated** unit + **Live API** + SQL |
| Select plan + Razorpay sandbox checkout | **Manual** — needs IN company + `RAZORPAY_*` test keys |
| Subscription authorization | **Manual** |
| Webhook processing | **Manual** (Stripe CLI / Razorpay dashboard + `/api/billing/razorpay`) |
| company_subscriptions status | **Manual** |
| Entitlements | **Manual** / SQL entitlement suites historically |
| Recurring payment | **Manual** (Razorpay test clock / mandate) |
| Payment failure + recovery | **Manual** |

Playwright gate (UI method filter only):

```bash
E2E_BILLING_ENABLED=true E2E_BILLING_COUNTRY=IN \
E2E_EMAIL=… E2E_PASSWORD=… E2E_BASE_URL=http://localhost:8080 \
npm run test:billing:live
```

---

## 3. International customer E2E

| Step | Status |
| ---- | ------ |
| Eligible country → Stripe | **Live API** GB/US/… |
| Regional pricing | **Live API** planCount=3; currency via price book |
| Stripe test checkout | **Manual** / prior Stripe Test Clock suite |
| Webhooks | **Manual** + durable store SQL |
| Upgrade / downgrade / renewal | **Automated** Stripe Test Clock (prior session); UI **Manual** |

```bash
E2E_BILLING_ENABLED=true E2E_BILLING_COUNTRY=GB \
E2E_EMAIL=… E2E_PASSWORD=… npm run test:billing:live
```

Stripe Test Clocks (prior): `STRIPE_TEST_CLOCKS=full` — **Passed**.

---

## 4. Cross-provider isolation

| Check | How verified | Result |
| ----- | ------------ | ------ |
| Razorpay sub never renews via Stripe | Locked provider + webhook applier by provider id | **Code + SQL** Pass |
| Stripe sub never renews via Razorpay | Same | **Code + SQL** Pass |
| Razorpay cannot open Stripe Billing Portal | Explicit error in `openBillingPortal` | **Code** Pass |
| Stripe cancel does not call Razorpay | `cancelAtProvider` branch | **Code** Pass |
| Duplicate subscription prevention | Checkout refuses active/trialing/past_due/paused | **Code + SQL** Pass |
| Duplicate charges / webhook dedupe | `billing_webhook_receive` unique event id | **SQL** Pass (`billing-04`) |

No live dual-org mutation run in this session.

---

## 5. Webhook verification

| Check | Automated | Live dashboard |
| ----- | --------- | -------------- |
| Dual endpoints `/api/billing/stripe` & `/api/billing/razorpay` | Code path exists | **Manual** hit with test events |
| Signature verification | Unit signature tests historically | **Manual** wrong-sig → 401 |
| Duplicate events | SQL redelivery `fresh=false` | **Manual** replay |
| Retry / dead-letter | SQL claim/finish/dead + cron route | Cron schedule **Manual** verify on host |
| Out-of-order | SQL stale event skip | — |
| Normalisation | `stripeToEvents` / `razorpayEvents` | — |
| Tenant isolation | company_id on apply + RLS | SQL suites |

Unit this session: provider-resolution + pricing + webhooks-related files — **28 passed**.  
Docker SQL: **all billing-01…10 passed** (incl. routing + webhook store).

---

## 6. Automated results summary (this session)

| Suite | Result |
| ----- | ------ |
| `node scripts/verify-hybrid-provider-routes.mjs` (against linked project) | **Pass** (IN≠Stripe; intl→Stripe) |
| `npm run test:billing:postgres` | **Pass** (10/10 suites) |
| `provider-resolution` + pricing + webhook unit files | **28 passed** |
| Live Playwright IN/GB checkout mutations | **Not executed** (no E2E credentials) |
| Screenshots | **None** — no authenticated browser session |

---

## 7. Remaining manual steps

1. SQL editor (service role): `select * from billing.payment_provider_routes order by country_code nulls last, priority;` confirm matches seed; no IN+stripe row enabled.
2. Indian test org: full Razorpay sandbox subscribe → webhook → `company_subscriptions.provider = 'razorpay'`.
3. GB/US test org: Stripe test Checkout → webhook → `provider = 'stripe'`.
4. Cross-check: Razorpay org Settings → Manage billing → expect Razorpay message, not Stripe portal URL.
5. Stripe org: cancel/upgrade stay on Stripe.
6. Replay one Stripe and one Razorpay webhook; confirm duplicate ignored.
7. Confirm `STREAKBOOKS_CRON_SECRET` + Vercel cron hitting webhook-retry.

---

## 8. Staging deployment checklist

- [ ] `node scripts/verify-hybrid-provider-routes.mjs` green against staging URL
- [ ] Razorpay + Stripe **test** keys on staging host
- [ ] Webhook endpoints registered for both providers (test mode)
- [ ] Cron webhook-retry authenticated and logging
- [ ] IN org sandbox subscribe + entitlement smoke
- [ ] Non-IN org Stripe test subscribe + plan change smoke
- [ ] Portal isolation smoke (Razorpay vs Stripe)

---

## 9. Production release checklist

- [ ] Staging sign-off on §8
- [ ] Live keys only with `STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS=true`
- [ ] Live webhook secrets rotated; no test endpoints on prod
- [ ] Routes table reviewed — India still Razorpay-only
- [ ] No automatic route edits during deploy
- [ ] 24–48h monitor: past_due, dead webhooks, cron failures

---

## Production readiness claim

**Not production-ready.** Critical automated and live **routing** checks pass. Critical **sandbox checkout + webhook + entitlement** journeys for both providers still require authenticated staging verification listed in §7–§8.
