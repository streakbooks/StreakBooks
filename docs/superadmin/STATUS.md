# Superadmin status

Date: 2 November 2026. `origin/main` is `7813d20`, which includes `53cc3ec`. Later edits go through a pull request.

## Evidence

Executed on 2 November 2026 from `d:\Apps\LinkBooks`:

- `npx vitest run src/lib/platform src/lib/billing/plan-quote.test.ts --reporter=dot` — 6 files, 37 tests, passed. The extra cases cover the subscription last-update label and start-month grouping.
- `npx tsc --noEmit --pretty false` — exit 0 after the subscription start cohort.
- Browser check of `http://localhost:8080/platform?section=subscriptions`: the column reads "last update", and start months say they appear after the migration and are not revenue. The listed trial was not edited.
- Browser check of `http://localhost:8080/pricing/builder` after the migrations: Growth quoted at US$30 monthly and US$300 yearly. No card was charged. An add-on quantity was not selected in that pass.
- Browser check of `http://localhost:8080/platform?section=overview`: the revenue card says there is no eligible active subscription with a stored price, and the stored movement check says there is no recognised MRR and no open stored movement. Both are empty results, not a zero balance. Match and mismatch were not exercised. A second approver was not used.
- Browser check of dashboard, invoice list, invoice INV-V2083 and the new-invoice form on Demo Company. The new invoice was not saved.
- `npx supabase backups list --project-ref ipxflpzfcqwtenodbxwc` returned point-in-time restore disabled and no backup rows.
- `npx eslint` on `src/lib/platform`, `PlatformOverview.tsx`, `PlatformApprovals.tsx` and `platform.index.tsx` — exit 0 after Prettier.

Production build, browser sign-in, RLS SQL suites and the live database were not run.

## Not verified

- Migrations `20261102120000` through `20261102160000` were applied to Supabase project `ipxflpzfcqwtenodbxwc` on 2 November 2026 and recorded in `supabase_migrations.schema_migrations`. A full `supabase db push` was not used.
- No Stripe or Razorpay test key was used. No charge, refund, price or webhook was sent.
- `/platform` was opened with an existing platform session. Overview, businesses, subscriptions, features and integrations loaded. Approvals was not in the navigation. Billing was not opened. A second approver was not used.
- p95 latency was not measured.
- Postgres RLS suites in `tests/integration/platform-*.sql` were not re-run.
- The `md5` audit chain was not executed. It detects a break in new rows. A database superuser can still replace the trigger. It is not WORM storage.
- `supabase/migrations/20261102130000_rollout_enforcement.sql` is applied. Percentage, allowlist, internal, trial, region and scheduled rollouts can gate plan and catalogue defaults.
- `supabase/migrations/20261102140000_mrr_movements.sql` and `20261102150000_mrr_reconciliation.sql` are applied.
- `supabase/migrations/20261102160000_subscription_start_cohorts.sql` is applied. Subscriptions that already existed stay without a start month.
- Tax basis points are an operator setting. They are not a filing position.

## Capability labels

| Capability | Label | Path |
| --- | --- | --- |
| Entitlement order | IMPLEMENTED | `src/lib/platform/entitlements.ts`, `public.winning_entitlements` |
| Feature catalogue | IMPLEMENTED | `src/lib/platform/feature-registry.ts`, `billing_features` seed |
| Price quote and margin gate | IMPLEMENTED | `src/lib/platform/price-book.ts`, `src/lib/billing/margin.ts` |
| Approvals inbox | IMPLEMENTED | `src/components/platform/PlatformApprovals.tsx` |
| Revenue empty vs forbidden | IMPLEMENTED | `PlatformOverview.tsx`, `revenueState` |
| Provider price sync | BLOCKED | Test-mode secret key and a test customer |
| Customer plan builder page | IMPLEMENTED as a quote only | `src/routes/pricing_.builder.tsx`. It does not charge or grant a feature. |
| Usage overage | IMPLEMENTED as a calculation only | `usageOverage` in `src/lib/platform/price-book.ts`. No invoice. |
| Historical MRR movements | IMPLEMENTED | `supabase/migrations/20261102140000_mrr_movements.sql` |
| MRR reconciliation | IMPLEMENTED | `reconcileMrr`, `platform_reconcile_mrr`, overview “Stored movement check” |
| Subscription start months | IMPLEMENTED | `subscriptionStartCohorts`, `platform_subscription_cohorts`. Not revenue. |
| Batch C businesses, users, roles | PARTIAL | Existing `/platform` sections. Approvals is visible after the migration. Second approver not used. |
| Batch D integrations and recovery | PARTIAL | Existing screens. Backup list empty. |
| Batches E–H | MISSING | No new surfaces. |
| Status page, SMS, e-signature, BI | NOT APPLICABLE until a vendor is connected | `docs/decisions/002-commodity-operations-tools.md` |
