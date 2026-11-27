# Plan change policy (industry standard)

StreakBooks follows the same rules as mainstream subscription products (Xero, Netflix, JioHotstar).

## Rules

| Event | Charge on Stripe now? | When entitlement changes |
| ----- | --------------------- | ------------------------ |
| First subscribe | Yes — hosted Checkout | After payment (or during trial) |
| Free trial (~30 days) | No until trial ends | Immediately on trial plan |
| **Upgrade** (higher price) | **Yes — prorated remainder of period** | **After payment succeeds** |
| **Downgrade** (lower price) | **No** | **At period end / renewal** |
| **Monthly ↔ annual** (same or different plan) | Prorated if effective monthly rises; else schedule | Same rules as upgrade/downgrade |
| Cancel | No | At period end |
| Renewal | Yes — full plan price | Continues |

Users can reverse a **scheduled** downgrade/interval change before the effective date (“Keep current plan”).

## Implementation notes

- Upgrade uses Stripe `proration_behavior=always_invoice` + `payment_behavior=pending_if_incomplete`, then opens the **hosted invoice** pay page when amount due &gt; 0.
- If the card on file pays successfully with no further action, StreakBooks syncs the new plan immediately (Netflix-style silent charge) and shows a success toast.
- Downgrade records `scheduled_plan_code` / `scheduled_at` **before** calling Stripe, so a sync cannot unlock the cheaper plan early. Stripe uses `proration_behavior=none`.
- Source of truth for UI copy: `src/lib/billing/domain/billing-policy.ts`.

## What is *not* a free upgrade

The free trial is only for the initial trial window. Mid-cycle upgrades are never free because of the trial.
