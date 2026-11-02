# Handoff

## P0 evidence

Typecheck exit 0. Lint 0 errors and 23 warnings. Vitest 163 files, 1279 tests, all passed. Production build exit 0. Playwright had no seeded platform_owner: `e2e/superadmin-journeys.spec.ts` 2 passed and 2 skipped. Migration history is BLOCKED: Docker is not installed, and the only other Supabase project is LeadOrbit. READY-TO-APPLY and not applied: `20261102170000`, `20261102180000`, `20261102180100`, `20261102190000`, `20261102200000`, `20261102210000`, `20261102220000`, `20261102230000`, `20261102240000`, `20261102250000`, `20261102260000`, `20261102270000`, `20261102280000`, `20261102290000`, `20261102300000`, `20261102310000`, `20261102320000`, and the start-month backfill in `docs/superadmin/start-month-backfill.md`.

- P0.1: typecheck exit 0, lint 0 errors and 23 warnings, 1279 unit tests passed, production build exit 0.
- P0.2: `sk_live_` and `rzp_live_` are refused unless `LINKBOOKS_ALLOW_LIVE_PAYMENT_KEYS=true`. 15 provider-key tests passed.
- P0.3 BLOCKED: Playwright Chromium installed; public quote tests passed 2, grant/revoke skipped. Need Docker Desktop or Podman on PATH to seed a local platform_owner.
- P0.4: definer audit written. `20261102180000` and `20261102180100` are READY-TO-APPLY and were not applied. Definer audit test passed.
- P0.5 BLOCKED: no Docker and no LinkBooks staging project. Do not use LeadOrbit. Create an empty staging project or install Docker Desktop or Podman.
- P0.6: pull request 65 merged at `9fc4429` after verify and voice-browser succeeded.
- Batch A: `attachQuote` tests passed, 4. A quote is not attached or granted without a Stripe test secret. No subscription row was written.
- Batch A: second-approver decision tests passed, 3. Live walkthrough BLOCKED until a second platform user with approvals.manage exists.
- Batch A: mid-cycle proration tests passed, 5. No provider call. BLOCKED until a test-mode secret is in `.env.local`.
- Batch B: usage overage draft tests passed, 3. Nothing was posted. BLOCKED until a test-mode secret is in `.env.local`.
- Batch B: missing fees and lifetime value stay unavailable, not zero. Tests passed, 3. Provider reconciliation BLOCKED until a test-mode secret and provider events exist.
- Batch C: break-glass tests passed, 4. `20261102190000` is READY-TO-APPLY and was not applied.
- Batch C: step-up allows only `aal2`. Tests passed, 2. The applied `platform_can` already requires `aal2`.
- Batch C: an empty admin IP allowlist stays closed. Tests passed, 2. No hosted change.
- Batch C: audit verification matches the applied md5 chain and rejects one edited row. Tests passed, 1. Rewriting every later row still verifies.
- Batch C: role tests match the November `platform_can` lists. Tests passed, 2. Finance cannot approve and support cannot bill. Custom permissions stay in the database.
- Batch D: integration health reports missing Stripe and Razorpay configuration and does not call a provider. Tests passed, 2.
- Batch D: API key rotation tests passed, 3. `20261102200000` stores a hash only and was not applied. The raw key is returned once by that function and is not written to the audit row.
- Batch D: webhook history tests passed, 3. `20261102210000` lists delivery outcomes only and was not applied. A missing store stays unrecorded.
- Batch D: backup visibility tests passed, 2. Point-in-time restore off and an empty list stay “no restore point”, not a confirmed backup.
- Batch D: data export stays on the existing `platform_export` function. The authorisation and audit test passed, 1. No second export path was added.
- Batch D: closure tests passed, 3. `20261102220000` archives after a second decision and was not applied. It does not delete ledger rows.
- Batches E–H: ledger integrity stays on `ledger_health_check` for company members. Tests passed, 2. Platform staff are not given ledger amounts.
- Batches E–H: AI governance tests passed, 3. `20261102230000` reads the existing cap and kill switch and was not applied. A missing unit price stays null. No provider call.
- Batches E–H: customer summary tests passed, 2. `20261102240000` returns identity and subscription only and was not applied. Ledger amounts are not included.
- Batches E–H: global search tests passed, 2. `20261102250000` searches businesses and users and was not applied. The query text is not stored in the audit row.
- Batches E–H: segment tests passed, 2. `20261102260000` was not applied. Contact tags are unchanged.
- Batches E–H: alert tests passed, 2. `20261102270000` was not applied. A missing observation does not fire.
- Batches E–H: job console tests passed, 2. `20261102280000` queues a job and was not applied. The job is not executed.
- Batches E–H: incident and release tests passed, 2. `20261102290000` was not applied. A release note does not deploy.
- Batches E–H: service desk tests passed, 2. `20261102300000` was not applied. Cases are separate from support grants.
- Batches E–H: partner tests passed, 2. `20261102310000` was not applied. A missing revenue share stays null and no plan is created.
- Batches E–H: config promotion tests passed, 2. `20261102320000` was not applied. Approval copies no settings.
- Hosted gate BLOCKED: `20261102170000` through `20261102320000`, and the start-month backfill, are READY-TO-APPLY. Nothing further was applied. Write `BACKUP CONFIRMED` in this file to release them.

