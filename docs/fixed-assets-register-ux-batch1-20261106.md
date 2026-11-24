# Fixed Assets register UX and accounting-balance safeguards — Batch 1 (2026-11-06)

## Scope added in this branch

- Existing Fixed Assets navigation and posting routes are preserved.
- Register searches include asset numbers, names, descriptions, notes, asset types and visible GL account names/codes.
- Add tenant-scoped asset-type and GL-asset-account lookup filters, sort keys and ascending/descending control. Filtered view is reused for CSV export and active-asset summary.
- Account totals are based on as-at register data; no fallback to opening accumulated depreciation if the reporting endpoint is loading, missing, or in error.
- Disposal and CSV export remain disabled while authoritative balances are stale/unavailable or invalid. A balance-load error offers an explicit retry.
- CSV labels clarify its as-at date, includes asset type and account, escapes spreadsheet formulas, and leaves future-acquisition balances blank.
- Open real read-only asset details, actual posted depreciation journals, and paginated projected depreciation schedule.
- Add editable Notes to the asset form; the database already permits descriptive-only changes after depreciation begins.
- Add pure unit tests for filters, sort, immutability, as-at scope, missing balances, invalid accumulated depreciation and safe-integer overflow.

## No new accounting posting logic

This batch does **not** change SQL posting routines, journal entries, depreciation calculations, financial policy or RLS. No new migration is required for these UI changes. Existing asset posting and tenancy still require authenticated database verification.

## Mandatory manual/local verification before merge

In PowerShell at D:\MyApp\StreakBooks, after fetching and switching to the PR branch:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- src/lib/fixed-assets/register-view.test.ts src/lib/fixed-assets/depreciation.test.ts
npm.cmd run check:ui
npm.cmd run check:lookups
npm.cmd run build
npm.cmd run dev
```

Authenticated UI checks:
1. Fixed Assets > Register: search names, notes, type and GL codes; test the independent filters, clear, sort directions, narrow/mobile display.
2. Select an asset: verify metadata, actual posted depreciation, projected schedule pagination, journal IDs, disposed asset history and close.
3. Edit an asset with no postings and with posted depreciation; verify descriptive-only change including Notes; cannot change frozen financial terms.
4. Verify original-cost, accumulated and NBV for one and several assets against the signed-in company's fixed-asset register report. Filter selections must update totals.
5. Export selected CSV; verify labels, type/account columns, formula escaping, and accounting amounts. Future-dated purchases should not appear in as-at balances.
6. Simulate report RPC outage and a missing/invalid accumulated balance; verify display is unavailable and disposal/CSV cannot proceed.
7. Test a second tenant with different assets and permissions; verify no cross-organisation data or write access.
8. Exercise disposal, depreciation and locked-period cases in a local test database; this batch is not production-verified.

## Verification status

Source changes and regression test files have been committed to a feature branch. TypeScript, ESLint, unit tests, UI tests, PostgreSQL tests, staging browser, migration state and deployment have **not** been executed or verified in this session. Do not merge or declare production-ready based only on source changes.

## Next Fixed Assets batches

- General-ledger reconciliation by asset cost and accumulated depreciation control account.
- Asset detail document attachments, activity history, and source-bill/journal drill-down links.
- Approval/review workflow, depreciation run warnings and period close integration.
- Transfers, physical stocktake and custodian/location dimensions.
- Advanced accounting policies: impairments, revaluation, improvements, partial disposals and independent tax depreciation books (only with verified jurisdictional rules).
