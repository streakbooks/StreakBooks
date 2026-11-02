# Superadmin status

Date: 2 November 2026. Branch: `feat/superadmin-control-centre`.

## Evidence

Executed on 2 November 2026 from `d:\Apps\LinkBooks`:

- `npx vitest run src/lib/platform --reporter=dot` — 4 files, 28 tests, passed.
- `npx tsc --noEmit --pretty false` — exit 0.
- `npx eslint` on `src/lib/platform`, `PlatformOverview.tsx`, `PlatformApprovals.tsx` and `platform.index.tsx` — exit 0 after Prettier.

Production build, browser sign-in, RLS SQL suites and the live database were not run.

## Not verified

- Migration `supabase/migrations/20261102120000_entitlement_price_book.sql` was not applied to Supabase project `ipxflpzfcqwtenodbxwc`. That project is the connected application database. This programme forbids a production apply and a merge.
- No Stripe or Razorpay test key was used. No charge, refund, price or webhook was sent.
- `/platform` was not signed in. MFA platform acceptance is outstanding.
- p95 latency was not measured.
- Postgres RLS suites in `tests/integration/platform-*.sql` were not re-run.
- The `md5` audit chain was not executed. It detects a break in new rows. A database superuser can still replace the trigger. It is not WORM storage.
- Percentage, allowlist, region, trial and scheduled rollouts are enforced by `rolloutIncludes` in TypeScript. The database enforces `feature_rollouts.mode = 'killed'` only.
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
| Customer plan builder page | MISSING | Quote function exists; no public route |
| Batches C–H new surfaces | MISSING | Existing `/platform` sections remain |
| Status page, SMS, e-signature, BI | NOT APPLICABLE until a vendor is connected | `docs/decisions/002-commodity-operations-tools.md` |
