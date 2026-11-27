# Production billing roadmap (post-audit)

## Phase 1 — Audit (done)

Existing platform already covers: hosted Checkout, durable webhooks, Stripe upgrade/downgrade, portal, invoices/PDF, DB entitlements, cancel/reverse cancel, duplicate-sub guards.

## Phase 2–5 — Implemented in this pass

| Item | Status |
| ---- | ------ |
| Monthly ↔ annual without cancel | Done — `billing_prepare_plan_change(..., _interval)` |
| Proration preview before confirm | Done — `previewOrganisationPlanChange` + Stripe `invoices/create_preview` |
| Reverse pending downgrade | Done — `billing_clear_scheduled_plan_change` + Keep current plan |
| Payment-failed notice recipient | Done — `billing_contact_email` + webhook wiring |
| Past-due UX | Done — banner + subscription alert + Manage billing CTA |
| Interval on plan cards | Done — Current only when plan **and** interval match |

## Still open (next passes)

| Item | Priority |
| ---- | -------- |
| Apply migration `20261127083000_billing_plan_change_v2.sql` on live Supabase (`qugoaaizclvkzesptovm`) | P0 |
| Stripe test-clock / lifecycle integration tests | P1 |
| Open/failed Stripe invoice list in Billing Documents | P2 |
| Payment Element (in-app card) — optional; hosted Checkout remains standard | P2 |
| Catalogue rename Free/Basic/Professional/Enterprise — product decision; current STANDARD/PRO/BUSINESS + trial is live | P2 |
| Webhook retry cron verification in production | P1 |

## Manual verification (after migration apply)

1. Subscribe monthly → open upgrade → see **Due now** preview → Continue to Stripe → plan updates after pay.
2. Downgrade → see scheduled date → **Keep current plan** reverses it.
3. Toggle Yearly on same plan → switch without cancel.
4. Simulate failed renewal → past_due banner + Fix billing.
