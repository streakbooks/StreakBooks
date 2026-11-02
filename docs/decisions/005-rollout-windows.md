# 005 — Rollout windows gate plan defaults

Date: 2 November 2026.

## Context

Percentage, allowlist, region, trial and scheduled rollouts were specified in TypeScript and only a kill switch was enforced in `winning_entitlements`.

## Options

1. Let every rollout deny a feature even when a person has an explicit grant.
2. Let an active rollout deny only a plan or catalogue-default allow. Grants, add-ons, trials, revokes, suspension and kill switches keep their existing rank. An ended rollout stops gating.

## Decision

Option 2. The internal-group mode uses the rollout allowlist. `is_demo` is not read, because a demo flag must not change posting access.

## Reason

A rollout is a release control. A grant is a customer entitlement. Ending an emergency window should restore the plan rather than leave the feature off.

## How to reverse

Reapply `public.winning_entitlements` from `supabase/migrations/20261102120000_entitlement_price_book.sql` and drop `public.rollout_bucket` and `public.rollout_decision`.
