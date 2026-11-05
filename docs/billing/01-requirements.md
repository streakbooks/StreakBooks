# Billing platform — requirements and status

Source: the master subscription & billing brief (5 November 2026) and
[00-architecture-and-implementation-plan.md](00-architecture-and-implementation-plan.md).
This file tracks what is delivered, what is configurable and what is still undecided.
Nothing here is live in production until the hosted migration gate in
[04-database-design.md](04-database-design.md#hosted-apply-procedure) is run.

## Delivery status

| Phase | Scope | Status |
|---|---|---|
| 1 | ISO reference data, billing accounts (B2B/B2C), billing permissions, tamper-evident billing audit | **Implemented and tested locally**, not applied to hosted |
| 2 | STANDARD/PRO/BUSINESS plans, per-plan trials, entitlement mapping | Planned |
| 3 | Country pricing engine (BASE/FIXED/FX_CONVERTED/CUSTOM), FX, publication | Planned |
| 4 | Subscription lifecycle, jobs, legal documents, cancellation | Planned |
| 5 | Razorpay/Stripe adapters, router, durable webhooks, checkout, renewals, upgrades | Planned |
| 6 | Invoices, payments, refunds, credit notes, tax | Planned |
| 7 | Coupons | Planned |
| 8 | CA partners, referrals, commission ledger (payouts disabled) | Planned |
| 9 | REST `/api/v1` + OpenAPI | Planned |
| 10 | Admin analytics, E2E, runbook | Planned |

## Phase 1 requirements and how they are met

| Requirement | Implementation |
|---|---|
| Individuals and organisations can hold billing | `billing.billing_accounts.account_type` = `INDIVIDUAL` or `ORGANIZATION` |
| Each billing account owns its own subscription | Accounts are the future subscription owner; companies link through `billing.billing_account_companies` (one account per company) |
| A user can belong to many organisations | Unchanged company membership; each company resolves to its own account |
| Individual user limit defaults to one | `user_limit = 1` on INDIVIDUAL accounts, enforced on `company_members` (accountant access excluded) |
| Owners and billing admins manage billing | `billing.manage`, `billing.view`, `billing.payment_methods` (owner and admin by default) |
| Accountants have explicitly granted read access | No default; grant `billing.view` per person through the existing access screen |
| Employees cannot see payment information | Staff, bookkeeper, read-only and accountant roles have no billing permission by default |
| Never trust a client `billing_account_id` | Every database function re-derives access from company permissions or account ownership |
| Correct ISO currency metadata | `billing.currencies` (ISO 4217 List One, published 2026-09-17) and `billing.countries` (ISO 3166-1 with CLDR 49 current currency) |
| Integer minor units, 0/2/3-decimal currencies | `src/lib/billing/domain/money.ts`: bigint arithmetic, ISO exponents, explicit rounding, exact decimal FX |
| Financial mutations auditable | `public.platform_billing_audit` (append-only) now has a SHA-256 hash chain and a verifier |

## Configurable, intentionally unset (do not invent)

Yearly prices and annual discount, extra-seat pricing, CA commission rate/duration/minimum
payout, payment retry schedule, grace period, tax rules, legal cancellation wording, FX provider
and rounding rules. See the decision register (D1–D22) in the plan.

## Phase 1 defaults applied

- A company's billing country starts from its organisation country with source `USER_SELECTED`;
  checkout (phase 5) replaces it with a verified billing address.
- No country is `billing_enabled` until pricing, a provider and approved tax rules exist.
- An individual account covers one company (`company_limit = 1`, decision D4 default).
