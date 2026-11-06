# Billing platform — admin analytics

Phase 10. Migration `20261105231127_billing_analytics.sql`; Superadmin → Platform billing →
Billing analytics (`BillingAnalyticsAdmin.tsx`); REST `GET /api/v1/admin/billing/analytics`
(staff token with `billing.view`, or an API key with `billing:analytics`).

## Rules

- Read-only. Nothing is charged, invoiced or changed.
- Every amount is reported **per currency in minor units**. No currency conversion is applied, so
  totals across currencies are never added together.
- Subscription and MRR figures exclude demo organisations, using the same rule as the existing MRR
  capture (`platform_capture_mrr_movements`): status `active`, a recurring amount, and a period that
  has not ended. Yearly amounts are divided by 12 (rounded down); ARR is MRR × 12.
- Ranges are limited to one year and must move forwards. Presets: this month, 30 days, 90 days,
  12 months.

## Figures

| Section       | Source                                                                   |
| ------------- | ------------------------------------------------------------------------ |
| Subscriptions | `company_subscriptions` by status, paid plan and country                 |
| MRR, ARR      | Active subscriptions now                                                 |
| MRR movements | Stored `mrr_movements` in the range (new, expansion, contraction, churn) |
| Revenue       | Issued invoices and credit notes in the range; succeeded refunds         |
| Lifecycle     | Subscription history events and cancellation requests                    |
| Promo codes   | Redeemed coupon reservations                                             |
| Partners      | Active referrals; commission ledger entries in the range                 |
| Operations    | Webhook volume, backlog and dead events; payments waiting for an invoice |

Net revenue shown in the dashboard is invoice net (after discounts, excluding tax) less credit-note
net. Movements appear only after MRR has been captured; the dashboard shows when that last
happened.
