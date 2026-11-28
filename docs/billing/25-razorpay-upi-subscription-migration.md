# Razorpay UPI AutoPay — subscription migration

**Branch:** `feature/razorpay-upi-subscription-migration`  
**Status:** Sandbox / test-mode only until explicitly approved for live keys.  
**Provider constraint (official):** Razorpay rejects `PATCH /subscriptions` when payment mode is UPI or e-mandate (`subscriptions cannot be updated when payment mode is UPI`). In-place mid-cycle upgrade is **impossible** for those mandates. Card in-place upgrades stay on the existing path.

## Architecture

```
UPI customer selects higher plan
        │
        ▼
 Preview (server) — estimate due today + recurring; appliesMode = migration
        │
        ▼
 startMigration — lock row, create billing_checkouts + new Razorpay sub
   notes: migration_id, company_id, checkout_id, pay_method, replace_sub_id
   optional addons[] = one-time prorated difference (configurable)
        │
        ▼  (old sub still active; entitlements unchanged)
 Customer authorises new UPI AutoPay mandate (hosted checkout)
        │
        ▼
 Webhook (signed) → billing_apply_provider_event(checkout_completed)
   upserts company_subscriptions → new plan + new provider_subscription_id
        │
        ▼
 advanceMigration — cancel OLD sub immediately (cancel_at_cycle_end=false)
   retry via cron if cancel fails → REQUIRES_MANUAL_REVIEW
        │
        ▼
 COMPLETED (audit trail kept; old sub id retained on migration row)
```

Stripe and Razorpay **card** paths are unchanged.

## State machine (`billing.subscription_migrations.status`)

| State                                   | Meaning                                                   |
| --------------------------------------- | --------------------------------------------------------- |
| `initiated`                             | Row created; provider work starting                       |
| `new_subscription_created`              | New Razorpay `sub_*` + open checkout exist                |
| `awaiting_customer_authorization`       | Customer must complete hosted mandate                     |
| `awaiting_payment`                      | Auth seen; waiting for paid/active confirmation           |
| `new_subscription_confirmed`            | Webhook applied new sub to company                        |
| `old_subscription_cancellation_pending` | Cancel API in flight / scheduled retry                    |
| `old_subscription_cancellation_failed`  | Cancel failed; recovery will retry                        |
| `entitlement_update_pending`            | Rare; reserved if apply lagged                            |
| `completed`                             | New active; old cancel confirmed or terminal cancelled    |
| `failed`                                | Abandoned / auth failed / timed out (no silent dual bill) |
| `requires_manual_review`                | Auto-recovery exhausted                                   |

Illegal transitions are rejected by RPC.

## Double-billing prevention

1. Never cancel the old sub before the new sub is **webhook-confirmed**.
2. After confirmation, cancel the old sub with **`cancel_at_cycle_end: false`** (immediate) so the next UPI debit cannot land on the old mandate.
3. One open migration per company (`UNIQUE` where status not terminal).
4. Idempotent cancel retries keyed by migration id + old sub id.
5. `subscription_state` for the old id becomes “unknown subscription” after the company row points at the new id — old renewals do not re-apply entitlements.

## Proration policy

- Server-side `estimateProratedDifferenceMinor` only — labelled **estimate**.
- If `RAZORPAY_UPI_MIGRATION_UPFRONT=0`, skip addon; customer still migrates (recurring starts per Razorpay `start_at`).
- Default: when estimate &gt; 0, attach a one-time Razorpay subscription **addon** item (not a recurring line).
- Never trust browser amounts.

## Recovery

`/api/billing/webhook-retry` (existing cron) also calls `recoverDueUpiMigrations`:

- Stuck `awaiting_*` past TTL → mark `failed` if new sub never authenticated; leave entitlements on old plan.
- `old_subscription_cancellation_*` → re-fetch old sub; cancel again or mark completed if already cancelled.
- Never create a second new subscription for the same migration.
