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


## Continuation — Batch 03: posted tax history guards and filed-return variance

### Implemented in code
- Migration `20261106120000_tax_master_posted_history_guard.sql` adds
  organisation-scoped database triggers. A posted invoice/bill with `tax_code_id`
  protects the referenced code's rate, treatment, recoverability, account,
  reporting class, usage, and identifier from retroactive mutation.
- A rate referenced through posted documents cannot have its amount, original
  start date or fundamental treatment changed; it may be deactivated and
  end-dated on or after the last posted document date.
- Tax-code inserts/updates reject a foreign-organisation tax rate or GL account
  even if a caller knows another tenant's UUID. Changing company_id is rejected.
- Guards preserve name corrections and active/inactive changes. Triggers cover
  direct table updates, not only changes through the Tax UI.
- Added `tests/fixtures/tax-master-history/baseline.sql`,
  `tests/integration/tax-master-posted-history.sql`, and a manually invoked
  isolated Docker/PostgreSQL runner:
  `node scripts/test-tax-master-history-postgres.mjs`.
- Filed return details now show a four-column table of recorded filed, current
  recalculation, and a signed delta for each changed return box (using bigint
  subtraction to avoid numeric overflow). A link opens the separate
  journal-derived GL Tax Summary report.
- New pure unit tests cover positive/negative/large filed-versus-current deltas.

### Verification and rollout gates
1. Run the PostgreSQL fixture runner locally; it does not use Supabase or CI.
2. Run `npm.cmd test -- src/lib/tax`, typecheck, lint, build, and browser regressions.
3. Before deployment, audit existing tax_code_id usage, especially legacy
   documents and any organisation/rate/account mismatches. The migration does
   not rewrite historical rows; existing violations must be assessed separately.
4. Apply the migration first in a staging Supabase project, validate migration
   idempotence and transaction/account behaviour, and check dual-tenant RLS
   and concurrent posting/edit scenarios.
5. Only after reviewed staging results should production deployment and
   feature enablement be considered. This batch has not been deployed.

### Explicit limitations
- Database master guards cover posted **sales invoice** and **purchase bill**
  lines with a tax_code_id and posted_journal_id. Uncoded legacy lines, credit
  notes with no tax_code_id, expenses, external uploads and documents with
  missing posting evidence are not retroactively protected by these guards.
- The migration does not yet provide a concurrency stress guarantee against
  simultaneous posting and master edits. Test and harden transaction locking
  prior to claiming end-to-end immutable reference guarantees.
- The new variance table compares stored return boxes with re-calculated boxes;
  it is **not** a GL-to-return reconciliation or a statutory amendment.
  Journal posting/basis differences must still be investigated via the GL.
- No e-filing or tax-authority integration was added.
- GitHub CI was not run, local PostgreSQL and browser tests were not executed,
  and no merge or deployment is claimed.

## Continuation — Batch 04: on-demand Tax Return / General Ledger diagnostic

### Implemented
- `getTaxGlComparison`: authenticated, organisation-scoped, read-only endpoint
  for a selected tax return period and accounting basis. It uses existing
  tax-document return calculations and **posted, base-currency converted**
  journal lines from the existing ledger reader.
- Requires two distinct mapped output/input tax control accounts; validates
  that both accounts belong to the requesting organisation. No comparison is
  shown when the mappings are missing or overlap.
- Separately totals output-control **credits less debits** and input-control
  **debits less credits**, grouped into:
  - posted sales/purchase document journal activity,
  - reversal journals,
  - other GL postings (settlement, tax adjustments, opening balances, manual
    entries, payments, etc.).
- Calculates the signed output-minus-input net difference between
  document-plus-reversal journal activity and the document tax return.
- All BigInt journal amounts and variances are carried as decimal strings to
  the client to avoid unsafe browser number conversion.
- `TaxGlComparisonPanel`: **optional** (no GL request until opened) on both
  newly previewed and saved Tax Returns. Offers refresh and a link to the
  existing detailed GL Tax Summary.
- Focused pure tests for signs, reversals, manual activity, currency minor
  precision, net tax payable and cash-basis handling.

### Calculation boundary
- **Diagnostic comparison, not final certification or statutory submission.**
  A zero difference is not proof of reconciliation or compliance.
- Cash-basis comparisons are marked informational: journal posting dates and
  cash allocation tax dates differ, so the shown difference is not a cash-basis
  GL reconciliation.
- Per-tax-code account overrides, unmapped fallback accounts, tax paid through
  separate accounts, different posting dates, manual tax journals and legacy
  lines can cause apparent differences. Current organisation mappings are not
  a historical account mapping snapshot.
- No journal changes, new tax authority filings, database migrations, new RLS
  privileges, or automatic discrepancy postings are part of Batch 04.
- Compare may be costly on very large ledgers because a user-triggered request
  loads all posted lines for two accounts in the specified period; benchmark
  performance before production.

### Local acceptance checklist
1. With two valid mappings, compare a VAT quarter whose source invoices and
   bills post to those accounts; check output, input and net figures.
2. Post a tax adjustment and a settlement in a fixture; ensure they appear in
   Other GL activity instead of the source-document component.
3. Reverse a posted source document and check the Reversal component.
4. Test zero transactions, negative net/refund, large exact minor-unit amounts,
   and mixed source types; verify signs and no truncation.
5. Compare accrual and cash basis on the same transactions; cash must clearly
   say "informational only" without a reconciled certification.
6. Test missing/same-account mappings, cross-company account references and
   unauthorised users; no mutating action is available.
7. Check both previewed and saved return panels, mobile table overflow,
   keyboard navigation, request refresh and error recovery.
8. Run:
   `npm.cmd test -- src/lib/tax/tax-gl-comparison.test.ts`
   `npm.cmd run typecheck`
   `npm.cmd run lint`
   `npm.cmd run build`
9. Verify end-to-end behaviour in authenticated staging with the production-
   compatible database schema before merging.

**Status:** Code committed to draft PR #110; checks and authenticated staging
are not verified. No GitHub CI, production merge or deployment was performed.
