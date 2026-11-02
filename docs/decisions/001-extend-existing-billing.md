# 001 — Extend the existing billing platform

Date: 2 November 2026.

## Context

LinkBooks already has `billing_plans`, `plan_versions`, `plan_prices`, `billing_features`, `plan_version_limits`, `billing_addons`, `company_subscriptions`, `get_entitlements`, and the `/platform` control plane. A second catalogue would split enforcement.

## Options

1. Build a new plan, price and entitlement schema beside the current one.
2. Extend the current tables and replace `get_entitlements` so existing callers keep the same JSON keys.

## Decision

Option 2. Feature overrides, the per-feature price book, rollouts and approvals are new tables. `get_entitlements` still returns `access`, `planCode`, `versionId`, `limits`, `features` and `usage`, and adds `decisions`.

The TypeScript resolver in `src/lib/platform/entitlements.ts` is the specification and the unit-tested copy. `public.winning_entitlements` is the database enforcement copy. Postgres cannot import the TypeScript module. The rank comment in `supabase/migrations/20261102120000_entitlement_price_book.sql` is checked by a unit test.

`organisation_features` remains the settings-centre toggle layer. It is not a second commercial catalogue.

## Reason

Existing invoice, bill, seat and storage triggers already call `get_entitlements` and `assert_billing_allowance`. Replacing those call sites would risk the ledger write path.

## How to reverse

Reapply `get_entitlements` from `supabase/migrations/20261030140000_billing_platform.sql` and the platform overview, context and permission functions from `supabase/migrations/20261030144257_superadmin_control_plane.sql`. Drop the audit hash trigger if the hash columns are unused. Leave the new tables in place so audit and override history is not destroyed. Do not drop columns that store customer or billing data.
