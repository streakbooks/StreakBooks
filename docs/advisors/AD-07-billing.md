# AD-07 — Advisors billing and subscriptions

## Principle

Reuse the existing LinkBooks billing engine (`billing_plans`, `billing_checkouts`, provider webhooks, `company_subscriptions`, invoices). Do **not** invent a second payment processor or treat proposal/agreement acceptance as payment success.

## Flow

1. Engagement reaches `accepted` / `onboarding` / `active` (AD-06).
2. Admin links the Advisors client to a **dedicated billing company** (avoids overwriting a SaaS org subscription).
3. Admin prepares an `advisors_subscriptions` bridge row (status `pending_checkout`) — still no charge.
4. Admin opens checkout through `createCheckoutFor` for the mapped Advisors `billing_plans` code.
5. Provider webhooks remain authoritative; admin can sync bridge status from `company_subscriptions`.
6. Manual active is an ops marker only (offline/invoice handled outside card checkout).

## SKUs

Non-public legacy-priced plans:

- `advisors_essential_books`, `advisors_growth_books`, `advisors_complete_books`
- `advisors_quick_guidance`, `advisors_monthly_coaching`, `advisors_business_coaching`

Mapped from Advisors marketing plan codes via `advisors_billing_sku_map`.

## Admin

`/advisors-admin/billing`

## Persistence

Migration `20261106180000_advisors_billing_bridge.sql`.
