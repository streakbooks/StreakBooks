# Billing platform — requirements and status

Source: the master subscription & billing brief (5 November 2026) and
[00-architecture-and-implementation-plan.md](00-architecture-and-implementation-plan.md).
This file tracks what is delivered, what is configurable and what is still undecided.
Nothing here is live in production until the hosted migration gate in
[04-database-design.md](04-database-design.md#hosted-apply-procedure) is run.

## Delivery status

| Phase | Scope                                                                                             | Status                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1     | ISO reference data, billing accounts (B2B/B2C), billing permissions, tamper-evident billing audit | **Implemented and tested locally**, not applied to hosted                                                             |
| 2     | STANDARD/PRO/BUSINESS plans, per-plan trials, entitlement mapping                                 | **Implemented and tested locally**, not applied to hosted                                                             |
| 3     | Country pricing engine (BASE/FIXED/FX_CONVERTED/CUSTOM), FX, publication                          | **Implemented and tested locally**, not applied to hosted; see [07-country-pricing.md](07-country-pricing.md)         |
| 4     | Subscription lifecycle, jobs, legal documents, cancellation                                       | **Implemented and tested locally**, not applied to hosted; see [10-cancellation-policy.md](10-cancellation-policy.md) |
| 5     | Razorpay/Stripe adapters, router, durable webhooks, checkout, renewals, upgrades                  | Planned                                                                                                               |
| 6     | Invoices, payments, refunds, credit notes, tax                                                    | Planned                                                                                                               |
| 7     | Coupons                                                                                           | Planned                                                                                                               |
| 8     | CA partners, referrals, commission ledger (payouts disabled)                                      | Planned                                                                                                               |
| 9     | REST `/api/v1` + OpenAPI                                                                          | Planned                                                                                                               |
| 10    | Admin analytics, E2E, runbook                                                                     | Planned                                                                                                               |

## Phase 1 requirements and how they are met

| Requirement                                     | Implementation                                                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Individuals and organisations can hold billing  | `billing.billing_accounts.account_type` = `INDIVIDUAL` or `ORGANIZATION`                                                          |
| Each billing account owns its own subscription  | Accounts are the future subscription owner; companies link through `billing.billing_account_companies` (one account per company)  |
| A user can belong to many organisations         | Unchanged company membership; each company resolves to its own account                                                            |
| Individual user limit defaults to one           | `user_limit = 1` on INDIVIDUAL accounts, enforced on `company_members` (accountant access excluded)                               |
| Owners and billing admins manage billing        | `billing.manage`, `billing.view`, `billing.payment_methods` (owner and admin by default)                                          |
| Accountants have explicitly granted read access | No default; grant `billing.view` per person through the existing access screen                                                    |
| Employees cannot see payment information        | Staff, bookkeeper, read-only and accountant roles have no billing permission by default                                           |
| Never trust a client `billing_account_id`       | Every database function re-derives access from company permissions or account ownership                                           |
| Correct ISO currency metadata                   | `billing.currencies` (ISO 4217 List One, published 2026-09-17) and `billing.countries` (ISO 3166-1 with CLDR 49 current currency) |
| Integer minor units, 0/2/3-decimal currencies   | `src/lib/billing/domain/money.ts`: bigint arithmetic, ISO exponents, explicit rounding, exact decimal FX                          |
| Financial mutations auditable                   | `public.platform_billing_audit` (append-only) now has a SHA-256 hash chain and a verifier                                         |

## Phase 2 requirements and how they are met

| Requirement                                                                                     | Implementation                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| STANDARD, PRO and BUSINESS on sale                                                              | `billing_plans` rows with `plan_rank` 10/20/30, `pricing_source = 'price_book'`, one live published version each                                                                           |
| Legacy plans hidden, data kept (D2)                                                             | `starter`, `growth`, `premium`, `practice`: `is_public = false`, versions hidden; subscriptions untouched except the one Growth trial                                                      |
| STANDARD: 2 users, 50 invoices and 50 bills a month (D1), no AI                                 | `plan_version_limits`; usage counted per calendar month by `get_entitlements`                                                                                                              |
| PRO: 5 users, unlimited documents, quotes, recurring, reminders, bank rules, multi-currency, AI | `plan_version_limits` mapping                                                                                                                                                              |
| BUSINESS: 10 users, PRO plus fixed assets, approvals, advanced permissions, priority support    | `plan_version_limits` mapping                                                                                                                                                              |
| Not-built features shown as coming soon (D19)                                                   | `billing_features.availability = 'coming_soon'` for OCR, inventory and API; pricing page and quote builder label them                                                                      |
| 30-day trial, no card, configurable per plan                                                    | `billing_plans.trial_enabled` / `trial_days`; signup trial on the plan in `billing_settings.trial_plan_code` (PRO)                                                                         |
| One trial per person / billing account                                                          | `billing.trial_eligibility_rules` (both on, maximum 1) and `billing.trial_grants`; checked at signup and on manual trial start                                                             |
| Platform can change trials and limits                                                           | `platform_set_plan_trial`, `platform_set_trial_rule`, `platform_draft_plan_limits` (aal2 platform staff, audited; limit changes become a draft/review version, never edit a published one) |
| No invented prices                                                                              | New plans carry no price; checkout, quotes and plan changes refuse them and the public catalogue hides any price checkout cannot charge until phase 3                                      |
| Existing trial continues                                                                        | The Growth trial moved to PRO (same allocation) with its original end date                                                                                                                 |

Behaviour when a person has already used a trial: their next organisation is created normally,
they are its owner, and it opens read-only with a prompt to choose a plan. It cannot add more
people or post until a plan is active. Because the new plans have no prices until phase 3, such an
organisation stays read-only until then, or until platform staff relax the trial rule.

## Phase 3 requirements and how they are met

| Requirement                                                  | Implementation                                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| USD base prices STANDARD $10, PRO $20, BUSINESS $50          | Seeded working prices; published only through a second owner                  |
| India fixed INR ₹499 / ₹999 / ₹1,999, never derived from USD | `IN` rule `FIXED` INR with seeded local prices                                |
| Other countries FX-converted with markup and rounding        | `FX_CONVERTED` rules, append-only rates, exact `numeric`/`bigint` conversion  |
| Customers see only published snapshots                       | `billing_price_list` reads published versions; published prices are immutable |
| Refreshing FX creates drafts, publication is explicit        | Draft per plan; publisher must differ from drafter                            |
| Yearly only when configured                                  | No yearly prices seeded; yearly hidden until a yearly price exists            |
| Unknown countries fall back to USD                           | Price list returns base rows for unknown or rule-less countries               |
| Never use JS floats                                          | `numeric` in SQL, `bigint` in TypeScript; shared test vectors                 |

## Phase 4 requirements and how they are met

| Requirement                                           | Implementation                                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Status separate from access                           | Status on `company_subscriptions`; access from `subscription_allows_posting`                  |
| Cancel at period end with full access until then      | `cancel_at_period_end` + `billing.cancellation_requests`; sweep ends it on the effective date |
| Reversal before the effective date                    | `billing_reverse_cancellation`                                                                |
| Policy version shown and explicit confirmation stored | Request stores policy id/version and confirmation; acceptance recorded; stale policy refused  |
| Confirmation notice                                   | E-mail via existing Resend transport when configured; outcome recorded                        |
| Trial expiry and pending downgrades                   | Lifecycle sweep in the existing platform worker every 15 minutes                              |
| Retry schedule and grace period not invented (D9)     | Past-due only alerts; existing grace rule unchanged                                           |
| Pause only by platform admins (D17)                   | `platform_pause_subscription` / `platform_resume_subscription`                                |
| Legal documents admin-managed, require legal review   | Versioned, second-owner approval, immutable after approval, public only when published        |
| Lifecycle history                                     | Append-only `billing.subscription_events` written by trigger on every change                  |

## Configurable, intentionally unset (do not invent)

Yearly prices and annual discount, extra-seat pricing, CA commission rate/duration/minimum
payout, payment retry schedule, grace period, tax rules, legal cancellation wording, FX provider
and rounding rules. See the decision register (D1–D22) in the plan.

## Decisions taken (5 November 2026)

| #   | Decision                                                | Outcome                                                             |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| D1  | Period for STANDARD's 50 invoices / 50 bills & expenses | **Per calendar month** (matches `get_entitlements` usage counters)  |
| D2  | Legacy plans `starter`, `growth`, `premium`, `practice` | **Hidden from sale**; rows and history kept                         |
| D19 | Not-yet-built features (OCR, inventory, customer API)   | Entitlement configured, shown as **"Coming soon"** on pricing pages |

## Phase 2 findings that shaped the implementation

- `public.billing_plans.monthly_gbp/usd/inr` are `NOT NULL` and `createBillingCheckout` prices from
  them. New plans must not get placeholder prices: phase 2 adds a pricing-source flag and a
  database guard so the legacy checkout refuses STANDARD/PRO/BUSINESS until phase 3 publishes prices.
- `attach_company_subscription` auto-starts a trial on every new company (plan from
  `billing_settings.trial_plan_code`, currently `growth`, 14 days) and puts demo companies on
  `practice` as complimentary. Phase 2 moves trial length/enablement to the plan and adds
  eligibility rules; demo companies stay complimentary (`is_demo` may gate billing).
- `enforce_company_allowance` ranks plans with a hardcoded `practice > pro > growth` list and
  `private.platform_price_action` allows only `starter/growth/pro/practice`; both move to data.
- `plan_version_limits` + `winning_entitlements` remain the entitlement engine. New feature keys
  (quotes, recurring, payment reminders, bank rules, tracking, advanced reporting, OCR, purchase
  orders, advanced permissions, priority support, tax reports) are registered in
  `billing_features` and `src/lib/platform/feature-registry.ts`.
- Live subscriptions to migrate: one real company trialing on `growth` (→ `pro`, trial dates
  kept) and two demo companies complimentary on `practice` (unchanged).
- Feature allocation for keys the brief does not list: STANDARD copies `starter` v1, PRO copies
  `growth` v1, BUSINESS copies the current top-tier `pro` v1 (no `premium` version exists), then
  the brief's mapping overrides them.

## Phase 1 defaults applied

- A company's billing country starts from its organisation country with source `USER_SELECTED`;
  checkout (phase 5) replaces it with a verified billing address.
- No country is `billing_enabled` until pricing, a provider and approved tax rules exist.
- An individual account covers one company (`company_limit = 1`, decision D4 default).
