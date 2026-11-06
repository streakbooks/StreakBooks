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

## Continuation — Batch 05: journal evidence, exceptions and auditable reviews

### Implemented in the draft PR
- GL comparisons now require `accounting.view`; review writes additionally require `tax.settings`.
- Posted journal evidence (number, date, signed control-account amount, source, account, and Accounting navigation) is displayed on demand. The most recent 100 rows are shown; totals use the full selected period.
- Review snapshots track comparison amounts, scope and a non-cryptographic digest of all posted journal evidence. Changed data marks prior review decisions stale, even where offsetting journals leave aggregate totals unchanged.
- Migration `20261106134000_tax_gl_review_sessions.sql` creates review sessions, append-only events, scope RLS, an atomic save/audit RPC, authorisation checks, version-based concurrent edit rejection, active-member reviewer validation, and mandatory notes for internal resolution.
- Review statuses: Open, In review, Resolved (internal). Old resolutions with changed evidence must be reopened before being resolved again. Cash-basis reviews cannot be marked resolved.
- Reviewer assignment UI supports keep current, assign to me, or unassign. The form includes notes, version, change history and stale-evidence warning.
- New tests `src/lib/tax/tax-gl-evidence.test.ts` and `tests/integration/tax-gl-review-sessions.sql`. Isolated local PostgreSQL runner: `node scripts/test-tax-gl-review-postgres.mjs`.

