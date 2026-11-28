# Subscription, trial, promotion & entitlement administration

## Root cause — trial after paid purchase

Signup creates a **no-card** trial (`company_subscriptions.provider = 'none'`, `status = 'trialing'`).

Until this change, paid checkout forwarded remaining `trial_ends_at` into:

- Stripe `subscription_data[trial_end]`
- Razorpay `start_at`

Providers therefore returned `trialing`, webhooks stored `trialing`, and Settings showed **Trial** after a normal purchase. This was intentional deferral of the first charge, not a status mapping bug.

**Fix:** `trialEndUnixForPaidCheckout` omits trial params when converting from `provider = 'none'`. No-card trials remain until the customer pays; after paid checkout the provider subscription activates without a leftover trial window. Explicit `deferFirstCharge: true` remains for admin/policy paths.

## Admin surfaces (reuse, do not duplicate)

| Need                                                   | Location                                         |
| ------------------------------------------------------ | ------------------------------------------------ |
| Customer subscription admin (grants, trial, overrides) | `/platform/billing` → SubscriptionAccessAdmin    |
| Plans / versions / country prices                      | `/platform/billing` (existing)                   |
| Promotions / coupons                                   | `/platform/billing` → CouponsAdmin               |
| Feature catalogue / rollouts                           | `/platform` → Features                           |
| Subscription list                                      | `/platform` → Subscriptions                      |
| Entitlement precedence                                 | `winning_entitlements` + `entitlement_overrides` |

## Complimentary grants

Table: `billing.subscription_access_grants`.

- Does **not** create Stripe/Razorpay payments.
- Refuses when a paid provider sub is active unless `acknowledge_paid_overlap` is set (still does **not** cancel the provider mandate).
- Lifecycle job `billing.expire_subscription_access_grants` runs inside `billing.run_lifecycle_sweep`.

## Security

All RPCs use `private.require_platform('billing.manage'|'subscriptions.view')` (platform MFA / AAL2). Organisation `billing.manage` cannot grant self entitlements through these APIs.

## Migrations

- `20261128140000_billing_subscription_access_admin.sql`
