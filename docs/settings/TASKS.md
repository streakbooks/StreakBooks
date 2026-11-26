# Settings overhaul task list

Ordered work for the Settings module brief. Status reflects repository work, not hosted production state.

- [x] Phase 0 — audit current routes, UI, persistence, consumers, permissions, tests and module registry (`audit.md`). No feature code changed in this phase.
- [x] Phase 1 — official public benchmark, clean-room IA, decision and originality record (`benchmark.md`, `ia-design.md`, `docs/decisions/011-settings-information-architecture.md`, `docs/compliance/originality-log.md`).
- [x] Phase 2 — define typed per-setting coverage metadata and fail-closed coverage tests; document ownership and honest statuses. The three evidence-backed capabilities are complete; remaining typed fields stay partial and are read-only.
- [ ] Phase 3 / Batch 1 — canonical nested routes, universal breadcrumbs, legacy route compatibility and validated return-to-module are implemented. Authenticated browser E2E is pending because this workspace has no `E2E_EMAIL`/`E2E_PASSWORD` account, and the local `/settings` browser visit showed an application error.
- [ ] Phase 3 / Batch 2 — organisation identity and tax summary use a transactional, stale-snapshot-guarded RPC with before/after audit; its isolated SQL regression passes CI. Personal account settings remain partial (Profile/security exist; profile breadcrumbs and a complete preference surface are in progress).
- [ ] Phase 3 / Batch 3 — accounting and tax settings; prove safety and effective-date/audit requirements.
- [ ] Phase 3 / Batch 4 — sales and purchases settings; prove document workflow effects.
- [ ] Phase 3 / Batch 5 — banking, inventory, assets, expenses, payroll and projects; preserve existing module owners.
- [ ] Phase 3 / Batch 6 — users, access, firm/client grants, approvals and portal settings.
- [ ] Phase 3 / Batch 7 — notifications, automation, integrations and API.
- [ ] Phase 3 / Batch 8 — AI/voice, billing/subscription, security/audit, data/privacy.
- [ ] Phase 3 / Batch 9 — remaining modules discovered from `MODULE_REGISTRY`.
- [x] Final documentation artifacts — `REVIEW_GUIDE.md`, `coverage-matrix.md`, refreshed `05-TEST-REPORT.md`, and `defect-register.md` are present. The defect register explicitly states that its review is self-review, not an independent external audit.
- [x] Validation remediation — formatted the existing linted TS/TSX/MJS tree without weakening lint rules; aligned the browsing inventory guard with public Advisor storefront routes as well as authenticated modules. Full lint and browsing inventory checks now pass locally.
- [ ] Final deliverables — complete all remaining implementation batches and their verification; then update this task list and final report.
- [ ] Delivery — implementation commits are on `feat/settings-module-overhaul`; draft PR [#92](https://github.com/streakbooks/StreakBooks/pull/92) is open. Latest published commit `1892178817d98e69c7c3923fdcd7bbe95f5405a1` passed Actions run [#45856529957](https://github.com/streakbooks/StreakBooks/actions/runs/45856529957). Merge remains pending because Settings batches 3–9 and authenticated browser verification are incomplete. Hosted Supabase remains untouched; do not run blind migration sync.

## 2026-11-26 continuation

- Accounting warning and automatic-credit preferences that have no transaction-workflow consumers are now displayed read-only with an explicit partial-status explanation. The coverage registry and matrix record the gap; reporting basis remains editable.
- Added a component regression test and a preservation assertion for unenforced preferences.
- The PostgreSQL workflow regression harness now respects Docker Desktop's Windows named-pipe context while retaining the explicit isolated Unix socket used in Linux CI.
- Local isolated database result: `npm.cmd run test:workflows:postgres` passed. The harness used its network-disabled ephemeral PostgreSQL 17 container, verified atomicity/rollback, permissions, two-tenant RLS, sales/purchase lifecycles, balanced journals, locks and demo-reset safeguards, then cleaned up the container. It did not connect to hosted Supabase.
- Focused settings tests: 3 files, 14 tests passed. Changed-file ESLint and module/UI/navigation checks passed.
- Typecheck, full unit suite, lint and production build pass after the API cleanup. The build no longer emits deprecated server-function or Windows symlink warnings; the shared Vite wrapper still emits one `vite-tsconfig-paths` advisory. Browser verification is not complete. The port-8080 listener refused a second Vite start because it is already occupied, but HTTP verification timed out, so the current page is not claimed as inspected.
- Replaced 1,212 deprecated TanStack Start `.inputValidator()` calls with `.validator()` and updated 50 server-function test stubs to the supported API. The TanStack migration guide states `.validator()` accepts the same validator. Full tests, typecheck and lint passed after this change; build rerun is pending. The Vite config wrapper still injects `vite-tsconfig-paths`, leaving its single Vite 8 advisory warning unresolved.
- The feature branch and PR remain unmerged. Do not mark the full Settings overhaul complete: batches 3–9 and authenticated browser review remain open.

## 2026-11-26 Sales/Purchases ownership continuation

- Removed duplicated Sales and Purchases defaults from the Automation panel; module-owned values remain editable in their Sales/Purchases settings screens.
- Changed `upsertWorkflowSettings` to validate and persist only submitted fields. Existing shared-row saves no longer overwrite unrelated module settings; first-save races retry as a partial update. Empty updates are rejected.
- Added patch-mapping tests and a server-function regression proving an Accounting-only update leaves Sales/Purchases fields out of the database payload. Sales tax-treatment synchronization runs only when `salesPricesIncludeTax` is submitted.
- This is a targeted ownership/data-loss safeguard, not completion of Batch 4. Sales/Purchase consumer-effect review and authenticated browser verification remain outstanding. Hosted Supabase was not accessed.

## 2026-11-26 Tax master audit continuation

- Added same-transaction before/after audit rows for tax rate and code insert/update/delete events in `settings_change_log`; no-op updates are not logged. The audit function is not directly executable by client roles.
- Tenant reassignment remains rejected by the existing tax history guard and is covered by the new SQL regression. Audit failures or rejected updates roll back the data mutation; rollback of an inserted rate also leaves no audit row.
- Added the isolated `test:tax:master:postgres` harness to the PostgreSQL CI matrix. Local run passed against an ephemeral, network-disabled PostgreSQL 17 container, including migration reapplication and two-connection posting/edit races. Hosted Supabase was not accessed.
- This advances audit and history evidence for Batch 3 only. Regional tax regimes, jurisdiction ownership, effective-date calculation/reporting consumers, and authenticated browser verification remain open; do not mark Batch 3 complete.

## 2026-11-26 Personal settings continuation

- Added appearance controls to the personal profile screen for light/dark/system mode and supported named palettes. Mode and named palette save per user and organisation through the existing RLS-protected `user_ui_preferences` table; custom palette colours remain device-local.
- Added server-side validation and normalization tests for supported synced values. The coverage gap now records that account-wide preference scope and custom palette sync remain open; broader Settings batches are still incomplete.
- `GET http://localhost:8080/settings` returned HTTP 200 from the isolated dev server. The in-app browser timed out navigating its tab, and the dev-server log showed missing local Supabase URL/publishable-key variables. Authenticated visual review remains unverified; hosted credentials were not copied into the isolated checkout.
- Focused appearance/theme/coverage tests passed (3 files, 18 tests); the full Settings library suite passed (29 files, 226 tests); full ESLint, TypeScript, UI/module/navigation/migration checks and the production build passed. One build attempt hit a transient Windows mapped-file lock while Vite was running; after stopping that checkout's dev server, the retry passed. The wrapper still reports its `vite-tsconfig-paths` advisory and Nitro's `inlineDynamicImports` notice.
- No schema migration is needed: the screen writes only the user's row in the existing `user_ui_preferences` table, whose RLS policy requires the authenticated user and organisation membership. Existing schema-history and isolated workflow regression checks pass; no hosted Supabase database was touched.
- The isolated, network-disabled PostgreSQL workflow harness passed using the installed Docker 29.9.3 engine. It compiled/applied `settings_company_identity_atomic.sql` and ran its atomicity, stale-snapshot, permission, audit and rollback regressions along with workflow, RLS, tenant isolation and accounting integrity checks. PostgreSQL client binaries are 19.0; the test container owns its isolated server. Hosted Supabase and user data were not accessed. The Supabase CLI is not on this executor's PATH.

## 2026-11-26 Personal appearance server verification

- Added server-function tests for authenticated user scoping, company membership enforcement, conflict-safe upsert keys, and rejection of unsupported/custom palette values. Custom palette colour data remains local to the device.
- Full local suite: 638 files / 4,359 tests passed; full ESLint and TypeScript passed; production build passed; UI, module, navigation and migration checks passed. `check:lookups` initially caught the finite theme palette map and now passes with the documented fixed-enumeration annotation.
- GitHub run [#45839137235](https://github.com/streakbooks/StreakBooks/actions/runs/45839137235) passed all six isolated PostgreSQL suites and browser fixtures; `validate` failed only at `check:lookups` because the new palette enumeration lacked the repository annotation. The fix is local and pending a new PR run.
- PR #92 is open/draft. Authenticated browser review is still blocked by missing non-production Supabase test credentials. No hosted migration, deployment, authenticated staging, or production check was performed.

## 2026-11-26 Accounting display preference

- Wired `accounting.account_code_padding` to the Chart of Accounts table using a member-scoped Settings read. Numeric account codes receive display-only zero padding; account identifiers, CSV values, postings, and stored data are not rewritten.
- The existing `organisation_config.accounting` versioned save path validates 0–8, enforces `company.settings.edit`, and writes before/after `settings_change_log` evidence. Added a behavior test for numeric, nonnumeric, long, and bounded-width codes. The field is now one of two typed settings marked complete; Accounting as a whole remains partial.
- No migration is required. Against the current Accounting diff, the full local suite passed (638 files / 4,360 tests), TypeScript, full ESLint, and production build passed; focused Accounting/registry tests passed (2 files / 12 tests), and lookup, UI, navigation and migration identity checks passed. Actions run [#45840352414](https://github.com/streakbooks/StreakBooks/actions/runs/45840352414) passed the preceding profile-preference head; this Accounting diff still needs a fresh PR run.
- Next: continue Batch 3 with tax and accounting settings that have provable transaction/report consumers; keep unsupported warning controls read-only.

## 2026-11-26 Tax rate and code master evidence

- Registered the existing Tax rate/code master lifecycle as a discrete implemented capability: permission-checked CRUD, server-side basis-point/date validation, tenant-scoped persistence, same-transaction before/after audit history, effective-rate selection, and preservation of posted tax history.
- Coverage remains **PARTIAL** for Tax overall: jurisdiction ownership, regional regime configuration and filing/reporting consumers still lack complete evidence. No new tax controls or duplicate organisation-level values were added.
- Evidence already present in the repo: `tests/integration/tax-master-settings-audit.sql`, `tests/integration/tax-master-posted-history.sql`, the Tax rate-status/maths tests, and the isolated PostgreSQL CI job. This metadata/documentation update changes no schema.
- The registry, Tax status and math regression subset passed locally (3 files / 27 tests); changed-file lint passed. The current GitHub run [#45842500901](https://github.com/streakbooks/StreakBooks/actions/runs/45842500901) is still in progress for the prior Account-code display commit; this Tax registry/documentation diff needs its own head run.
- Next: continue Batch 3 by connecting only settings with verified ledger/report consumers, then proceed in order through the remaining module batches.

## 2026-11-26 Manual-journal memo audit

- Added a discrete complete capability for the existing **Require memo on manual journals** setting. Its server-side posting guard now has a behavior test proving enabled mode rejects an empty memo before posting while disabled mode allows the balanced journal through the existing posting engine.
- Added additive migration `20261126180000_workflow_settings_audit.sql` plus a drop-only rollback. Its same-transaction trigger records before/after workflow fields, skips metadata-only changes, and retains exact values only for reviewed non-sensitive fields; free-text and future/unreviewed fields are redacted by default. Audit insertion failure rolls back the setting update. The migration is `READY-TO-APPLY`; no hosted database was changed.
- `npm.cmd run test:workflows:postgres` passed on a fresh network-disabled PostgreSQL 17 container, including tenant/RLS, audit redaction, nullable defaults, no-op, permission and rollback checks. Focused unit tests passed (2 files / 7 tests). Full suite passed (639 files / 4,362 tests), TypeScript, full ESLint, production build, module/UI/navigation/lookup/migration contracts all passed locally on this revision. Two report tests timed out only during an earlier concurrent validation run and passed in the subsequent serial full-suite run.
- Fixed the browser-fixture server alias that made CI fail to resolve TanStack server-only imports; the deterministic Playwright UI suite then passed all 97 tests locally. Authenticated browser review remains unverified because this isolated checkout lacks a non-production test account and Supabase environment.
- The additive migration remains `READY-TO-APPLY`; hosted Supabase was not changed. The earlier GitHub run is green for validate and isolated database jobs but failed browser fixtures before this fix; a fresh run is required. This verified slice is not a PR merge or deployment.
- Next: proceed with remaining Accounting/Tax settings in Batch 3; keep unsupported accounting warnings and auto-credit disabled/read-only.

## 2026-11-26 Sales defaults consumer follow-up

- The default sales invoice payment term already saved through the guarded workflow settings function, but it lacked field-specific consumer evidence. Added `salesDocumentEndDate` as the shared invoice/quote date resolver and wired it into invoice creation, customer selection, document-date edits, and quote expiry calculation.
- The configured quote validity field was previously ignored by the quote editor, which hardcoded 30 days. New quotes now use the saved organisation value and recalculate expiry when their date changes. Customer-specific invoice terms continue to override the organisation default.
- Added discrete registry and coverage rows for payment terms and quote validity. Other Sales settings remain partial; this is not Batch 4 completion.
- Added field-specific permission/persistence tests, date-consumer precedence and leap-safe calendar behavior tests; the isolated SQL regression proves typed term audit history, RLS, tenant isolation and failed-audit rollback. Focused tests passed (3 files / 12 tests), full suite passed (640 files / 4,368 tests), TypeScript, ESLint, production build, module/UI/navigation/lookup/migration contracts and client bundle guard passed locally.
- The last pushed commit `55b719cfcfb5a2ce66220c790a655173a9afb283` passed GitHub Actions run [#45849928949](https://github.com/streakbooks/StreakBooks/actions/runs/45849928949), including 97 browser fixtures and six isolated PostgreSQL jobs. This Sales diff requires its own fresh Actions run; no hosted Supabase migration or deployment occurred.
- Next: continue Batch 4 for Sales/Purchases by field, then proceed through batches 5–9. Sales as a module remains partial. Do not promote further fields without the same evidence.

## 2026-11-26 Purchase bill default terms

- Routed purchase bill initial dates, term resets and supplier selection through one policy helper. The saved organisation default now has a field-level behavior test, while supplier terms retain precedence and manual overrides remain protected by the existing flow.
- Added a separate complete capability for `purchases.default_payment_terms`, plus permission/persistence tests and typed audit assertions. Other Purchases controls remain partial; Batch 4 is still in progress.
- Focused tests passed (3 files / 23 tests); full unit suite passed (640 files / 4,370 tests), TypeScript, full ESLint, production build, module/UI/navigation/lookup/migration contracts and client bundle guard passed. The isolated workflow Postgres audit suite passed, and all 97 Playwright UI fixtures passed on this revision.
- Purchases payment terms are published in commit `5ae0270241fc4617e736d43c2bb2a1b95477d8ad`; Actions run [#45854284429](https://github.com/streakbooks/StreakBooks/actions/runs/45854284429) passed static validation, six PostgreSQL suites and browser fixtures. No hosted Supabase migration or deployment occurred. Continue remaining Sales/Purchase settings and batches 5–9; the Purchases module and Batch 4 are still partial.

## 2026-11-26 Sales and purchase note defaults

- Added a tested Sales memo-default resolver: saved notes apply to new invoices and quotes, and are intentionally excluded from credit notes. Purchase bills use their saved default note on creation and reset.
- Added separate capability rows for both note settings and an authorised server-write test. The workflow audit SQL now verifies that note strings are redacted on insert and update without leaking their content.
- Focused tests passed (4 files / 30 tests), workflow PostgreSQL regression passed, and the full suite passed (640 files / 4,373 tests). TypeScript, full ESLint, production build, module/UI/navigation/lookup/migration contracts, bundle guard and all 97 UI fixture tests passed.
- The Sales and Purchase note-default changes are published in commit `1892178817d98e69c7c3923fdcd7bbe95f5405a1`; Actions run [#45856529957](https://github.com/streakbooks/StreakBooks/actions/runs/45856529957) passed. No hosted database or deployment was changed.

## 2026-11-26 Sales payment instructions consumer

- Sales default payment instructions now fill invoice, quote and receipt document output when the existing document-branding field is blank. Explicit branding continues to take precedence; purchase output keeps its own branding and never receives the Sales default.
- Added behavior tests and promoted `sales.payment_instructions` in the capability registry and coverage matrix. The settings audit continues to redact its free text.
- Focused tests passed (3 files / 10 tests); full suite passed (642 files / 4,378 tests), and TypeScript, full ESLint, production build, module/UI/navigation/lookup/migration checks and client bundle guard passed. All 97 deterministic Playwright UI fixtures and the isolated workflow PostgreSQL suite passed. `check:visual-coverage` exposed stale route inventory entries; the Advisor discovery routes and new canonical Settings route are now tracked with browser verification still explicitly false, and the check passes at 30 modules / 206 routes.
- These changes are local on the feature worktree and need commit/push plus a fresh Actions run. Authenticated localhost review still needs non-production credentials. No migration, hosted database, deployment or production environment was changed.
