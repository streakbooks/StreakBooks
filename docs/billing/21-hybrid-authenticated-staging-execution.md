# Hybrid billing — authenticated staging execution report

**Date:** 2026-11-27  
**Environment under test:** `http://localhost:8080` (app reachable) + Supabase `qugoaaizclvkzesptovm.supabase.co`  
**Command prepared:** `npm run test:billing:hybrid`  
**Verdict:** **Not production-ready.** Webhook operational probes **passed**. Authenticated India/UK/US journeys **could not run** — no `E2E_*` credentials and no Razorpay test keys in this environment.

---

## Evidence table

| Test name | Environment | Provider | Expected | Actual | Pass/Fail | Notes |
| --------- | ----------- | -------- | -------- | ------ | --------- | ----- |
| Live `billing_price_list` IN | Linked Supabase | Razorpay | `providers=["razorpay"]` | `["razorpay"]` | **Pass** | `verify-hybrid-provider-routes.mjs` |
| Live `billing_price_list` GB/US | Linked Supabase | Stripe | `["stripe"]` | `["stripe"]` | **Pass** | Same script |
| IN — subscription / Razorpay methods | localhost:8080 | Razorpay | Authenticated UI | **Skipped** | Blocked | Missing `E2E_IN_EMAIL` / `E2E_IN_PASSWORD` |
| IN — Razorpay sandbox checkout | localhost:8080 | Razorpay | Checkout redirect | **Skipped** | Blocked | Missing credentials + `RAZORPAY_*` keys |
| IN — isolation Manage billing | localhost:8080 | Razorpay | No Stripe portal | **Skipped** | Blocked | Missing credentials |
| GB — Stripe-only methods | localhost:8080 | Stripe | Stripe UI only | **Skipped** | Blocked | Missing `E2E_GB_*` |
| GB — Stripe Checkout mutation | localhost:8080 | Stripe | Checkout redirect | **Skipped** | Blocked | Missing credentials |
| GB — upgrade / interval UI | localhost:8080 | Stripe | Preview UI | **Skipped** | Blocked | Missing credentials |
| US — Stripe-only methods | localhost:8080 | Stripe | Stripe UI only | **Skipped** | Blocked | Missing `E2E_US_*` |
| US — Stripe Checkout mutation | localhost:8080 | Stripe | Checkout redirect | **Skipped** | Blocked | Missing credentials |
| webhook-retry no Bearer | localhost:8080 | Cron | 401 or 500 | 401/500 family | **Pass** | Playwright hybrid suite |
| webhook-retry wrong Bearer | localhost:8080 | Cron | 401 or 500 | 401/500 family | **Pass** | Cron secret unset → 500 is valid |
| Stripe webhook unsigned | localhost:8080 | Stripe | ≥400 | ≥400 | **Pass** | Signature required |
| Razorpay webhook unsigned | localhost:8080 | Razorpay | ≥400 | ≥400 | **Pass** | Signature required |
| Recurring / fail-recover / dead-letter dashboard | Staging | Both | Full journey | **Not run** | Blocked | Needs dashboard + orgs |
| Screenshots | — | — | Evidence PNGs | **None** | N/A | Auth journeys did not execute |

Subscription IDs: **none captured** (no authenticated checkout completed).

---

## What was prepared (ready to run when you supply secrets)

| Artifact | Purpose |
| -------- | ------- |
| `e2e/billing/hybrid-staging.live.spec.ts` | IN / GB / US journeys + webhook probes |
| `playwright.billing-hybrid.config.ts` | Reporter + `test-results/hybrid-billing*` |
| `npm run test:billing:hybrid` | Entrypoint |
| `.env.example` | Documents `E2E_IN_*` / `E2E_GB_*` / `E2E_US_*` (names only) |

### How you run authenticated tests (do not paste passwords into chat)

```bash
# .env (local only):
E2E_BILLING_ENABLED=true
E2E_BASE_URL=http://localhost:8080
E2E_IN_EMAIL=…  E2E_IN_PASSWORD=…
E2E_GB_EMAIL=…  E2E_GB_PASSWORD=…
E2E_US_EMAIL=…  E2E_US_PASSWORD=…
# Optional mutations (test-mode Checkout only):
E2E_BILLING_MUTATIONS=true
# Razorpay sandbox keys required for India mutations:
# RAZORPAY_KEY_ID=… RAZORPAY_KEY_SECRET=…

npm run test:billing:hybrid
# Evidence: test-results/hybrid-billing-evidence/*.png
#           test-results/hybrid-billing-results.json
```

---

## Classification

| Category | Status |
| -------- | ------ |
| Automated tests passed | Route verifier; webhook unsigned rejection; cron auth probe; prior SQL/unit/Test Clock |
| Authenticated staging tests passed | **No** — 8 hybrid UI journeys skipped for missing credentials |
| Manual dashboard verification completed | **No** — Razorpay/Stripe dashboards not exercised this session |
| Remaining blockers | (1) Test org credentials for IN/GB/US (2) Razorpay test keys on server (3) Cron secret for positive 200 probe (4) Dashboard webhook replay |

---

## Final verdict

**Not production-ready.** Critical authenticated staging journeys have **not** actually passed. Only unauthenticated operational probes and prior routing/SQL automation have passed.

Architecture was **not** modified except adding E2E harness + documentation (no billing domain rewrite).
