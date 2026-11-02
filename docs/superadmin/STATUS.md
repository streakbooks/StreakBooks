# Superadmin status

Date: 2 November 2026. Branch: `feat/superadmin-control-centre`.

## Evidence

Executed on 2 November 2026 from `d:\Apps\LinkBooks`:

- `npx vitest run src/lib/platform src/lib/billing/plan-quote.test.ts --reporter=dot` — 6 files, 37 tests, passed. The extra cases cover the subscription last-update label and start-month grouping.
- `npx tsc --noEmit --pretty false` — exit 0 after the subscription start cohort.
- Browser check of `http://localhost:8080/platform?section=subscriptions`: the column reads "last update", and start months say they appear after the migration and are not revenue. The listed trial was not edited.
- Browser check of `http://localhost:8080/pricing/builder`: published plans loaded; Growth quoted at US$30 monthly and US$300 yearly with no charge; a selected add-on stayed unpriced because the entitlement migration is not applied.
- Browser check of `http://localhost:8080/platform?section=overview` while a platform session was already signed in: the stored-movement check reported that reconciliation appears after the movement migration is applied. The revenue card stayed unseparated because the live overview function does not yet return `revenueState`. Match and mismatch states were not exercised. A second approver was not used.
- `npx eslint` on `src/lib/platform`, `PlatformOverview.tsx`, `PlatformApprovals.tsx` and `platform.index.tsx` — exit 0 after Prettier.

Production build, browser sign-in, RLS SQL suites and the live database were not run.

## Not verified

- Migration `supabase/migrations/20261102120000_entitlement_price_book.sql` was not applied to Supabase project `ipxflpzfcqwtenodbxwc`. That project is the connected application database. This programme forbids a production apply and a merge.
- No Stripe or Razorpay test key was used. No charge, refund, price or webhook was sent.
- `/platform` was opened with an existing platform session. Overview, businesses, subscriptions, features and integrations loaded. Approvals was not in the navigation. Billing was not opened. A second approver was not used.
- p95 latency was not measured.
- Postgres RLS suites in `tests/integration/platform-*.sql` were not re-run.
- The `md5` audit chain was not executed. It detects a break in new rows. A database superuser can still replace the trigger. It is not WORM storage.
- `supabase/migrations/20261102130000_rollout_enforcement.sql` is not applied. Percentage, allowlist, internal, trial, region and scheduled rollouts gate plan and catalogue defaults only after that migration.
- `supabase/migrations/20261102140000_mrr_movements.sql` and `20261102150000_mrr_reconciliation.sql` are not applied. Stored movements and the overview check stay unavailable until then.
- `supabase/migrations/20261102160000_subscription_start_cohorts.sql` is not applied. Existing subscriptions stay without a start month.
- Tax basis points are an operator setting. They are not a filing position.

## Capability labels

| Capability | Label | Path |
| --- | --- | --- |
| Entitlement order | IMPLEMENTED | `src/lib/platform/entitlements.ts`, `public.winning_entitlements` |
| Feature catalogue | IMPLEMENTED | `src/lib/platform/feature-registry.ts`, `billing_features` seed |
| Price quote and margin gate | IMPLEMENTED | `src/lib/platform/price-book.ts`, `src/lib/billing/margin.ts` |
| Approvals inbox | IMPLEMENTED, blocked on migration apply | `src/components/platform/PlatformApprovals.tsx` |
| Revenue empty vs forbidden | IMPLEMENTED in UI; SQL field blocked on apply | `PlatformOverview.tsx`, `revenueState` |
| Provider price sync | BLOCKED | Test-mode secret key and a test customer |
| Customer plan builder page | IMPLEMENTED as a quote only | `src/routes/pricing_.builder.tsx`. It does not charge or grant a feature. |
| Usage overage | IMPLEMENTED as a calculation only | `usageOverage` in `src/lib/platform/price-book.ts`. No invoice. |
| Historical MRR movements | IMPLEMENTED, blocked on migration apply | `supabase/migrations/20261102140000_mrr_movements.sql` |
| MRR reconciliation | IMPLEMENTED, blocked on migration apply | `reconcileMrr`, `platform_reconcile_mrr`, overview “Stored movement check” |
| Subscription start months | IMPLEMENTED, blocked on migration apply | `subscriptionStartCohorts`, `platform_subscription_cohorts`. Not revenue. |
| Batches C–H new surfaces | MISSING | Existing `/platform` sections remain |
| Status page, SMS, e-signature, BI | NOT APPLICABLE until a vendor is connected | `docs/decisions/002-commodity-operations-tools.md` |
