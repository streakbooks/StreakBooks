# Settings overhaul task list

Ordered work for the Settings module brief. Status reflects repository work, not hosted production state.

## 2026-11-27 Direct bank-posting warning consumer

- Connected the existing `warn_bank_direct_posting` preference to populated manual-journal lines that use an active, postable bank or cash ledger account. The warning is advisory and never blocks posting; the typed Accounting settings control is now complete based on the existing version-checked, permission-gated, audited writer.
- Updated the legacy Accounting safeguards summary to identify the bank and back-date warnings as active, while leaving duplicate-number, control-account and auto-credit preferences explicitly partial/read-only. No migration was needed.
- Focused helper, capability-registry and safeguards UI tests passed (3 files / 23 tests); changed-file lint and UI contract check passed (775 TSX files, zero violations). Local typecheck stalled without diagnostics, but GitHub Actions [run #45948663653](https://github.com/streakbooks/StreakBooks/actions/runs/45948663653) passed validation, browser fixtures and all six isolated PostgreSQL suites for this commit. No hosted Supabase access or deployment was performed.
- Batch 3 remains partial because regional Tax and other Accounting controls still lack complete evidence.

## 2026-11-27 Expense defaults field evidence

- Promoted the existing Expense Management default claim currency and distance unit after tracing their versioned settings RPC, `expenses.manage_policies` permission, same-transaction audit and real new-claim/mileage-rate consumers.
- Extended the isolated settings audit regression to assert exact before/after values for the default claim currency. The existing focused resolver tests cover enabled-currency/multi-currency fallback and mileage unit precedence.
- Focused tests passed (3 files / 30 tests), changed-file ESLint passed, `check:ui` passed (775 TSX files, zero violations), and `npm.cmd run test:workflows:postgres` passed in a disposable network-disabled PostgreSQL 17 container. The modified SQL assertion proves default claim currency and distance unit before/after audit values. No hosted Supabase operation or deployment was performed; current-head GitHub CI is pending.
- Batch 5 remains partial because receipt/spending thresholds, approval settings, advances, petty cash and rebilling still need field-level evidence.

## 2026-11-27 Expense self-approval policy

- Added an isolated regression around the production `private.expense_claim_assert_approver` helper. It proves the default-on setting rejects a claimant's own approval, allows a different authorised approver, and permits self-approval only when the saved policy is explicitly disabled.
- Aligned the server-side Settings save permission with the page and RPC: either `expenses.manage_policies` or `expenses.admin` can save. Added helper tests proving alternate permission grants, denied access, RPC errors and one access-audit event.
- The workflow harness now loads that exact helper from the existing approvals migration. The policy uses the audited, versioned Expense settings RPC; no migration was added.
- Focused tests passed (3 files / 30 tests), changed-file ESLint and `git diff --check` passed, `check:ui` passed (775 TSX files, zero violations), and the network-disabled PostgreSQL 17 workflow harness passed including the new self-approval case. Current-head GitHub validation is pending. No hosted Supabase operation or deployment was performed.
- Expense Management remains partial because threshold, approval-count, advance, petty-cash and rebilling fields still need evidence.

## 2026-11-27 Expense multi-approver policy

- Added an isolated regression using the production `save_expense_required_approval_count` and `approve_expense_claim` functions. It proves a count of two leaves the claim in review after one approval, rejects the same approver twice, and marks the claim approved only after a second user approves; the settings audit row contains the saved count.
- Aligned the two approval-settings server functions with their UI and database policies so either `expenses.manage_policies` or `expenses.admin` can save.
- Focused tests passed (3 files / 30 tests), changed-file ESLint and `git diff --check` passed, `check:ui` passed (775 TSX files, zero violations), and the network-disabled PostgreSQL 17 workflow harness passed with the two-approver regression. Current-head GitHub validation is pending. No hosted Supabase operation or deployment was performed.
- Expense Management remains partial because receipt/spending thresholds, escalation, advances, petty cash and rebilling still need evidence.

## 2026-11-27 Expense approval escalation window

- Added isolated evidence around the production escalation settings writer and queue reader. A submitted claim older than the saved five-day threshold appears in the queue, changing the threshold to seven days removes it, and zero disables the queue; each save is covered by the existing same-transaction field-level settings audit.
- Added the setting as a separately registered capability and updated the coverage matrix. The regression runs after the existing expense schema fixture and uses a test-only delegation stub; hosted schema and data are not touched.
- Focused tests passed (4 files / 33 tests), changed-file ESLint and `git diff --check` passed, `check:ui` passed (775 TSX files, zero violations), and the network-disabled PostgreSQL 17 workflow harness passed with the threshold and disabled-queue assertions. Current-head GitHub validation is pending. No hosted Supabase operation or deployment was performed.
- Expense Management remains partial because receipt/spending thresholds, advances, petty cash and rebilling still need field-level consumer evidence.

## 2026-11-27 Expense receipt and spending thresholds

- Added an isolated regression around the production versioned settings RPC and claim-risk scan. Claims at the configured receipt and spending-request thresholds receive the corresponding flags; saving thresholds above the claim amount removes those flags.
- Extended the existing settings audit regression to verify exact before/after values for both thresholds, then registered the fields as one coverage capability. The risk-scan regression uses test-only access, duplicate, attachment and claim-line fixtures to isolate the settings consumer.
- Focused tests passed (4 files / 34 tests), changed-file ESLint and `git diff --check` passed, `check:ui` passed (775 TSX files, zero violations), and the network-disabled PostgreSQL 17 workflow harness passed with the new risk-scanner and audit assertions. Current-head GitHub validation is pending. No hosted Supabase operation or deployment was performed.
- Expense Management remains partial because advance, petty-cash and rebilling settings still need field-level consumer evidence.

## 2026-11-27 Expense advance and petty-cash accounts

- Added an isolated regression that saves employee-advance and petty-cash account IDs with the production versioned settings RPC, then invokes the production issue/fund functions. The real posting engine creates balanced journals using the configured debit accounts and selected bank/cash account.
- Extended field-level audit assertions for both account mappings and registered the two settings separately. The test uses only isolated fixture rows and the network-disabled PostgreSQL 17 harness.
- Focused tests passed (4 files / 34 tests), changed-file ESLint and `git diff --check` passed, `check:ui` passed (775 TSX files, zero violations), and the network-disabled PostgreSQL 17 workflow harness passed with the account-mapping journal assertions. Current-head GitHub validation is pending. No hosted Supabase operation or deployment was performed.
- Expense Management remains partial because rebilling and other cash-advance/petty-cash policies still need consumer evidence.

## 2026-11-27 Expense rebilling account evidence

- Registered the rebilling income account as a separate capability. Existing Expense settings mapping/serialization tests and the customer-rebilling line builder prove the saved account is required and assigned to billable invoice lines; the claim screen passes the setting to sales invoice creation.
- Extended transactional settings audit assertions to verify before/after rebilling income account IDs. No production code or schema change was required.
- Focused tests passed (3 files / 27 tests), changed-file ESLint and `git diff --check` passed, `check:ui` passed (775 TSX files, zero violations), and the network-disabled PostgreSQL 17 workflow harness passed including exact before/after account-audit evidence. Current-head GitHub validation is pending. No hosted Supabase operation or deployment was performed.
- Expense Management remains partial for other advance/petty-cash workflow policies and any unsupported settings.

- [x] Phase 0 — audit current routes, UI, persistence, consumers, permissions, tests and module registry (`audit.md`). No feature code changed in this phase.
- [x] Phase 1 — official public benchmark, clean-room IA, decision and originality record (`benchmark.md`, `ia-design.md`, `docs/decisions/011-settings-information-architecture.md`, `docs/compliance/originality-log.md`).
- [x] Phase 2 — define typed per-setting coverage metadata and fail-closed coverage tests; document ownership and honest statuses. Evidence-backed capabilities are registered individually; remaining typed fields stay partial and are read-only.
- [ ] Phase 3 / Batch 1 — canonical nested routes, universal breadcrumbs, legacy route compatibility and validated return-to-module are implemented. Authenticated browser E2E is pending because this workspace has no `E2E_EMAIL`/`E2E_PASSWORD` account. The Settings Centre loaded at `http://localhost:8080/settings` after a refresh; an initial transient application error did not recur.
- [ ] Phase 3 / Batch 2 — organisation identity and tax summary use a transactional, stale-snapshot-guarded RPC with before/after audit; its isolated SQL regression passes CI. Profile now supports verified email changes, breadcrumb trail and same-organisation custom palette sync; account-wide preference scope remains partial.
- [ ] Phase 3 / Batch 3 — accounting and tax settings; prove safety and effective-date/audit requirements. Base currency now has tested journal consumption, posting locks and post-history change rejection; the configured backdate threshold now produces a non-blocking manual-journal warning. Other accounting/tax coverage and authenticated review remain open.
- [ ] Phase 3 / Batch 4 — sales and purchases settings; prove document workflow effects. Purchase-order three-way matching is now an editable, audited preference enforced during bill authorisation; other purchase inbox/approval/duplicate/contractor settings and sales controls without consumers remain partial/read-only.
- [ ] Phase 3 / Batch 5 — banking, inventory, assets, expenses, payroll and projects; preserve existing module owners. Payroll core configuration now has transactional field-level audit with redacted payslip notes; schedule/component settings and broader module coverage remain open.
- [ ] Phase 3 / Batch 6 — users, access, firm/client grants, approvals and portal settings.
- [ ] Phase 3 / Batch 7 — notifications, automation, integrations and API. Outgoing email sender name/reply-to and organisation digest quiet hours now have tested consumers; provider connections, AI, voice and API controls remain partial.
- [ ] Phase 3 / Batch 8 — AI/voice, billing/subscription, security/audit, data/privacy.
- [ ] Phase 3 / Batch 9 — remaining modules discovered from `MODULE_REGISTRY`.
- [x] Final documentation artifacts — `REVIEW_GUIDE.md`, `coverage-matrix.md`, refreshed `05-TEST-REPORT.md`, and `defect-register.md` are present. The defect register explicitly states that its review is self-review, not an independent external audit.
- [x] Validation remediation — formatted the existing linted TS/TSX/MJS tree without weakening lint rules; aligned the browsing inventory guard with public Advisor storefront routes as well as authenticated modules. Full lint and browsing inventory checks now pass locally.
- [ ] Final deliverables — complete all remaining implementation batches and their verification; then update this task list and final report.
- [ ] Delivery — implementation commits are on `feat/settings-module-overhaul`; draft PR [#92](https://github.com/streakbooks/StreakBooks/pull/92) is open, and its latest commit/checks are tracked there. Merge remains pending because Settings batches 3–9 and authenticated browser verification are incomplete. Vercel reports that the private organisation repository cannot deploy on its current Hobby plan. Hosted Supabase remains untouched; do not run blind migration sync.

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
- Added patch-mapping tests and a server-function regression proving an Accounting-only update leaves Sales/Purchases fields out of the database payload. Tax-inclusive pricing is configured only through organisation Tax settings; the duplicate Sales workflow writer is removed so invoice previews and posting share one source.
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

## 2026-11-26 Tax treatment setting ownership

- Removed the duplicate tax-inclusive pricing switch and write path from Sales workflow defaults. The organisation Tax settings screen is now the single configuration owner, avoiding independent saves that could leave preview and posting treatment inconsistent.
- Focused draft, patch and workflow-function tests passed (3 files / 31 tests), lint and typecheck passed. The legacy database column is retained for compatibility and is no longer read or written by application code. No migration or hosted database change was made.

## 2026-11-26 Payment reminder audit

- Added additive migration `20261126200000_reminder_settings_audit.sql` and drop-only rollback for typed before/after audit of the manual invoice reminder schedule. No-op and metadata-only updates are ignored; RLS still scopes edits to the organisation; audit insertion failure rolls back the schedule change.
- Added an isolated PostgreSQL regression to the network-disabled workflow harness and registered the existing reminder capability. The manual reminders remain user-triggered; no background sender was introduced.
- Focused tests passed (5 files / 52 tests), migration identity checks passed (382 unique versions / 8 history checks), and `npm run test:workflows:postgres` passed in a network-disabled PostgreSQL 17 container. The regression proves typed create/update history, no-op suppression, tenant isolation, private function permissions and transaction rollback on audit failure. Full suite/build and new head Actions remain pending. The migration is not applied to hosted Supabase; matching restore-point evidence is still unavailable.

## 2026-11-26 Purchase supplier-summary default

- Connected `purchases.show_supplier_summary_default` to new bill workspace initialization. The organisation value applies only when the user has no saved personal sidebar preference; explicit user preference continues to win. The existing member-scoped `organisation_config` read and `user_ui_preferences` RLS boundary remain in force.
- Added a field-level server-function regression for enabled/disabled defaults, saved-user precedence and the existing open fallback, plus registry and coverage evidence. This completes one purchase display preference only; Batch 4 and the wider Settings work remain partial.
- Focused tests passed (3 files / 13 tests), changed-file lint, module contracts, UI contracts and diff checks passed. Typecheck and fresh-head GitHub Actions are pending. No schema migration or hosted Supabase change was needed.

## 2026-11-26 Report comparison preference

- Promoted the existing organisation default comparison for profit/loss and balance sheet statements into the typed capability registry. The consumer already respects explicit report URL and saved-report choices; this edit enables the control only with that behavior contract and existing tests.
- The Settings capability regression and `src/lib/settings/report-defaults.test.ts` passed. Batch 9 remains partial because the Reports module still lacks proven view and schedule settings. No schema migration was required.

## 2026-11-26 Base-currency ledger integrity

- Added migration `20261126210000_settings_base_currency_posting_guard.sql`. The organisation identity RPC now rejects a base-currency change after any posted journal exists. The migration adds `FOR SHARE` to base-currency reads in the central `post_journal` writer and higher-level posting functions that calculate FX before calling it, serialized against the Settings RPC's existing `FOR UPDATE` row lock.
- The isolated identity regression proves a permitted pre-posting currency change, that a later journal uses the new base currency, rejection after posted history, no identity/audit mutation on rejection, and locks on installed posting functions. Test journals and lines are removed before unrelated ledger-count assertions.
- `npm.cmd run test:workflows:postgres` passed in a network-disabled PostgreSQL 17 container. `npm.cmd run check:migrations` passed (383 unique versions; 8 history tests), and focused Settings tests passed (3 files / 13 tests). Hosted Supabase was not accessed.
- This is a financial-integrity slice of Batch 3; Accounting/Tax and the overall Settings overhaul remain partial. Full validation, new-head Actions, authenticated review, merge and deployment are still pending.

## 2026-11-26 Purchase-order preference behavior

- Added a focused consumer for the existing `purchases_require_po` preference. The bill workspace now renders the guidance through a testable helper; the copy explicitly keeps independent bills allowed, matching the preference’s intended, non-blocking behavior.
- Added permission/persistence and enabled/disabled consumer tests, then registered `purchases.require_po` only after confirming that the workflow audit trigger records its boolean in the same transaction. Updated the capability matrix and corrected stale Phase 2/Batch 2 descriptions.
- The isolated workflow audit regression now proves true/false typed before/after values for `purchases_require_po`. The network-disabled PostgreSQL 17 workflow harness passed after this addition. Focused tests passed (3 files / 13 tests), changed-file ESLint and UI contracts passed. No schema change was required. This completes one preference slice only; Batch 4 and the overall Settings work remain partial.

## 2026-11-26 Manual-journal backdate warning

- Connected `accounting.warn_backdated_days` to the manual-journal date field as an accessible, non-blocking warning. A stored threshold of 0 disables the warning; malformed dates or thresholds fail closed to no warning. Existing accounting-period lock enforcement remains authoritative.
- Registered the field as complete only after confirming the version-checked organisation settings writer, Accounting edit permission, category audit, field behavior test and consumer. Other Accounting warning settings and auto-credit remain partial/read-only.
- Focused tests passed (4 files / 14 tests), typecheck, changed-file ESLint, `check:ui`, `check:modules`, and the network-disabled PostgreSQL 17 workflow regression passed. No schema change, hosted Supabase operation or deployment was performed.

## 2026-11-26 Notification sender and digest quiet-hours coverage

- Added Settings capability entries for outgoing sender name, reply-to and organisation quiet-hours start/end/enabled. These use the existing authenticated, version-checked `organisation_config.notifications` writer and its transaction audit; sender identity remains bound to the server-verified email address.
- Added tests for saved notification loading/defaults, malformed configuration rejection, configured sender/reply-to behavior and digest quiet-hour timing. Existing manual and scheduled digest paths honor the configured organisation timezone.
- Focused tests passed (4 files / 21 tests) and typecheck passed. Changed-file lint and the existing Actions workflow were still pending at this doc update. No schema, hosted Supabase or deployment changes were made. Provider delivery verification remains incomplete.

## 2026-11-26 Organisation settings RPC security regression

- Added the generic `upsert_organisation_config` RPC to the network-disabled PostgreSQL harness and tested authorised insert/update, optimistic version conflicts, RLS tenant reads, audit permission visibility, denied unauthorised writes, direct table-write denial, audit-failure rollback and anonymous execute denial.
- The harness reuses the production function definition with isolated synthetic companies/users and cleans up its container; hosted Supabase was not contacted. `npm.cmd run test:workflows:postgres` passed after the new audit-log visibility assertion, and changed-harness ESLint plus `git diff --check` passed.
- This strengthens the shared persistence boundary used by Settings Centre; authenticated browser review, staging and production remain unverified.

## 2026-11-27 Custom palette synchronisation

- Extended the existing per-user, per-organisation appearance preference document to persist validated custom palette colors. Existing local theme storage remains the immediate renderer source; saved custom palettes are loaded into it, and edits made from the global theme controls can be saved with the new Appearance-card action.
- Added normalization and server-function tests for custom palette read/write and malformed input. Existing named palette and colour-mode behavior remains supported. Account-wide preference scope is still partial; palette data is organisation-scoped in the current `user_ui_preferences` model.
- Focused tests passed (4 files / 23 tests), typecheck, changed-file ESLint, `check:ui` and `git diff --check` passed. No schema migration, hosted database or deployment change was made.

## 2026-11-27 Purchase-order three-way matching

- Promoted `purchases.three_way_matching` to complete field evidence after confirming that PO-linked bill authorisation reads the organisation setting and fails when matching is required but the order, receipt and bill do not agree.
- Fixed malformed saved Purchases settings to fail closed instead of silently disabling the authorization guard. Added loader regressions for default, enabled, malformed and unreadable configuration.
- Focused tests passed (3 files / 29 tests), typecheck, changed-file ESLint, `check:modules`, `check:ui` and `git diff --check` passed. No schema or hosted Supabase change was made; Batch 4 remains partial because other Sales/Purchases fields still lack safe consumers.

## 2026-11-27 Organisation timezone validation

- Company creation/update validation now rejects unknown IANA timezone identifiers before sending a save; valid organisation zones continue to control company-local business dates.
- Focused company-validation and date-consumer tests passed (2 files / 10 tests), typecheck, changed-file ESLint and `git diff --check` passed. The SQL RPC currently accepts any nonempty timezone when invoked directly, so the field remains PARTIAL pending database-level validation and direct-RPC regression; no hosted database change was made.

## 2026-11-27 Organisation locale and date formatting

- Promoted the supported organisation locale and document date format as separate capabilities after adding consumer tests for loading them into document context and formatting a customer invoice email with the selected locale/date pattern.
- Extended the existing isolated PostgreSQL identity regression to exercise the audited localisation RPC: exact before/after audit, unsupported locale rejection, stale snapshot rejection, permission denial and audit-failure rollback.
- Focused tests passed (3 files / 29 tests); the network-disabled PostgreSQL 17 workflow harness, typecheck, changed-file ESLint and `git diff --check` passed. No migration or hosted database change was made; broader identity and Settings batches remain partial.

## 2026-11-27 Document numbering evidence

- Added field-level evidence for invoice, bill, quote and credit document sequences. Sequence edits use a validated compare-and-set RPC with same-transaction before/after audit; rewinds and stale writes are rejected. Allocation honors saved prefix/padding and advances the company-scoped counter atomically.
- Added focused allocator wrapper tests and extended the isolated legacy Settings SQL regression to assert the emitted number and incremented counter. No schema or hosted database change was made; authenticated browser review and the wider Settings batches remain open.

## 2026-11-27 Legal-name consumer evidence

- Added a direct document-context regression showing the company legal name from organisation Settings is carried into customer-facing branding while the trading/display name remains separate. The existing identity SQL regression now explicitly asserts the saved legal-name column and already verifies the full before/after audit payload, permission checks and rollback behavior.
- Registered `company.legal_name` as a complete field capability. Organisation identity overall remains partial because country, fiscal year, timezone and tax configuration still need broader server-side effect coverage.

## 2026-11-27 Fiscal-year consumer evidence

- Added an organisation metadata regression that carries the saved June 30 year end into the real accounting fiscal-year range calculation. The isolated identity SQL regression now saves and asserts that month/day alongside legal name, before/after audit and stale-write safety; its invalid February 30 and rollback coverage remains in place.
- Registered `company.fiscal_year_end` as a complete capability. The organisation identity group remains partial because country, timezone and broader tax/reporting configuration still need consumer coverage.
- Focused tests passed (3 files / 18 tests), the isolated PostgreSQL 17 workflow harness passed, and changed-file ESLint plus `git diff --check` passed. Hosted Supabase and migrations were not touched.

## 2026-11-27 Global Settings capability search

- Extended global Settings search to index standalone verified capabilities in addition to typed fields. Multi-word queries now find organisation identity, document numbering and Tax controls and route to the canonical owning page.
- Added pure search regressions and a browser-fixture test for fiscal-year discovery. Focused tests passed (2 files / 22 tests), `check:ui`, changed-file ESLint, TypeScript and `git diff --check` passed. The browser fixture awaits the next GitHub run; authenticated localhost review remains pending.

## 2026-11-27 Payroll calculation settings fail-closed handling

- Centralized the saved payroll rounding, currency and working-schedule mapping used by calculation previews and payroll-run calculations. Malformed persisted values now stop the calculation with an actionable error instead of silently substituting default rounding or accepting an invalid currency/schedule.
- Added focused regressions for saved policy propagation into the actual payroll-run calculator, legacy defaults, and malformed/null values. Focused checks passed (3 files / 28 tests), changed-file ESLint and TypeScript passed. Payroll remains **PARTIAL**: the settings save audit summarizes only selected fields, so field-level audit evidence for calculation/payment settings is still required before those controls are called complete.
- No schema change or hosted Supabase operation was made. This advances Batch 5 but does not complete Payroll or the remaining Settings batches.

## 2026-11-27 Expense mileage default consumer

- Connected the saved company default distance unit to the new mileage-rate form. A user's explicit unit selection takes precedence, while claim creation continues to use the selected saved rate's unit as the calculation authority.
- Added resolver regressions and documented expense-management coverage as partial; thresholds, approval policy, reimbursement-account effects and field-level audit evidence remain outstanding.
- No schema change or hosted Supabase operation was made. Batch 5 remains in progress.

## 2026-11-27 Expense claim currency consumer

- Connected the saved default claim currency to new employee claim drafts. Currency choices are loaded from the organisation base currency and enabled-currency list; the server rejects unsupported defaults and foreign defaults when multi-currency claims are disabled, using the saved policy when a partial settings patch omits that field.
- New online claim forms wait for settings/currency lookups before enabling entry, and claim templates are filtered to currency-compatible values so existing minor-unit amounts are not reinterpreted. Offline starts use the base currency without attempting live settings/currency requests; offline drafts retain the explicit currency selected when they were created.
- The Settings currency picker uses the shared searchable lookup with a retry state for failed currency queries. GitHub run #98 exposed a raw-select lookup-architecture violation; this is fixed and `check:lookups` now passes locally with zero violations.
- Added resolver, validation and template-compatibility tests. Focused tests passed (4 files / 28 tests), typecheck, changed-file ESLint, `check:modules`, `check:navigation`, `check:ui`, and `git diff --check` passed. Expense settings still remain partial because other fields and field-level audit evidence are not complete. No schema change or hosted Supabase operation was made.

## 2026-11-27 Expense receipt threshold wording

- Changed the Expenses setting label and helper copy to state that missing receipts are flagged for high-risk review but do not currently block submission. The existing database risk scan emits that flag; the wording no longer promises enforcement it does not provide.
- Added a manual review step and retained the Expense group as **PARTIAL** pending same-transaction setting audit and reimbursement-account consumer evidence.
- Focused risk and settings tests passed (2 files / 10 tests); changed-file ESLint, `check:ui`, and `git diff --check` passed. No schema or hosted Supabase change was made.

## 2026-11-27 Point of Sale Settings discovery

- Added a dedicated Point of Sale Settings category with searchable links to the existing register/location setup and catalogue checkout screens. No duplicate settings data or route was introduced.
- Changed POS module settings coverage from **MISSING** to **PARTIAL**: register setup and location access exist, while tax and tender configuration remain missing. Search, destination and fail-closed partial-state tests cover the addition.
- Focused Settings registry tests passed (4 files / 34 tests); `check:modules`, `check:navigation`, `check:ui`, changed-file ESLint, typecheck, and `git diff --check` passed. No schema or hosted Supabase change was made.

## 2026-11-27 Invalid Settings category feedback

- Invalid or malformed `section` query values still fail closed to the Settings overview, and now carry a validated marker so the page explains why it fell back.
- Added parser regression coverage for unknown and array-valued categories. This prevents malformed links from appearing to succeed silently.
- Focused Settings search tests passed (2 files / 17 tests); typecheck, changed-file ESLint, `check:ui`, and `git diff --check` passed. No schema or hosted Supabase change was made.

## 2026-11-27 Database time-zone validation

- Added a migration preflight that aborts if existing companies contain unsupported zones, then a database trigger that checks `companies.timezone` against PostgreSQL's IANA catalog for inserts and every update to the field. Invalid direct RPC/table writes now fail atomically, alongside the existing application-level validator.
- Added a drop-only rollback script; no company data is rewritten by this migration.
- Extended the network-disabled PostgreSQL workflow harness to apply this migration and prove an invalid identity RPC cannot alter company or tax values or emit an audit event. Registered the time zone as an individually complete Settings capability; company identity remains partial for country and legacy tax-summary evidence.
- Focused tests passed (4 files / 29 tests), migration identity/history checks passed (8 tests), changed-file ESLint passed, and `npm run test:workflows:postgres` passed using an ephemeral PostgreSQL 17 container with networking disabled. No hosted Supabase operation was performed.

## 2026-11-27 Expense settings transactional audit

- Added an `expense_management_settings` audit trigger that stores explicit before/after values for policy fields on insert/update in the same transaction. No-op updates do not create an audit row; audit failure aborts the settings write. Unauthenticated service maintenance is not attributed to a user.
- Added a drop-only rollback script; existing Settings and audit records remain intact if it is used.
- Added the migration and insert/update/audit-failure rollback regression to the isolated network-disabled PostgreSQL harness. Expense settings remain partial until a dedicated integration proves the configured employee payable account reaches the actual reimbursement journal.
- `npm run test:workflows:postgres` passed on PostgreSQL 17 with no network or hosted data. No hosted Supabase operation was performed.

## 2026-11-27 Authentication policy controls fail closed

- Added a regression that keeps organisation MFA and idle-timeout fields partial/read-only until the authentication and session runtime enforce them. The Settings panel derives its disabled state from this evidence registry, so unsupported security controls cannot be saved as if enforced.
- Focused Settings registry tests passed; no schema, hosted Supabase or deployment operation was performed.

## 2026-11-27 Payroll configuration audit evidence

- Added a database trigger for payroll configuration changes that writes field-level before/after values in the same transaction as the settings row. The payslip footer note is redacted; no-op updates create no audit event, audit failure rolls back the settings write, and unauthenticated service maintenance is not attributed to a user.
- Added an isolated PostgreSQL regression fixture and integration test for insert/update, note redaction, no-op and rollback behavior. Registered the core payroll configuration as a complete capability because existing payroll validation, permission checks and run/payment consumers are separately covered.
- Payroll module coverage and Batch 5 remain partial for schedule/component policies and other modules. The isolated workflow harness passed on PostgreSQL 17; the 14-test Settings registry suite, migration checks (8 tests), changed-file ESLint, UI contract check and diff check passed. The PR-head GitHub run is validating the full suite/build; hosted Supabase was not accessed.

## 2026-11-27 Expense reimbursement account consumer

- Added an isolated PostgreSQL integration that invokes the existing reimbursement RPC and real `post_journal` function, then asserts the configured employee payable account is the debit line, the selected bank account is the credit line, and the journal balances.
- Registered the reimbursement account as a separately complete capability. Expense Management remains partial because other claim, advance, petty-cash and rebilling policy fields still need consumer and audit evidence.
- The test fixture stubs only unrelated claim-event and bank-eligibility helpers; posting, account lookup, permissions, reimbursement RPC and journal assertions execute against their actual workflow code. The fixture runs in the network-disabled local Postgres harness; no hosted Supabase database is involved.

## 2026-11-27 Security setting fail-closed evidence

- Centralized the typed-field completion check used by the Settings editor and added regressions proving owner MFA, idle timeout and support-access consent stay disabled until their authentication/session or client-approval flows exist.
- Updated the security gap and field copy so support access cannot be mistaken for an active consent gate. Focused capability tests (14) and changed-file ESLint passed. The wider Settings security/access batch remains open.