## NEEDS FROM OWNER

- Write `BACKUP CONFIRMED` here before any hosted migration is applied.
- Put a test-mode `STRIPE_SECRET_KEY` or Razorpay test keys in `.env.local` before provider calls.
- Add a second platform user with `approvals.manage` for the kill-switch walkthrough.
- Install Docker Desktop or Podman on PATH, or create an empty LinkBooks staging Supabase project. Do not use LeadOrbit.

Date: 2 November 2026. `origin/main` is `9fc4429`. Further work goes through pull request 66. Do not push `main` directly.

## Process from here

Merge to `main` only through a pull request after the required CI checks pass and the full test suite is green. See `docs/decisions/006-main-and-migrations.md`.

Before applying a migration to project `ipxflpzfcqwtenodbxwc`: confirm a restore point, keep the change additive and reversible, write the rollback SQL, apply it, and verify it. Do not apply a destructive change. `supabase backups list` on 2 November 2026 returned point-in-time restore disabled and an empty backup list. No restore point was confirmed for the five migrations that are already applied.

## Completed

- Phase 0 audit: `docs/superadmin/audit.md`.
- Phase 1 benchmark: `docs/superadmin/benchmark.md`.
- Decisions `docs/decisions/001-extend-existing-billing.md` through `006-main-and-migrations.md`.
- Entitlement resolver, price book, approvals, MRR movements, reconciliation, and subscription start months. The five migrations `20261102120000` through `20261102160000` are applied and recorded. Rollback notes: `docs/superadmin/rollback-20261102.md`.
- Customer quote route `/pricing/builder`. It does not charge a card or write an entitlement.
- Local signed-in checks on 2 November 2026, after the migrations: dashboard on Demo Company; invoice list and invoice INV-V2083; new-invoice form opened and not saved; Growth quote US$30 monthly and US$300 yearly; overview revenue card empty rather than unseparated; stored movement check empty rather than zero; subscriptions column "last update"; start-month panel; feature management; approvals form visible in the navigation. No entitlement was saved. Billing and payments was not opened.

## Batch status

