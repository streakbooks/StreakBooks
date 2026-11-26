# NEEDS FROM OWNER

- Configure a dedicated non-production authenticated browser-test account through `E2E_EMAIL` and `E2E_PASSWORD` when available; do not commit or paste credentials.
- Provide matching backup evidence for Supabase project `qugoaaizclvkzesptovm` before any hosted migration is run. Existing backup evidence in historical notes names a different project.
- Review deployment-provider account constraints before enabling deploy checks: the PR currently reports Vercel Hobby/private-organization restrictions and a failed Cloudflare Workers build check. No plan change or production deploy was made.

# Settings overhaul — profile preference completion, 26 November 2026

Profile appearance preferences now save theme mode and named palette per authenticated user and organisation through the existing `user_ui_preferences` row and RLS policy. Custom palette colours remain device-local. Added server-function tests for membership checks, user scoping, upsert ownership and invalid palette rejection. No schema change or hosted Supabase action was needed.

The working diff based on feature commit `37bb5f338a63277d7460cf3ef1ce8e6dab4b86d9` passes: 638 test files / 4,359 tests, full ESLint, typecheck and production build; UI/module/navigation checks pass. GitHub run [#45839137235](https://github.com/streakbooks/StreakBooks/actions/runs/45839137235) passed six isolated PostgreSQL suites and browser fixtures, but `validate` failed `check:lookups` because a fixed theme enumeration needed the documented annotation. That fix now passes locally and is pending the next PR run. PR [#92](https://github.com/streakbooks/StreakBooks/pull/92) remains open/draft. Next: push the lookup fix and server-function tests, then proceed to Batch 3 Accounting and Tax; authenticated browser review still needs a dedicated non-production test account. No hosted migration, deployment or production verification occurred.

# Settings overhaul — Accounting display preference, 26 November 2026

Implemented `accounting.account_code_padding` end to end for the Chart of Accounts display: the existing versioned `organisation_config` save validates 0–8, requires `company.settings.edit`, and records before/after configuration audit; a membership-checked reader applies zero padding only to numeric chart labels. Stored account IDs/codes, CSV data and journals are unchanged. No migration was needed. Local validation of this diff: 638 test files / 4,360 tests, TypeScript, full ESLint and production build pass; focused Accounting/registry tests (12), UI/navigation/lookup/migration checks pass. The most recent GitHub run [#45840352414](https://github.com/streakbooks/StreakBooks/actions/runs/45840352414) passes the previous profile-settings head; a new run is required for this Accounting diff. Next: continue Batch 3 with tax/accounting effects proven by consumers and tests. PR #92 stays open/draft; no hosted migration, deploy, authenticated staging or production verification.

# Settings overhaul — Tax master coverage, 26 November 2026

Registered the existing Tax rate/code master as a discrete capability using the real module route `/tax`, with server validation, `tax.settings` permission, tenant RLS, transactional before/after history, effective-rate selection and tax consumers. Updated the review guide to distinguish implemented rate/code lifecycle from still-partial jurisdiction/regime/filing configuration. Capability and Tax date/math tests pass (3 files / 27 tests), changed-file lint and diff checks pass. The existing tax-master isolated PostgreSQL suites passed on Actions run [#45840352414](https://github.com/streakbooks/StreakBooks/actions/runs/45840352414); run [#45842500901](https://github.com/streakbooks/StreakBooks/actions/runs/45842500901) for the Accounting code is in progress, and this registry/documentation diff requires a fresh run. No schema changed. Continue Batch 3 with evidence-backed settings; the Tax module remains partial overall.

# Settings overhaul — manual-journal audit safeguard, 26 November 2026

The existing manual-journal memo requirement was already enforced by `postManualJournal`; it lacked settings-change audit evidence. Added migration `20261126180000_workflow_settings_audit.sql` with same-transaction per-field before/after rows, no-op suppression and redaction for free-text defaults, plus a drop-only rollback. Added function behavior tests and `tests/integration/workflow-settings-audit.sql`; `npm.cmd run test:workflows:postgres` passed using its network-disabled temporary PostgreSQL 17 container. It verifies RLS, tenant isolation, null defaults, audit redaction, permission restrictions and rollback on audit failure. Local checks passed: 639 test files / 4,362 tests, TypeScript, full ESLint, production build, modules/UI/navigation/lookups and migration contracts. The deterministic Playwright UI fixture suite passed all 97 tests after fixing its TanStack server-only import alias. Two unrelated report tests timed out only during a concurrent run and passed on the serial rerun. Authenticated Settings review still requires a non-production test account and Supabase environment. Migration status: **READY-TO-APPLY**. Do not apply to hosted project `qugoaaizclvkzesptovm` until matching confirmed backup evidence is added here; no hosted DB was touched. PR #92 remains open/draft; this feature head still needs a fresh Actions run. Continue Batch 3; do not merge the overall Settings PR while remaining batches or authenticated browser verification are incomplete.

# Settings overhaul — latest continuation, 26 November 2026

Published commits `b2c1ce871a3f56f0d34b118f9fdea286f1c2d0b6` (corrected the atomic
identity/tax SQL regression to test February 30) and
`a1ff0cbd08abf71e9cfa32fdc8e06fe317330097` (added Settings / Personal preferences /
Profile breadcrumbs and refreshed progress notes) to `feat/settings-module-overhaul`.
PR [#92](https://github.com/streakbooks/StreakBooks/pull/92) remains open and draft.

On Actions run [#45807731340](https://github.com/streakbooks/StreakBooks/actions/runs/45807731340),
all five isolated PostgreSQL suites and browser fixtures passed, including the identity/tax
atomic-save regression. The current head run
[#45808722118](https://github.com/streakbooks/StreakBooks/actions/runs/45808722118) has all
five PostgreSQL jobs passed; `validate` and browser fixtures were still running at last check.
Vercel status checks fail because its Hobby plan disallows this private organization repo;
Cloudflare Workers also reports an external build failure. Neither is an org billing job-start
failure. The Supabase Preview check is skipped because the PR is not linked to a Supabase branch.

Local changed-file ESLint and the two focused Settings tests pass (8 tests). A new full
TypeScript command did not return and was interrupted; the preceding full typecheck/build/lint
and wider test suite passed before the Profile breadcrumb-only edit. Local Docker is absent, so
the SQL workflow is CI-verified only. The Vite server started on `http://localhost:8080`, but
the workstation socket is inaccessible from this execution's browser and shell network contexts;
no live browser verification is claimed. Port 8081 was not used.

No hosted migration, deploy, authenticated staging or production verification was performed.
The identity/tax migration is additive and has a drop-only rollback, but remains unapplied until
the correct project's backup and complete release verification are available. Batches 2–9 and
authenticated browser checks remain open. Continue with Batch 2 personal settings, then proceed
in order; do not merge this incomplete PR.

# Settings overhaul — Batch 2 continuation, 26 November 2026

The organisation identity and legacy tax-summary editor now calls
`save_company_identity_and_tax`, an additive transactional RPC with permission
validation, stale-snapshot rejection, and a before/after audit in the same
transaction. The migration is `20261126150000_settings_company_identity_atomic.sql`;
its drop-only rollback is in `supabase/rollback/`. An isolated PostgreSQL test covers
successful two-table persistence, audit evidence, stale and invalid input, denied
tenant access, and rollback after an audit failure.

Verification status: TypeScript passed, all 633 unit-test files / 4,349 tests passed,
the 27-file / 225-test focused set passed, full repository ESLint passed, production
build passed, and navigation, UI, module, bundle, browsing-inventory and migration
identity checks passed. The Docker PostgreSQL harness could not start because Docker
is unavailable; `psql` and the Supabase CLI are absent. The isolated SQL test remains
unexecuted. PR [#92](https://github.com/streakbooks/StreakBooks/pull/92) run
[#38](https://github.com/streakbooks/StreakBooks/actions/runs/45801553959) started and
failed `check:lookups` on four mapped option lists. Those source violations are fixed
and pass locally, but the fix is not yet pushed or checked by GitHub. Vercel reports
private-organization restrictions on its Hobby plan; Cloudflare Workers also reports
a failed external build. No migration was applied to hosted Supabase, no deploy
occurred, and PR #92 remains open/draft. The
configured project is `qugoaaizclvkzesptovm`; only target-specific confirmed backup
evidence authorizes any hosted migration.

Gulshan's standing StreakBooks delivery instruction is recorded in
`.cursor/rules/merge-without-ci-billing.mdc`: merge completed work to `main` after
local gates pass without waiting for GitHub Actions when jobs never started solely
because of org billing/spending limits. This does not waive real failures, unfinished
work, or the required hosted migration safety check.

# Settings overhaul — continuation, 26 November 2026

Continued `feat/settings-module-overhaul` / PR #92. Fixed the repository-wide Prettier lint failure without disabling lint rules, and corrected the browsing inventory so the public `/advisors` storefront is tracked separately from authenticated routes. Current local verification: 633 Vitest files / 4,349 tests, TypeScript, full ESLint with zero warnings, production build, navigation/UI/module/bundle checks and all-module browsing inventory pass. Browser E2E is still unverified because the in-app browser cannot reach the workspace-local Vite listener; three authenticated Playwright cases remain skipped without a test account. The coverage inventory correctly reports 0/30 modules as fully verified.

No Settings schema change was needed; no Supabase migration or hosted database action was performed. The configured target is `qugoaaizclvkzesptovm`, and the backup evidence in historical notes is for a different project. PR #92 remains open/draft; do not merge while Settings batches 2–9, authenticated browser verification and the task's release gates remain incomplete. Recheck new-head Actions after the verification commit is pushed. Previous CI evidence is at [run #37](https://github.com/streakbooks/StreakBooks/actions/runs/45797328652), which predates the current fixes.

---

# Settings overhaul — 26 November 2026

Work is in progress on `feat/settings-module-overhaul`, based on clean `main`
`207b7bc6`. Phases 0–2 and the route-first implementation foundation are
documented in `docs/settings/`; batches 2–9 remain open. The current full unit
suite passes (633 files / 4,349 tests), as do typecheck, build, changed-file
ESLint, navigation/UI/module checks and bundle check. Full-repository lint still
fails; three authenticated Settings Playwright tests are skipped without test
credentials, and the local browser visit to `/settings` rendered an application
error. See `docs/settings/05-TEST-REPORT.md` and `defect-register.md`.

No database change or migration was needed for the route/UI work. No deployment
or hosted Supabase action was made. The configured Supabase project is
`qugoaaizclvkzesptovm`; historical backup evidence elsewhere in this file is for
a different project and does not authorize a hosted migration. Continue the
remaining batches in `docs/settings/TASKS.md`; do not merge until the task's
remaining work and green-check requirements are satisfied.

# Executing workers and observed alerts — 3 November 2026

Delivery stays on main only; fetch before the next change. The preceding
operational workflow batch is already on remote main as `9464ced`. No Vercel actions.
GitHub Actions account billing/spending remains blocked; no manual retry is useful.

`/platform/operations` connects cases, incidents, segments and release evidence.
`/platform/automation` now connects actual operational jobs/attempts and measured
alert rules/history. pg_cron executes support expiry and operational observations
on the connected Supabase project `ipxflpzfcqwtenodbxwc`. A real 06:14 UTC scheduled
run succeeded with two handlers. Never re-label this worker as a queue-only store.

Hosted migrations `20261103060832`, `20261103061120`, `20261103061306` are applied;
public generated types match. Dead-lettered scheduled kinds cannot reset their own
retry budget; recurrence aligns to minutes. SQL tests exercise effects, dependency
failure, backoff, dead letter, retry, acknowledgment/dedupe/recovery and disable.
Current evidence: 1,577 unit tests, 40 platform browser tests, SQL harness, typecheck,
production build, lint (0 errors/20 existing warnings) and source audits. Browser
transport is synthetic; hosted cron evidence is separate. See STATUS/decision 010.

The full A–H programme remains partial. Continue the unchecked implementation in
[TASKS.md](superadmin/TASKS.md), especially billing adapters/lifecycle, safe removal
and notices, actual scoped API/webhooks, trusted-IP enforcement, partner/sandbox
provisioning, promotion/recovery, measured AI spend and load/recovery exercises.
Support communications/time tracking and incident impact/follow-ups remain pending.
Do not claim production certification or independent human review. External needs:
secure test payment/email configuration, another authorized MFA approver, GitHub
billing correction and a human independent review. No new request for secrets.

---

# Operational workflows continuation — 3 November 2026

Work continues on main only; fetch before the next commit. No Vercel commands or
checks. The owner confirmed that GitHub Actions is blocked by failed account
payments/spending limits, not a code-step failure. Do not retry manually until fixed.

Applied `20261103055903_platform_operational_workflows.sql` to
`ipxflpzfcqwtenodbxwc`. Cases/incidents now have actual assignment, phases,
deadlines/impact start, notes and close/resolve/reopen. Segments have membership
preview, bounded add/soft-remove, archive/restore and revision-checked undo. Release
plans record change and rollback evidence without deploying anything. Native
`/platform/operations` URLs and Customer 360 case links connect the UI to seven
permission-checked RPCs. Types reflect the hosted schema. Private receipts prevent
duplicate effects; central platform_audit remains the audit source.

See [STATUS.md](superadmin/STATUS.md) for executed results and exact limitations,
and decision 009. The later worker continuation above supersedes the queue-only state. Continue the
remaining API, billing, partner/sandbox, promotion and assurance tasks. Test-mode
provider secrets, another authorized human approver, GitHub account billing and
independent human review remain external prerequisites; do not invent them.

---

# Main-only continuation — 3 November 2026

The owner's latest instruction is to fetch/synchronize and commit to `main` only.
It supersedes the earlier branch-only delivery restriction for ongoing work. Keep
published history intact. Do not run Vercel commands, pushes or deployment checks.

Main already includes PR #66 and the previous hosted application recorded below.
The old statements that those migrations are unapplied or awaiting backup are
historical, not current blockers.

The pending search/navigation batch is now implemented: permission-scoped searches
for businesses/users/firms, exact record URLs, refresh/Back/Forward/new-tab behavior,
and related-record links. Invalid URL IDs are explicitly cleared after validation.
Search queries/names are not stored in the search audit row.

`20261103051315_platform_search_navigation.sql` was applied to project
`ipxflpzfcqwtenodbxwc`, recorded under that exact version, and verified through
function ACLs, unauthenticated denial and security/performance advisors. Public
wrappers are security invokers; anonymous execution is denied. No customer data
migration, ledger policy change, provider call or Vercel action was made.
Generated public database types were refreshed from the same project.

Verification: 1,571 unit tests, 25 platform browser tests, exact-record/search SQL
role and rate-limit assertions, concurrency and both rollback scripts. Typecheck
and production build pass. Full lint has zero errors and 20 existing warnings;
lookup/native-navigation source audits pass. Final GitHub results belong to the
pushed main commit and must not be represented as passing before they finish.

The full programme is still partial. [Current status](superadmin/STATUS.md),
[remaining tasks](superadmin/TASKS.md), and the
[defect register](superadmin/DEFECTS.md) distinguish connected features from draft
stores. Real test-provider billing, a real second approver walkthrough, independent
human review, operational workers and several complete workflows remain open.
Do not mark the full A–H programme production-certified.

GitHub CI follow-up: implementation commit `5f3b1f3` is on remote main. Run
`41583439318` failed twice before any steps/logs, so remote CI remains BLOCKED
because the owner-confirmed account billing/spending limit prevents job startup. All local browser regression suites now pass:
**123 browser tests** total, plus the **1,571 unit tests**, typecheck, build and
SQL/rollback checks. See the current final report for exact scope and limitations.

---

# Hosted apply — 2 November 2026 (evening)

BACKUP CONFIRMED. Before any hosted change, a logical backup of project
`ipxflpzfcqwtenodbxwc` was taken with `supabase db dump --linked` (roles, public/private
schema, auth+storage schema, all data incl. 26 auth tables) and kept off-repo on the
owner's machine (`~/StreakBooks-backups/20261102-2121-pre-superadmin/`, SHA256SUMS
alongside). It was restored into a disposable `supabase/postgres:17.11.0.003` container:
222/222 tables, storage policies 9/9, and every user/app table row count matched live
(only `auth.schema_migrations`/`storage.migrations` bookkeeping is excluded by the dump,
and one `report_open_events` row was written after the dump). Restore caveat: function
EXECUTE grants for `anon` do not round-trip into the stock image; after any restore,
re-run `20261103000200_revoke_anon_definer_execute.sql`.

Rehearsal: the 62 unrecorded migrations from `20261102042056` onward were applied in
order to that restored copy. 53 applied cleanly; 9 reporting migrations failed only with
"already exists" (already live under other versions). Data row counts were unchanged.

Hosted result (owner instruction to complete and merge):

- The 53 were applied to the hosted project, each in its own transaction, 53/53 OK.
  All 62 versions are recorded in `supabase_migrations.schema_migrations`.
- `20261103000100_mfa_policies_superadmin_tables.sql`: aal2 restrictive policy now on
  all 204 RLS tables (0 uncovered).
- `20261103000200_revoke_anon_definer_execute.sql`: `20261102180000` revoked from
  PUBLIC only, so 28 definer functions stayed executable by `anon` through Supabase's
  direct grant. Now only `get_shared_invoice`, `list_public_billing_plans` and
  `list_live_feature_prices` are anon-executable.
- Advisors after apply: no ERROR findings; `function_search_path_mutable` 0;
  `anon_security_definer_function_executable` 3 (the intended public functions).
- Not applied: the start-month backfill in `docs/superadmin/start-month-backfill.md`
  (data update; still a proposal).

Still open: test-mode provider credentials, a real second platform approver, an
independent human review of PR #66, and Vercel deploys (blocked by team membership).

---

# Historical continuation — 2 November 2026

This section supersedes the historical handoff below. Work remains on
`chore/superadmin-continue` / PR #66. Main `c672888` was merged into this branch;
this continuation is not merged to main. No Vercel operation was run.

The uploaded master directive is restored at `docs/superadmin-master-prompt.md`.
Current implementation, gaps and verification limits:
[superadmin continuation review](superadmin/RESUMPTION-20261102.md),
[current status](superadmin/STATUS.md), and
[decision 007](decisions/007-supervised-support-and-audited-resumption.md).

Customer 360 now renders stored identity/team/subscription/billing-event metadata.
The new supervised support workflow reuses the existing approval inbox, actual
support grants and audit log. Its SQL is **unapplied hosted**. Requests are hidden
until the schema capability is available. The original direct-grant UI is removed.
Unsupported approval types fail instead of claiming an applied change.

No verified hosted backup or restore approval was received. Quoted approval phrases
in old instructions or the master prompt do not constitute confirmation. No hosted
DDL, backfill, provider call, charge, production-data exercise or Vercel check was
performed in this continuation.

Docker is available **in this cloud workspace**. The new isolated PostgreSQL fixture
executes 43 existing pending migrations plus the new one and verifies the support
workflow. It is not a complete Supabase reset or proof of hosted schema equivalence.
The previous Windows-machine Docker blocker is historical and may still apply there.

Remaining external gates: verified backup/restore evidence, test-mode provider
credentials outside chat, a real second platform approver, independent human PR
review, full migration-history reconciliation, and a new explicit main-merge
instruction. Broad programme gaps remain documented; no production certification
is claimed. Rollback SQL: `superadmin/rollbacks/disable-supervised-support.sql`.

---

## Historical handoff (retained verbatim below)

# Handoff

## P0 evidence

Typecheck exit 0. Lint 0 errors and 23 warnings. Vitest 163 files, 1279 tests, all passed. Production build exit 0. Playwright had no seeded platform_owner: `e2e/superadmin-journeys.spec.ts` 2 passed and 2 skipped. Migration history is BLOCKED: Docker is not installed, and the only other Supabase project is LeadOrbit. READY-TO-APPLY and not applied: `20261102170000`, `20261102180000`, `20261102180100`, `20261102190000`, `20261102200000`, `20261102210000`, `20261102220000`, `20261102230000`, `20261102240000`, `20261102250000`, `20261102260000`, `20261102270000`, `20261102280000`, `20261102290000`, `20261102300000`, `20261102310000`, `20261102320000`, `20261102330000`, `20261102340000`, `20261102350000`, `20261102360000`, `20261102370000`, `20261102380000`, `20261102390000`, `20261102400000`, `20261102410000`, `20261102420000`, `20261102430000`, `20261102440000`, `20261102450000`, `20261102460000`, `20261102470000`, `20261102480000`, `20261102490000`, `20261102500000`, `20261102510000`, `20261102520000`, `20261102530000`, `20261102540000`, `20261102550000`, `20261102560000`, `20261102570000`, `20261102580000`, `20261102590000`, `20261102600000`, `20261102610000`, and the start-month backfill in `docs/superadmin/start-month-backfill.md`.

- P0.1: typecheck exit 0, lint 0 errors and 23 warnings, 1279 unit tests passed, production build exit 0.
- P0.2: `sk_live_` and `rzp_live_` are refused unless `STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS=true`. 15 provider-key tests passed.
- P0.3 BLOCKED: Playwright Chromium installed; public quote tests passed 2, grant/revoke skipped. Need Docker Desktop or Podman on PATH to seed a local platform_owner.
- P0.4: definer audit written. `20261102180000` and `20261102180100` are READY-TO-APPLY and were not applied. Definer audit test passed.
- P0.5 BLOCKED: no Docker and no StreakBooks staging project. Do not use LeadOrbit. Create an empty staging project or install Docker Desktop or Podman.
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
- Batches E–H: sandbox request tests passed, 1. `20261102330000` was not applied. No company was created and posting is unchanged.
- Final: author report is in `docs/superadmin/final-report.md`. Independent review remains open until a second person reads pull request 66.
- Full unit suite after the platform files: 192 files, 1349 tests, all passed. Typecheck failed because an audit-chain row could be undefined. That access is now checked.
- Batch B: provider charge comparison tests passed, 2. A missing provider list stays unrecorded. The live fetch stays BLOCKED until a test-mode secret and provider events exist.
- Batch B: provider fee tests passed, 2. `20261102340000` stores a supplied fee and was not applied. A missing fee stays unavailable. No provider call.
- Batch D: webhook outcome tests passed, 2. `20261102350000` records delivered or failed and was not applied. The live handler does not call it. No request body is stored.
- Batch B: lifetime value tests passed, 3. `20261102360000` sums supplied payments in one currency and was not applied. No payments stays unavailable. Mixed currencies stay unseparated.
- Batch B: usage draft save tests passed, 4. `20261102370000` cannot mark a draft posted and was not applied. Provider posting stays BLOCKED until a test-mode secret is in `.env.local`.
- Batches E–H: presentation promotion tests passed, 2. `20261102380000` copies locale, date format, footer, and theme colour after a second approval and was not applied. Base currency and journals are not copied.
- Batch B: usage draft guard tests passed, 4. `20261102390000` rejects an amount that does not match the draft status and was not applied. Posting stays blocked.
- Batch B: included usage must be quantity zero. `20261102400000` was not applied. Posting stays blocked.
- Batch B: reconciliation store tests passed, 2. `20261102410000` stores a match or mismatch and was not applied. A missing provider list is not stored. The live fetch stays BLOCKED.
- Batch A: proration store tests passed, 2. `20261102420000` stores the integer and was not applied. It cannot record a provider call.
- Batch C: every unapplied platform function checks `require_platform` or `platform_can`, and every new table enables row level security. Test passed, 1.
- Batch C: break-glass expiry writes a platform audit row. `20261102430000` was not applied. The customer log stays action and time. Tests passed, 4.
- Batch C: a break-glass request and a promotion request require a business that exists. `20261102440000` was not applied. Tests passed, 6.
- Batch B: a stored fee cannot exceed the charge. `20261102450000` was not applied. A missing fee stays unavailable. Tests passed, 3.
- Batches E–H: a duplicate segment name or membership is rejected and is not audited as a new tag. `20261102460000` was not applied. Tests passed, 2.
- Batch D: updating a webhook outcome records the previous status. `20261102470000` was not applied. The live handler does not call it. Tests passed, 2.
- Batch B: a lifetime payment source is recorded once. `20261102480000` was not applied. A repeat does not add to the total. Tests passed, 4.
- Batch D: one pending closure per business, and approval archives only a real business that is still open. `20261102490000` was not applied. Tests passed, 4.
- Batches E–H: a release version is recorded once and still does not deploy. `20261102500000` was not applied. Tests passed, 2.
- Batches E–H: one pending promotion per target business. `20261102510000` was not applied. The request does not copy settings. Tests passed, 3.
- Batch C: one open break-glass grant per business. `20261102520000` was not applied. The customer log stays action and time. Tests passed, 5.
- Batches E–H: one queued row per job name. `20261102530000` was not applied. Queueing does not run the job. Tests passed, 2.
- Batches E–H: an alert name is created once. `20261102540000` was not applied. A missing observation does not fire. Tests passed, 2.
- Batch B: one usage draft per business. `20261102550000` updates that draft and was not applied. It cannot post. Tests passed, 5.
- Batches E–H: a partner name is registered once. `20261102560000` was not applied. A missing revenue share stays null and no plan is created. Tests passed, 2.
- Batches E–H: a sandbox name is requested once. `20261102570000` was not applied. No company is created and posting is unchanged. Tests passed, 1.
- Batches E–H: one open service case per subject, and an open case can be closed. `20261102580000` was not applied. The case is not deleted. Tests passed, 3.
- Batch C: stored platform rows must name a business that exists. `20261102590000` was not applied. A business delete does not cascade. Tests passed, 1.
- Batch B: a mismatch cannot be stored with a zero difference. `20261102600000` was not applied. A missing provider list is still not stored. Tests passed, 3.
- Batches E–H: an archived business cannot be promoted. `20261102610000` was not applied. Approval still copies presentation fields only. Tests passed, 4.
- Hosted gate BLOCKED: `20261102170000` through `20261102610000`, and the start-month backfill, are READY-TO-APPLY. Nothing further was applied. Write `BACKUP CONFIRMED` in this file to release them.

## NEEDS FROM OWNER

- Write `BACKUP CONFIRMED` here before any hosted migration is applied.
- Put a test-mode `STRIPE_SECRET_KEY` or Razorpay test keys in `.env.local` before provider calls.
- Add a second platform user with `approvals.manage` for the kill-switch walkthrough.
- Install Docker Desktop or Podman on PATH, or create an empty StreakBooks staging Supabase project. Do not use LeadOrbit.

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

| Batch                                                   | Label   | Evidence                                                                                                                                                                                                                             |
| ------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A Entitlements, price book, custom plans                | PARTIAL | `src/lib/platform/entitlements.ts`, `price-book.ts`, `src/routes/pricing_.builder.tsx`, `PlatformApprovals.tsx`. Vitest: 6 files, 37 tests passed. Attaching a quote to a subscription is blocked until a test-mode provider exists. |
| B Subscriptions, usage, revenue, overview               | PARTIAL | `revenue-metrics.ts`, `subscription-cohorts.ts`, migrations `20261102140000`–`20261102160000`. Overview and start months checked in the browser. Usage invoices, provider sync, lifetime value and fees are not built.               |
| C Businesses, users, roles, security                    | PARTIAL | Existing `/platform` sections for businesses, users, firms, roles, audit. Approvals now shows for this session. A second approver and break-glass were not used.                                                                     |
| D Integrations, API, monitoring, support                | PARTIAL | Existing screens load. Connections were not verified. Backup list is empty and point-in-time restore is off.                                                                                                                         |
| E Incident, maintenance, release, health                | MISSING | No new incident, maintenance, release or health-score surface.                                                                                                                                                                       |
| F Accounting integrity, AI governance, compliance, jobs | MISSING | No new desk beyond the existing accounting screens.                                                                                                                                                                                  |
| G Commercial and partner operations                     | MISSING | No partner desk.                                                                                                                                                                                                                     |
| H Operations analytics, alerting, promotion, sandbox    | MISSING | No alerting or sandbox promotion desk.                                                                                                                                                                                               |

## This follow-up

- CI for `53cc3ec`: GitHub Actions run "StreakBooks verification" completed success. Checks `verify` and `voice-browser` completed success. `main` reports `protected=false`, and the branch-protection endpoint returned 404. The push was a direct fast-forward because the branch is not protected.
- Pull request 62 is closed and GitHub marks it merged. A comment points at `3964c4b` and `53cc3ec`.
- Migration history: `docs/superadmin/migration-history.md`. Remote data was not changed. Docker is not available here, so `supabase db reset` and a schema diff were not run.
- `feature_dependencies` has row-level security, a SELECT grant to `authenticated`, and no policy. `supabase/migrations/20261102170000_feature_dependency_read.sql` adds that policy and is not applied.
- Start-month backfill is a proposal only: `docs/superadmin/start-month-backfill.md`. It was not applied.
- Playwright journeys: `e2e/superadmin-journeys.spec.ts`. Grant and revoke stay skipped unless `E2E_PLATFORM_STORAGE_STATE` and `E2E_PLATFORM_TEST_BUSINESS_ID` are set. The public quote tests did not run: the Playwright Chromium binary is not installed. The same quote was checked in the Cursor browser.
- Deployed app `https://streakbooks-navy.vercel.app`: the sign-in page renders. `/pricing`, `/pricing/builder` and `/platform` return 404, and the deployed bundle does not contain the plan builder. A Vercel comment on pull request 62 says the GitHub account is not a member of the paxaris team, so `53cc3ec` was not deployed. No sign-in was attempted on that site.
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

# Settings overhaul — Sales invoice and quote dates, 26 November 2026

Implemented the existing Sales default payment terms in invoice due-date calculation and corrected quote creation/date edits to consume the saved quote-validity setting instead of hardcoding 30 days. Customer-specific invoice terms remain higher priority. Added `salesDocumentEndDate` with consumer tests, field-specific settings permission/persistence tests, registry/coverage entries, and review steps. Local validation passed: 640 test files / 4,368 tests; TypeScript, full ESLint, production build, module/UI/navigation/lookup/migration contracts and client bundle check passed. The isolated network-disabled workflow PostgreSQL suite passed with typed audit, RLS, tenant-isolation, redaction, nullable-default and rollback checks.

The previous pushed commit `55b719cfcfb5a2ce66220c790a655173a9afb283` passed Actions run [#45849928949](https://github.com/streakbooks/StreakBooks/actions/runs/45849928949), including all 97 UI fixtures and six PostgreSQL jobs; this Sales diff requires its own fresh run. PR #92 remains open/draft. Hosted Supabase and deployment were not touched. Continue Sales/Purchases work; Settings batches 4–9 and authenticated browser review remain incomplete.

# Settings overhaul — purchase bill payment terms, 26 November 2026

Factored purchase bill due-date defaults into `defaultPurchaseBillDueDate` and routed initial bill dates, term resets, supplier changes and form reset through it. Supplier terms take precedence; the existing manual override guard remains. Added `purchases.default_payment_terms` evidence plus server permission/persistence and typed audit regressions. Local validation passed: 640 test files / 4,370 tests, TypeScript, full ESLint, production build, module/UI/navigation/lookup/migration contracts, bundle check, isolated workflow PostgreSQL suite and all 97 deterministic UI fixtures. The Sales commit `1d715142f47dd55c11cf249948845ab901467e6f` and Purchases commit `5ae0270241fc4617e736d43c2bb2a1b95477d8ad` are published. Actions run [#45854284429](https://github.com/streakbooks/StreakBooks/actions/runs/45854284429) passed static validation, six PostgreSQL suites and browser fixtures. PR #92 remains open/draft. Hosted Supabase, deployment, authenticated staging and production were not touched; the matching backup evidence for hosted migrations is still missing. Continue the remaining Batch 4 fields and batches 5–9.

# Settings overhaul — Sales and Purchase note defaults, 26 November 2026

Added memo-default behavior tests for Sales invoices/quotes (not credit notes) and purchase bills. The server writer remains permission-checked; the isolated workflow audit regression verifies that Sales and Purchase free-text values are redacted on insert/update and that no note text leaks into `settings_change_log`. Local validation passed: 640 test files / 4,373 tests, TypeScript, full ESLint, production build, module/UI/navigation/lookup/migration contracts, bundle check, isolated workflow PostgreSQL and 97 deterministic UI fixtures. These note changes were published in commit `1892178817d98e69c7c3923fdcd7bbe95f5405a1`; Actions run [#45856529957](https://github.com/streakbooks/StreakBooks/actions/runs/45856529957) passed. PR #92 remains open/draft; remaining Batch 4 fields and batches 5–9, authenticated browser review, hosted backup evidence, deployment and production verification remain incomplete.

# Settings overhaul — Sales payment instructions, 26 November 2026

Connected the saved Sales payment-instructions setting to invoice, quote and receipt document branding as a fallback. Explicit branding text wins; purchase documents retain existing branding and never use the Sales default. Added resolver and database-loader behavior tests and capability coverage. Focused tests passed (3 files / 10 tests); the full suite passed (642 files / 4,378 tests), TypeScript, full ESLint, production build, module/UI/navigation/lookup/migration checks and client bundle guard passed. All 97 deterministic Playwright UI fixtures and the isolated workflow PostgreSQL suite passed.

The visual route inventory was stale for Advisor navigation and the new canonical Settings route. It is now synchronized at 30 sidebar modules and 206 routes; the guard passes and runtime verification remains explicitly false. These changes remain local to the feature worktree and need a fresh Actions run. Authenticated localhost review still needs non-production credentials. No migration, hosted database or deployment was changed.

# Settings overhaul — base-currency ledger integrity, 26 November 2026

Added migration `20261126210000_settings_base_currency_posting_guard.sql`: the identity RPC rejects a base-currency change after posted journals, and the migration locks base-currency reads in the central `post_journal` writer plus higher-level posting functions that calculate FX before calling it. These share locks serialize against the Settings RPC's existing company-row update lock. Regression checks reject direct RPC attempts after posted history without changing identity/audit rows and assert that installed posting functions with base-currency reads carry a lock. The temporary posted journal is deleted before later harness checks. The network-disabled PostgreSQL 17 workflow harness passed; migration identity/history checks passed at 383 unique versions and 8 tests; focused Settings tests passed (3 files / 12 tests). No hosted Supabase, deployment, authenticated staging or production was used. Batch 3 and the wider Settings work remain incomplete. This expanded migration change requires a fresh GitHub Actions validation.

# Settings overhaul — purchase-order preference behavior, 26 November 2026

Connected the existing `purchases_require_po` setting to a tested bill-workspace notice. Enabling it clearly recommends linking a PO but continues to allow independent bills, consistent with the setting's “Prefer purchase order before bill” label. Added enabled/disabled consumer tests, a permission/persistence regression, and field-level capability evidence. The isolated workflow SQL regression proves true/false typed before/after audit values; the network-disabled PostgreSQL 17 harness passed. Focused tests passed (3 files / 13 tests), changed-file ESLint and UI contracts passed. No migration was needed. The feature branch push and Actions for this preference are still in progress; no hosted Supabase, deployment, authenticated staging or production was used.

# Settings overhaul — tax treatment ownership, 26 November 2026

Removed the duplicate “prices include tax” control and write path from Sales workflow defaults. The organisation Tax settings page is the single configuration owner, preventing independent saves from diverging between transaction previews and posting. The legacy workflow database column remains for compatibility but application code no longer reads or writes it. Focused tests passed (3 files / 31 tests), changed-file lint and full typecheck passed. No migration, hosted database or deployment was changed.

# Settings overhaul — payment reminder audit, 26 November 2026

Added `20261126200000_reminder_settings_audit.sql` and its drop-only rollback. Reminder schedule fields now receive typed same-transaction before/after audit rows; unchanged values and metadata-only updates do not log, audit failures roll back the setting, and the internal trigger function is not executable by clients. Added a network-disabled PostgreSQL regression to the workflow harness and promoted the capability in the registry/matrix. Reminder delivery remains explicitly manual. Focused tests passed (5 files / 52 tests), migration identity checks passed (382 versions), and the isolated workflow PostgreSQL suite passed. Full suite/build and fresh-head Actions remain pending. This migration is not applied to hosted Supabase because matching restore-point evidence remains unavailable. The tax-treatment cleanup passed 31 focused tests, changed-file lint and typecheck. Current latest pushed head is `52aadac1953ccfa7e24955f9970691f2cb14aa4a`; Actions run [#45860832213](https://github.com/streakbooks/StreakBooks/actions/runs/45860832213) was running when this reminder change began.

# Settings overview and purchase display defaults — 26 November 2026

Fixed the Settings overview company query to read tax regime through the authoritative `company_tax_settings` relation; the former `companies.tax_regime` selection caused an error in the localhost:8080 Settings overview. A focused mapping/query regression, lint and typecheck passed. The prior reminder-audit commit `21aa2a294197395eecce8f59c2fe3697c79b5b53` passed Actions run [#45862846980](https://github.com/streakbooks/StreakBooks/actions/runs/45862846980); the published overview fix `306d50b1bccd755581dbd912bad3685c2e018051` had Actions run [#45863944490](https://github.com/streakbooks/StreakBooks/actions/runs/45863944490) in progress when this purchase display change began. Connected the Purchases supplier-summary default to new bill workspaces, while preserving a user's saved per-account sidebar preference. Focused tests, lint, module/UI contracts, typecheck and diff checks passed; this change is pending its own branch publication and CI. No hosted Supabase changes or deployment occurred.
