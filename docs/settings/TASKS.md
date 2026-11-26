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
- [ ] Delivery — implementation commit `6586075d` and subsequent verification work are on `feat/settings-module-overhaul`; draft PR [#92](https://github.com/streakbooks/StreakBooks/pull/92) is open. Merge remains pending because batches 2–9, authenticated browser verification and green CI are not complete. Supabase hosted changes require target-specific backup confirmation; do not run blind migration sync.

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