| Batch | Label | Evidence |
| --- | --- | --- |
| A Entitlements, price book, custom plans | PARTIAL | `src/lib/platform/entitlements.ts`, `price-book.ts`, `src/routes/pricing_.builder.tsx`, `PlatformApprovals.tsx`. Vitest: 6 files, 37 tests passed. Attaching a quote to a subscription is blocked until a test-mode provider exists. |
| B Subscriptions, usage, revenue, overview | PARTIAL | `revenue-metrics.ts`, `subscription-cohorts.ts`, migrations `20261102140000`–`20261102160000`. Overview and start months checked in the browser. Usage invoices, provider sync, lifetime value and fees are not built. |
| C Businesses, users, roles, security | PARTIAL | Existing `/platform` sections for businesses, users, firms, roles, audit. Approvals now shows for this session. A second approver and break-glass were not used. |
| D Integrations, API, monitoring, support | PARTIAL | Existing screens load. Connections were not verified. Backup list is empty and point-in-time restore is off. |
| E Incident, maintenance, release, health | MISSING | No new incident, maintenance, release or health-score surface. |
| F Accounting integrity, AI governance, compliance, jobs | MISSING | No new desk beyond the existing accounting screens. |
| G Commercial and partner operations | MISSING | No partner desk. |
| H Operations analytics, alerting, promotion, sandbox | MISSING | No alerting or sandbox promotion desk. |

## This follow-up

- CI for `53cc3ec`: GitHub Actions run "LinkBooks verification" completed success. Checks `verify` and `voice-browser` completed success. `main` reports `protected=false`, and the branch-protection endpoint returned 404. The push was a direct fast-forward because the branch is not protected.
- Pull request 62 is closed and GitHub marks it merged. A comment points at `3964c4b` and `53cc3ec`.
- Migration history: `docs/superadmin/migration-history.md`. Remote data was not changed. Docker is not available here, so `supabase db reset` and a schema diff were not run.
- `feature_dependencies` has row-level security, a SELECT grant to `authenticated`, and no policy. `supabase/migrations/20261102170000_feature_dependency_read.sql` adds that policy and is not applied.
- Start-month backfill is a proposal only: `docs/superadmin/start-month-backfill.md`. It was not applied.
- Playwright journeys: `e2e/superadmin-journeys.spec.ts`. Grant and revoke stay skipped unless `E2E_PLATFORM_STORAGE_STATE` and `E2E_PLATFORM_TEST_BUSINESS_ID` are set. The public quote tests did not run: the Playwright Chromium binary is not installed. The same quote was checked in the Cursor browser.
- Deployed app `https://linkbooks-navy.vercel.app`: the sign-in page renders. `/pricing`, `/pricing/builder` and `/platform` return 404, and the deployed bundle does not contain the plan builder. A Vercel comment on pull request 62 says the GitHub account is not a member of the paxaris team, so `53cc3ec` was not deployed. No sign-in was attempted on that site.
- Local process environment has no `STRIPE_SECRET_KEY`, `RAZORPAY_KEY_ID` or `RAZORPAY_KEY_SECRET`. `.env` is absent. `.env.local` has no Stripe or Razorpay lines. The quote page says no test-mode payment provider is connected. `assertStripeTestKey` still accepts a `sk_live_` prefix; no such key is configured in this checkout.

## Outstanding

- Re-run `tests/integration/platform-security.sql` and a grant, revoke, percentage rollout, kill-switch, MRR-capture and reconciliation case on the hosted project.
- Usage overage invoices, and attaching a quoted add-on. Do not grant a feature for free.
- Lifetime value and payment fees. Do not invent them.
- Apply `20261102170000` only after a restore point exists.
- Prove schema equivalence with a local reset once Docker is available. Do not copy the 62 remote-only versions into `supabase/migrations/`, and do not mark them reverted.
- Install Playwright Chromium and run `e2e/superadmin-journeys.spec.ts` against a disposable business.

## BLOCKED

- Payment provider sync. Need a test-mode secret and a test customer. Do not put the key in the repo, the UI or logs.
- `supabase db push`. Remote history has versions with no local file.
- Email or mobile approval delivery.
- A single platform owner cannot self-approve a kill switch.
- Hosted deploy of `53cc3ec` until the Vercel team membership is fixed.
- Any further hosted migration until a restore point exists.

## Next action

Review `docs/superadmin/start-month-backfill.md` before any start-month update. Continue batches E–H only with a working RPC, an authorisation check and a test. Do not add placeholder buttons.
