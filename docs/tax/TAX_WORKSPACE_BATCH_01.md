# Tax workspace — UX and functional batch 01 (2026-11-06)

## Scope
- New live Overview landing tab at /tax with read-only counts from the existing
  tax rates, codes and return APIs. Includes registration, return, rates, codes,
  GL mappings, packs and Tax Summary shortcuts.
- Setup-review messages based on available configuration and migration state.
  They are hints only: not a declaration of legal or filing readiness.
- Search and status filtering for rates and codes, including empty-result views.
- Registration and GL mappings show unsaved changes and offer discard/reset.
  Save is disabled when unchanged or the user lacks tax.settings permission.
- Rate/code creation, edits, activation and deactivation now respect tax.settings
  in the UI (server permission checks remain authoritative).
- Draft save, filing record, delete and settlement actions in Returns are
  disabled for users without tax.settings.
- Missing account lookup data blocks GL mapping saves rather than allowing
  accidental clears.

## Accounting and compliance boundaries
- No posting, tax calculation, tax return formula, migration or RLS changes.
- Previously posted documents remain unchanged.
- A status of "filed" means recorded in LinkBooks, never electronically filed.
- Country pack configuration has not been independently verified against
  statutory sources; no statutory filing certification is claimed.

## Local verification required (CI intentionally not invoked)
From D:\MyApp\LinkBooks after checking out this PR branch:

    npm.cmd run typecheck
    npm.cmd run lint
    npm.cmd test -- src/lib/tax/tax-workspace.test.ts src/lib/tax/tax-settings-patch.test.ts
    npm.cmd run build
    npm.cmd run dev

Manual:
1. Open /tax with a tax-settings admin and with a read-only user.
2. Check Overview counts against Rates, Codes and Returns; exercise every shortcut.
3. Search/filter rates by name, percentage and each effective-date status.
4. Search/filter codes by code, name, rate and active/inactive state.
5. Change registration and GL mappings, confirm save/discard and revisit tabs.
6. Simulate account API failure, confirm mappings cannot be saved.
7. As a read-only user verify mutations are disabled; verify backend RLS separately.
8. Confirm draft return calculations, CSV, marking filed and settlement still work
   as before with an authorised user.
9. Inspect narrow/mobile layouts and keyboard navigation.

## Follow-up batches
- Shared tax form validation and edit conflict/unsaved navigation protection.
- Rate-change historical reference immutability and effective-date/version controls.
- Saved returns reconciliation to posted tax account balances and source drill-down.
- Country-specific pack verification and audited statutory-form templates.
- Provider-gated e-filing only after formal country-by-country compliance review.


## Continuation — Batch 02: tax input integrity and return management

### Implemented
- Shared calendar-valid date checks for tax rate effective dates, registration dates,
  tax adjustment journal dates, and tax return preview/draft periods.
- Exact decimal parsing of tax percentage into basis points: accepts at most two
  decimal places and rejects values beyond 100% without implicit rounding.
- Rejects fractional/out-of-range server rate basis points and fractional tax
  adjustment amounts expressed in minor currency units.
- Rejects unsupported tax return basis values instead of treating them as accrual.
- Returns list supports search by period/basis/status and filters for draft,
  recorded filed and settled returns.
- A selection change after Calculate shows a stale-preview warning and blocks
  Save as draft and CSV export until the user recalculates.
- Delete draft requires explicit checkbox confirmation.
- New pure-unit tests: tax input validation, return list filtering, stale-preview
  detection, registration date and rate end-date edge cases.

### Verification to run locally
    npm.cmd test -- src/lib/tax/tax-input-validation.test.ts src/lib/tax/tax-return-view.test.ts src/lib/tax/rate-status.test.ts src/lib/tax/tax-settings-patch.test.ts src/lib/tax/tax-workspace.test.ts
    npm.cmd run typecheck
    npm.cmd run lint
    npm.cmd run build

Tax Return manual scenarios:
1. Calculate for one quarter, change the period end without recalculating.
   Ensure the old result remains visibly identified as stale, and both save and
   CSV for that preview are blocked. Recalculate to clear the warning.
2. Change accrual to cash and ensure the old preview cannot be saved or exported.
3. Filter saved returns by Draft, Recorded filed, Settled and text.
4. Verify deleting a draft requires explicit confirmation and affects only the
   opened draft. Verify filed returns cannot be deleted.
5. Attempt impossible dates (2026-02-29, 2026-04-31), 20.005% tax rates,
   fractional basis points, and fractional adjustment minor units through the
   server functions. All must be rejected without a database change.
6. Check authorised/read-only users, GL mappings, country packs, browser
   accessibility, existing tax report exports, and multi-tenant isolation.

### Not verified
Local npm/TypeScript/ESLint/build/browser/DB tests are unrun in this environment.
GitHub CI was deliberately not started. No migration, production deployment or
merge was performed. Review and test the draft PR before merging.