### Local/staging acceptance checklist
1. Run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test -- src/lib/tax`, and `npm.cmd run build`.
2. Run both `node scripts/test-tax-master-history-postgres.mjs` and `node scripts/test-tax-gl-review-postgres.mjs` with Docker Desktop; neither runs GitHub CI.
3. On isolated staging, apply the review migration, test RLS membership, unauthorized writes, audit append-only behavior and concurrent expected-version conflicts.
4. Test GL journal deep links, reversal signs, 0 and 1000+ journal lines, cash-basis warning, status transitions, reviewer self-assignment and stale review reopening.
5. Apply the migration before allowing reviewer actions in production. Do not claim compliance or deploy until reviewed.

### Explicit limits
- Internal status is a human assertion, **not statutory filing or a certified reconciliation**.
- Snapshot digest is a change detector, not a cryptographic audit seal. The callable RPC checks permissions/version/notes but does not independently recompute document-based tax amounts; an authorized direct RPC caller can supply a snapshot. The normal app server recomputes before saving.
- The comparison uses current GL mappings; historical remappings, per-code accounts and other sources can yield differences. Cash-basis GL comparison is informational.
- The full posted ledger is still fetched to calculate comparison and digest; benchmark large datasets before production.
- Simultaneous source posting and master-rate changes still require stronger database locking and race tests.
- Migration files were committed directly to GitHub because a local Supabase CLI/repository checkout is unavailable; no migrations have been applied.
- No local npm, Docker, browser, staging, CI, merge or deployment verification was performed.

## Continuation — Batch 06: posting locks, review conflicts and exact minor units

### Implemented on draft PR
- Repaired invalid dollar-quoted SQL in the historical tax-master integration test.
- Strengthened the Batch 03 database migration with posting-time locks on
  referenced tax codes and rates. Invoice/bill journal linking and tax master
  updates must coordinate through database row locks.
- A document-line guard locks its parent invoice/bill and prevents insert,
  update or deletion of posted source lines. Draft tax codes must belong to the
  same company as their source document.
- Posted journal references cannot be removed or replaced once linked.
  This intentionally protects historical source evidence.
- Extended isolated PostgreSQL fixtures for cross-company code references,
  posted source immutability and failed attempts to unpost.
- Reviewer drafts now preserve unsaved notes and assignment choices during
  a background refresh. Review versions are captured when editing starts, so
  other reviewers' changes cannot silently overwrite a local draft.
- Concurrent creation of a review now returns a descriptive retry/refresh
  error rather than an unhandled unique-constraint failure.
- Expanded isolated review tests to cover injected audit-event failure
  (whole review update must roll back), two-tenant read RLS and permissions.
- Added `tax-minor-units.ts` with exact integer parsing; replaced silent
  `Math.round(Number(...))` when settling stored tax return box amounts.
  Tax report boundaries now reject unsafe IEEE-754 minor-unit conversions.
- Both isolated PostgreSQL runners reapply their migration once to check
  repeated application, then run the regression fixtures.
- Added unit tests for minor-unit precision and concurrent review editing.

### Validation still required
1. On a local checkout of the feature branch:
   `npm.cmd run typecheck`, `npm.cmd run lint`,
   `npm.cmd test -- src/lib/tax`, `npm.cmd run build`.
2. Run Docker-backed isolated PostgreSQL tests:
   `node scripts/test-tax-master-history-postgres.mjs`
   `node scripts/test-tax-gl-review-postgres.mjs`
3. Stage-test both migrations in dependency order. Validate postings and
   reversals, edits on draft vs posted documents, rate changes, tenant RLS,
   reviewer concurrency, audit rollback and large monetary values.
4. Perform a **true two-session concurrency stress test** with simultaneous
   source posting and tax-code/rate changes, then recheck the linked journal
   and source line amounts. This is still unverified.
5. Run authenticated browser and performance checks on large ledgers, and
   integrate current main branch changes before considering a merge.

### Boundary / caution
- Locks apply to posting invoice/bill sources and line changes; other tax
  transaction types need their own historical guard coverage.
- Historic uncoded rows and journals are not retroactively corrected.
- An edited tax master immediately before a document posts may still need
  explicit document-time semantic snapshots to establish the original
  intended treatment; the guard does not provide full historic reconstruction.
- Tax review "Resolved" is an internal human status, not a certification or
  an authority submission.
- This runtime has Node, but no Docker or psql and no full LinkBooks
  checkout. The tests have not been executed, and migration rollout has not
  occurred. GitHub CI remains disabled by instruction.

## Continuation — Batch 07: two-session posting race verification

### Changes committed
- Corrected remaining malformed dollar-quoted SQL statements in
  `tests/integration/tax-master-posted-history.sql`; these previously
  prevented the isolated PostgreSQL test from reaching the guard assertions.
- Changed the two posted-history lookup functions from `STABLE` to
  `VOLATILE`: `tax_code_has_posted_history` and
  `tax_rate_last_posted_date`. PostgreSQL gives VOLATILE functions a
  fresh snapshot at the start of their SQL queries, which matters when
  a master UPDATE resumes after waiting for an invoice/bill posting lock.
- Added a regression assertion against `pg_proc.provolatile` to keep both
  snapshot-sensitive functions VOLATILE.
- Created `tests/fixtures/tax-master-history/posting-race.sql` with
  separate, initially unposted invoice/bill masters and source lines.
- Added `scripts/tax-posting-races.mjs` and integrated it into
  `node scripts/test-tax-master-history-postgres.mjs`.
  This test runner launches two or more independent psql connections:
  1. Hold a transaction after posting an invoice or bill, retaining the
     database locks on the tax code/rate and parent document.
  2. Attempt conflicting edits, first with a short lock timeout, then by
     queueing live UPDATEs while posting is still uncommitted.
  3. Check `pg_stat_activity.wait_event_type='Lock'` for the queued sessions
     (using test-only application_name markers) before allowing posting
     to commit.
  4. Confirm the queued UPDATEs reject the now-posted history when they
     resume, instead of changing historical treatment or source lines.
  5. Cover invoice rate, invoice code and invoice source lines, plus
     purchase-bill rate, code and source lines.
- Performed JavaScript syntax parsing of the new and existing test runners.
  **No live PostgreSQL execution** occurred.

### Local command (Docker Desktop required)
```powershell
cd D:\MyApp\LinkBooks-Tax
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- src/lib/tax
node scripts/test-tax-master-history-postgres.mjs
node scripts/test-tax-gl-review-postgres.mjs
npm.cmd run build
```

### Before merge or deployment
- Run the tests above in an isolated local container; examine the
  exact SQL failures if any. A syntax check is not a passing database test.
- Repeat concurrency testing with the full production-compatible schema
  and real posting RPCs: ensure sale/bill authorisation, reverse/void,
  document line editing, FX, tax mapping and audit logging still work.
- Confirm `READ COMMITTED` behavior and PostgreSQL version on staging.
  The isolated harness uses PostgreSQL 17 and mocks minimal schemas.
- Benchmark posting latency, deadlock frequency, lock waits and large-ledger
  reconciliation reads. Extend immutable source coverage to expenses and
  credit notes where tax code references are available.
- Validate migrations in staging; **do not claim active protections**
  until migration deployment and tenant RLS tests pass.

**Status:** Code committed to draft PR #110. CI deliberately not run.
PostgreSQL, TypeScript, ESLint, unit, browser and staging test results
remain unverified. No main merge or production deployment.
