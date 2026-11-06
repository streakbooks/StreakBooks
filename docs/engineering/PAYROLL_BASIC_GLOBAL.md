# Basic Global Payroll

| Field | Value |
|-------|-------|
| **Module route** | `/payroll` (authenticated) |
| **Branch foundation** | `feature/basic-global-payroll-batch-1-foundation` |
| **Batch 7 focus** | Security smoke tests, docs honesty, UX polish (setup checklist, empty states, Feature Manager readiness), unit test coverage |
| **Production claim** | **Not production-ready** for live payroll until staging smoke passes (migrations alone are insufficient) |
| **LinkBooks production DB** | Foundation + hours-adjust migrations applied **2026-11-05** on the linkbook Supabase project (`…180000` payments and `…181000` run hours adjust); `/payroll` is reachable — still verify on staging before claiming readiness |

## Scope (what ships in code)

- Organisation payroll settings, pay schedules, and component catalogue.
- Employee master, masked payment details (writes via RPC; no full bank numbers via client SELECT).
- Salary structures and effective-dated assignments (including **custom lines only** on the employee page when no structure is selected).
- Payslip print uses the shared document print stylesheet (`DocumentSheet` / `document.title` for PDF filenames).
- Pay runs (calculate → review → approve), payslip snapshots, ledger accrual posting.
- Net-pay payments with payslip allocations and generic bank CSV export (manual upload only).
- Payment recording uses major-unit money inputs (same pattern as purchases); allocations are validated before submit.
- Reverse posted accruals (when no net pay has been paid) and reverse posted payroll payments.
- Per-employee run adjustments on draft/calculated/reviewed runs: manual amounts (major-unit money), period **hours** for hourly components, and **units** for unit-based components. Values persist as variable run lines and load into calculate/recalculate (quantity in micro-units, same as the calculation engine).
- Pay schedule and component catalogue edit/deactivate in settings (no new migration).
- Payslip list filters (payment status, employee) and payments list filter by run (`?runId=`).
- Payment detail sheet (allocations, unallocated balance, journal link, reverse).
- When **Require review before approval** is on, approvers must mark a run reviewed before payslip generation (client + server guard).
- Operational payroll reports for approved/posted runs.

## Explicit non-goals / disclaimer

Basic Global Payroll is **international-friendly bookkeeping payroll**, not jurisdiction-certified statutory software.

- No automatic income tax, social security, pension auto-enrolment, or government filing engines.
- Statutory deductions and employer contributions are **manual components** configured by the organisation.
- Bank CSV export is a generic review file; it does not mark payslips paid and is not bank-scheme certified.

Every settings page and overview surfaces this compliance notice from the server `disclaimer` field.

## Delivery batches (implementation history)

| Batch | Theme | Primary migrations |
|-------|--------|-------------------|
| 1 | Foundation, permissions, settings | `20261105153211_journal_source_type_payroll.sql`, `20261105153212_basic_global_payroll_foundation.sql` |
| 2 | Employees, payment details, structures | `20261105160709_basic_global_payroll_employees.sql` |
| 4 | Runs, calculation, payslips | `20261105173000_basic_global_payroll_runs.sql` |
| 5–6 | Posting, payments, reports (app layer) | `20261105180000_basic_global_payroll_payments.sql` |
| 7 | Hardening, RLS smoke, docs, UX polish | (no new migration — tests and polish only; overview checklist links, permission-gated empty states, `basic_payroll` configComplete in Feature Manager) |
| 7b | Run period hours / OT / unit quantity entry | `20261105181000_basic_global_payroll_run_hours_adjust.sql` (extends `adjust_payroll_run_employee` for hourly/unit) |

## Permissions (summary)

| Permission | Typical use |
|------------|-------------|
| `payroll.view` | Read settings, employees, runs, payslips, payments |
| `payroll.settings.edit` | Enable module, schedules, components, GL links |
| `payroll.employees.manage` | Employees, structures, salary assignments |
| `payroll.run.prepare` | Create/calculate/recalculate runs |
| `payroll.run.approve` | Review/approve runs (payslip generation) |
| `payroll.run.post` | Accrual journal posting |
| `payroll.pay` | Record net-pay payments |
| `payroll.reports.view` | Payroll operational reports |

## Automated tests

| Layer | Location |
|-------|----------|
| Unit | `src/lib/payroll/*.test.ts` (`npm run test -- src/lib/payroll`) |
| SQL smoke (schema grants) | `tests/integration/basic-payroll-foundation-security.sql` |
| SQL smoke (two-tenant RLS) | `tests/integration/basic-payroll-rls-security.sql` |

Run SQL smokes only against an **isolated** Postgres instance with LinkBooks migrations applied (same pattern as `tests/integration/documents-review.sql`). Do not run against production.

## Employee CSV import

Bulk employee create/update is implemented on **Payroll → Employees** (CSV upload/export). The Imports Centre template documents column names only; it is not a separate import writer.

## Remaining limitations

- Migrations must be applied and payroll enabled per organisation before live use (linkbook production has foundation migrations as of 2026-11-05; org-level enablement and staging smoke still required).
- No Playwright payroll module smoke (auth/setup cost); rely on unit + SQL integration smokes.
- Statutory compliance, pension APIs, and pay-file bank formats are out of scope for Basic Global Payroll.

## November 6, 2026 — operational UX enhancements (PR #107)

This work **does not replace** the manual statutory compliance disclaimer, payroll calculation
engine, accounting journal posting, or the required authenticated staging smoke.

- Payroll runs: status/search/sort, distinguish filtered empty results, verify invalid
  periods, warn when a run overlaps a non-void period on the same schedule. Suggested
  next run uses the **full** previous run history regardless of status filters; manually
  edited dates are preserved on query refresh until the schedule is changed or a new
  create dialog is opened.
- Payslips: search/sort and employee/payment-status filters; employee choices remain
  available when a filter is active. Outstanding net pay is presented separately
  from the original net pay using the payslip's recorded payments.
- Employees: search/sort with reset and settings load error handling; CSV export
  explicitly exports the **current filtered view**, not all staff.
- Employee CSV imports: parse and validate the full file before writing, including
  quoted multiline fields, duplicate headings/employee IDs, malformed quotes,
  and limits of 500 data rows / 1,000,000 characters. Display a review dialog
  identifying new vs existing IDs from the **complete** company employee list.
  Existing employee IDs are skipped, never overwritten, because the CSV format
  lacks linked salary structures and confidential bank details.
  Import remains sequential, not atomic. If it fails partway through, earlier
  rows are saved; later rows are not attempted. No automatic rollback or resume
  is claimed. Rows with blank employee IDs allocate new numbers and may duplicate
  if imported repeatedly. New employees may still need salary/schedule assignments.
- Payments: posted/reversed/search controls and result counts; payment calculation,
  reversing and posting remain unchanged.

**Verification:** Additional Vitest cases cover CSV duplicates and RFC-style quoting.
A focused isolated runtime parser check passed 9/9 cases, but the repository's
typecheck, lint, full unit suite, build, browser E2E, and production checks
have **not** been executed for PR #107. GitHub Actions push attempts failed with
no jobs started; the quality workflow is currently commented out in the repository.
Do not merge/release this work as validated until checks and staging smoke pass.

**Manual QA sequence:**
1. Employee: search/status/sort, CSV export of filtered results, import preview,
   duplicate employee IDs, blank IDs, malformed quotes, and partial-failure warning.
2. Runs: next-period suggestions while filtering to posted/draft/void, overlap
   warning, inverted date range, manual date edits surviving a query refresh.
3. Payslips: switch selected employee without clearing the URL first; search,
   status and outstanding amounts before/after a partial payroll payment.
4. Payments: search date/method/reference; posted/reversed filter and reversal.
5. Responsive/mobile, keyboard navigation, restricted role access, and authenticated
   staging employee→salary→run→approve→post→pay→report.


### Follow-up validation and constraint alignment (November 6, 2026)

- Payroll organisation default and employee payment-method choices are now
  `bank_transfer`, `cash`, `cheque`, `other`, matching the existing
  PostgreSQL CHECK constraints and the RPC validation. Manual payment
  confirmation remains available when **recording a payment**, which has
  separate settlement-method handling. No schema migration was required.
- Employee and CSV import dates now reject impossible dates, including
  invalid leap days and SQL's unsupported year zero. CSV rows with a different
  number of cells from their header fail validation before writing.
- The CSV preview rejects files exceeding 1 MB **before** reading them into
  browser memory; the parser also enforces its own character/row limits.
- CSV re-import now preserves legitimate leading apostrophes in names and
  reverses the exported spreadsheet-formula prefix only for formula-like
  leading characters.
- Isolated direct execution of the exact current source function bodies
  (with TypeScript type annotations removed for JavaScript evaluation):
  **12/12 employee-import scenarios and 8/8 calendar-date cases passed**.
  These are focused, non-CI behavior checks. They do **not** validate
  TypeScript compilation, rendering, database transactions, authentication,
  accessibility, production builds or E2E workflows.
- Explicit user instruction: **do not run GitHub CI steps**. All further
  commits use `[skip ci]`; no workflow reruns or dispatches are requested.
  The full local app build/test suite and authenticated staging smoke remain
  outstanding. Do not label this payroll module production-ready on the
  basis of source-level checks alone.


### Filtered payroll CSV exports (November 6, 2026)

- **Payslips** now offer an **Export filtered CSV** action only when the user has
  both `payroll.view` (page access) and `payroll.reports.view` (export access).
  The export includes exactly the currently displayed filtered/sorted records,
  without hidden employees or runs being added back to the output.
- The payslip export includes employee ID/name, run, dates, payment status,
  **currency per row**, gross earnings, employee deductions, net, paid and
  outstanding. Amounts use plain decimal precision for that row's currency;
  there is deliberately **no cross-currency grand total**.
- Outstanding net pay is now calculated by the shared `payslipNetBalances`
  helper for both the table and the export; zero is the lower bound.
- Spreadsheet formula prefixes in employee names are escaped by the shared
  CSV writer. Both payslip and employee downloads include a UTF-8 BOM for
  non-English characters and Excel compatibility.
- The employee export uses the currently displayed **sorted, filtered**
  employees, rather than the server's default order.
- Added `src/lib/payroll/payslip-list-export.test.ts` with amount,
  permission-independent output, mixed-currency, row selection, and formula
  injection regression cases. The test file is committed but Vitest remains
  **not executed** in this repository session.
- **Non-CI verification:** Direct evaluation of the actual export helper
  together with the existing money and CSV writer source passed **8/8**
  focused behavior checks. This is not a React/TypeScript compile, browser,
  role-authenticated, or end-to-end confirmation.

Manual QA should verify that a payroll viewer without
`payroll.reports.view` cannot see the payslip export action, that changing
employee/payment-status filters changes downloaded rows, and that currencies
are never combined into a meaningless grand total.


### Pay-run dates and payment integrity hardening (November 6, 2026)

- Suggested pay dates now support the configured **negative** schedule offsets,
  rather than clamping them to zero. Invalid schedule/start dates are rejected,
  including rolled-over days, invalid leap days, and year zero. The validator
  is shared by employee entry and Payroll settings.
- The payment form rejects malformed, non-positive, stale, unsafe-integer, or
  foreign-currency payslip allocations **instead of silently dropping them**.
  It validates the entire entered allocation map before sending a payment.
- When entering payments from a specific run, both outstanding candidate
  payslips and the generic bank CSV export are scoped to that run.
- Payment forms require successful Payroll settings and outstanding-payslip
  loads before posting. The payroll settings currency is used for input
  precision, rather than assuming the organisation's base currency.
- The existing SQL `record_payroll_payment` function posts with FX rate 1.
  Therefore the frontend **and server function** now prohibit non-base-currency
  payroll settlements until proper journal FX conversion is implemented.
  The server also rejects payslip allocations whose run currency differs
  from the settlement currency, and rejects money outside safe JS integers.
- **Database-layer protection (subsequently completed):** The privileged
  `record_payroll_payment(JSONB)` RPC is callable by eligible users directly.
  The database now enforces the settlement rules independently of that RPC
  through triggers on `payroll_payments` and `payroll_payment_allocations`.
  See the applied migration and its test status below.
- New Vitest regression cases cover payment-form allocation validation,
  invalid/early calendar dates and signed payment-date offsets. The full
  repository Vitest/typecheck/lint/build and authenticated browser suite
  have **not** been run. Isolated non-CI behavior checks for this round
  passed **11/11** payment-form cases, **8/8** period suggestion cases and
  **7/7** shared date-validation cases. Static source assertions passed
  **11/11**. These checks are not proof of deployment readiness.

### Database settlement guard — applied and verified (November 6, 2026)

The production Supabase project `ipxflpzfcqwtenodbxwc` now has the applied
migration `20261106073653_payroll_payment_currency_guards`, matching the
GitHub source file
`supabase/migrations/20261106073653_payroll_payment_currency_guards.sql`.

- An INSERT or currency/company UPDATE to `payroll_payments` is blocked
  unless the payment currency equals **both** the organisation base
  currency and the configured Payroll settings currency. This is required
  because the existing accounting posting RPC uses FX rate 1.
- Each INSERT or critical reference UPDATE to
  `payroll_payment_allocations` must match its payment, payslip, run,
  employee and currency. This protects the underlying tables even when an
  eligible user calls `record_payroll_payment` directly rather than through
  the frontend/server function.
- Both trigger functions use a fixed `public, pg_temp` search path and
  `SECURITY DEFINER` so they can verify cross-table references; direct
  EXECUTE is revoked from `PUBLIC`, `anon`, and `authenticated`.
- Verification on the connected database: the migration compiled in an
  explicit rolled-back DDL dry run; both triggers are installed/enabled;
  `authenticated` and `anon` cannot execute their helper functions.
  Direct negative inserts for missing settings/payment/payslip relationships
  raised the intended database CHECK error. **No test payment or allocation
  record was retained**.
- Existing database data at verification: 0 Payroll payments and
  0 Payroll allocations; no reconciliation or modification was required.
- The repository includes
  `tests/integration/basic-payroll-payment-currency-guards.sql` with
  transaction/rollback fixtures for valid base-currency payments, rejected
  foreign-currency payments and allocations, and rejected run reassignment.
  **That full SQL integration test has not been run** on an isolated database.
  No existing Payroll settings rows were present on the live database, so
  full valid-production-payroll lifecycle smoke could not be performed.
- Remaining quality gates: full application typecheck/lint/Vitest/build,
  isolated SQL integration test, and authenticated end-to-end Payroll QA.
  GitHub CI was **not run per user instruction**.


### Payment form precision and retry hardening (November 6, 2026)

- Payment amount and each allocation must have no more fractional decimal
  places than the selected currency supports: e.g., **GBP: 2**, **JPY: 0**,
  **KWD: 3**. This is important because ordinary
  `toMinorUnits` rounding is acceptable for calculated prices but must
  not silently change the exact amount entered for a bank settlement.
- Existing grouped amounts remain accepted (`1,234` JPY), while over-
  precision amounts such as `12.345 GBP` and `123.4 JPY` are rejected
  before any server request.
- The payment entry dialog resets the previous clearing account, reference,
  memo, allocations and payment amount before each new payment. A pending
  submission prevents the dialog from closing or another new payment from
  opening, avoiding a new idempotency key for the same in-flight payment.
- Clearing-account loading errors are shown explicitly and payment
  submission remains disabled until the account list succeeds.
- Isolated non-CI execution of the exact current form/payment allocation/
  minor-unit functions passed **16/16 behavior scenarios**. Direct
  Settings validator execution passed **6/6 scenarios**.
- SQL test fixture now creates its own company membership and tax settings
  and checks attempted mismatched run-employee reassignment. This rollback-only
  test is **committed but has not been executed on isolated PostgreSQL**.
- Full repository Vitest, typecheck, lint, production build, browser QA,
  and GitHub CI are **not run** in this session. GitHub CI was not run per
  user instruction.


### Local calendar date defaults (November 6, 2026)

- The new-payment and reverse-payment forms previously used
  `new Date().toISOString().slice(0, 10)` (UTC day). That could populate
  yesterday or tomorrow for staff in non-UTC time zones near midnight.
- These defaults now use `todayLocalDateOnly()`, based on the user's
  local calendar, both on initial form load and when opening a new payment
  or reversing a previous payment.
- `src/lib/payroll/local-date.test.ts` adds midnight and leap-day
  regression cases. Isolated execution of the exact current helper passed
  **5/5 cases**, including the local midnight and year boundary.
- This does not select a date based on the organisation's IANA timezone;
  user/local browser calendar is the UI default. Users can change the
  date before recording.
- Full Vitest, TypeScript, lint, build, authenticated browser tests and
  GitHub CI were not run. GitHub CI remains **not run per user instruction**.


### Salary entry integrity and employee local-date defaults (November 6, 2026)

- The new Payroll employee form defaults the hire date to the **user's local
  calendar day** rather than the UTC date, consistent with payment and reversal
  forms. The user can still choose an earlier/later date.
- Salary assignments now reject impossible effective dates before any server
  submission (e.g. `2026-02-30` and year zero); valid leap dates are accepted.
- Salary structures and custom salary versions now parse fixed and rate amounts
  **exactly**, rejecting negative/malformed values and extra fractional digits
  instead of silently rounding. Precision matches the currency
  (`GBP=2`, `JPY=0`, `KWD=3`).
- The database line bound `900000000000000` minor units is enforced before
  converting to a JavaScript number. Invalid, negative, exponential and overly
  precise percentage strings are rejected rather than silently becoming
  `0` basis points. The SQL maximum `1000000` basis points (10000%)
  remains enforced.
- Regression tests for the salary parser and integration with
  `parseSalaryStructureDraft` and `parseSalaryAssignDraft` are committed.
  Focused **isolated direct-source** salary parser tests passed **20/20**;
  the actual Vitest, typecheck, lint and build were not executed in this
  environment. These checks do not establish production readiness.


### Salary line completeness guard

Payroll salary structures and salary-version custom lines can contain blank
placeholder rows. Blank rows still remain optional, but any line with a
nonzero, malformed or nonempty salary field (or notes on a custom line)
without a selected pay component now **fails validation** rather than being
silently skipped. This prevents unintentionally omitting salary or deductions
from the employee's remuneration configuration.

- New `src/lib/payroll/salary-input.ts` validates exact minor amounts,
  database maximum and basis-point percentages. Its dedicated Vitest test
  file covers GBP, JPY, KWD, malformed inputs and limits.
- Updated `src/lib/payroll/employee-draft.test.ts` covers invalid salary
  effective dates and omitted pay components with populated salary values.
- Direct isolated source checks from this continuation: **20/20** pure salary
  input cases; **16/16** mixed source/date/line-integrity assertions.
- Full app Vitest/typecheck/lint/build, isolated SQL fixture, browser E2E,
  PR merge and deployment remain unverified; GitHub CI is
  **Not run (per user instruction)**.


### Bank and clearing-account currency integrity (November 6, 2026)

The payment RPC currently uses `fx_rate_to_base = 1`, so even a base-currency
payroll settlement must **not** credit a foreign-currency bank account.

- Frontend Payroll Payments now hides clearing GL accounts whose explicitly
  configured `currency_code` differs from payroll payment currency and
  explains why incompatible accounts are excluded. A GL currency of `NULL`
  remains supported for the organisation's default-currency account.
- The `recordPayrollPayment` server function checks `accounts.currency_code`
  **and every active `bank_accounts.currency_code` linked to the selected GL
  clearing account**. A different or unrecognised linked bank currency rejects
  the payment, rather than posting at an invented FX rate.
- Direct SQL calls remain guarded by the new `payroll_clearing_account_currency_guard`
  trigger on `public.payroll_payments` (insert and payment currency/company/
  clearing-account changes). The helper is `SECURITY DEFINER`, has a fixed
  search path and is **not executable directly by anon/authenticated**.
- Supabase project `ipxflpzfcqwtenodbxwc` has the new migration
  `20261106081734_payroll_clearing_account_currency_guard` applied. The
  committed source uses the exact applied filename
  `supabase/migrations/20261106081734_payroll_clearing_account_currency_guard.sql`.
  Together with the previous Payroll guard migration, the connected database
  now has **3 enabled currency-guard triggers and 3 restricted helper functions**.
  Payment and allocation counts remained **0** after verification. The current
  Supabase security advisor reported **no new finding for the guard helper**.
- The new DDL compiled successfully in an explicit rolled-back dry run
  **before applying**, and verification confirmed the dry run left no trigger
  behind. The full rollback-only SQL integration fixture was extended to
  exercise mismatched GL and linked bank currencies, but was **not executed**.
- Isolated runtime checks for `payrollClearingCurrencyMismatch` passed **9/9**
  and application/source/SQL integration-marker checks passed **8/8**.
  These are **not** a full application typecheck, Vitest suite, Postgres
  integration test or browser E2E. GitHub Actions CI remains **not run**
  per user instruction.

**Release boundaries:** True FX payroll payment settlement, end-to-end posting
and reversal verification, full PostgreSQL fixture execution, application
build/typecheck/lint and Vercel deployment verification remain pending. The
current safeguard rejects unsupported foreign-bank posting; it does not add
currency conversion.


### Employee CSV import concurrency/review safety (November 6, 2026)

The Payroll employee import now guards against concurrent or rapid repeated
Import actions using a synchronous in-flight ref, instead of depending on
React's asynchronous disabled-button render alone.

- Import preview still compares against the **full, unfiltered organisation
  employee ID list** and never updates existing employees.
- Confirmation now **re-fetches** that full list. Employee IDs created by
  another session between review and confirmation are skipped instead of
  causing an avoidable import stop. The existing SQL RPC independently rejects
  collisions even if they occur after this last check.
- Preview/confirmation share a tested pure
  `planPayrollEmployeeImport` helper. Blank IDs intentionally remain distinct
  new employees with server-allocated employee numbers; duplicates present in
  a batch cannot be attempted twice.
- Progress now reports **processed** rows, including new skips, and success
  feedback counts already-existing and newly-skipped IDs.
- The in-flight lock is released in each `finally` path; confirmation UI
  stays closed after batch completion and the employee list is invalidated.
- Added `src/lib/payroll/employee-import-plan.test.ts`: dedicated Vitest
  cases for stale IDs, blank IDs, within-file duplicates and whitespace.
  The complete repository Vitest suite was not run. Direct execution of
  current committed helper source passed **9/9** focused scenarios, with
  **8/8** component/source assertions.
- A mid-batch SQL failure still leaves earlier saved rows in place and
  prevents later writes. **The CSV import is not an atomic DB transaction**.
  Users continue to receive a partial-success warning if this occurs.


### Payroll payment retry idempotency integrity (November 6, 2026)

The database `record_payroll_payment(jsonb)` RPC previously returned the
payment linked to an existing idempotency key **without checking that the
new request matched the original payment**. A changed amount, clearing
account or payslip allocation could therefore appear to have been posted
even though only the earlier payment existed.

- New versioned migration
  `supabase/migrations/20261106084934_payroll_payment_idempotency_payload_guard.sql`
  replaces the existing RPC in place. It was applied to Supabase project
  `ipxflpzfcqwtenodbxwc`; its filename matches Supabase's recorded version.
- When a key already exists, the RPC takes a row lock and compares the
  originally recorded payment date, method, amount, currency, clearing
  account, reference, memo and **canonicalized payslip allocations**.
  Canonical allocation sorting permits semantically identical retries even
  if array order or numeric JSON representation differs. A change to any
  of these fields causes a clear `23505` error rather than an incorrect
  successful replay.
- Replaying a reversed payment is also rejected; a new settlement must use
  a fresh idempotency key.
- The replay result now includes the actual previously recorded
  `unallocated_minor` amount, matching the fresh-payment response shape.
- The existing function's signed-in/company-membership/`payroll.pay`
  authorization checks, GL journal entry behavior, and transaction
  boundaries were retained. The `SECURITY DEFINER` function uses
  `search_path = public, pg_temp`.
- The revised function successfully compiled in a `BEGIN ... ROLLBACK`
  dry run before applying the migration. After deployment, read-only
  introspection confirmed the row lock, mismatch validation, reversed-
  status safeguard, returned unallocated balance and fixed search path.
  Existing payment/allocation counts remained `0/0`.
- Read-only PostgreSQL test
  `tests/integration/payroll_payment_idempotency_canonicalization.sql`
  was **actually executed: 9/9 cases passed**, covering unchanged/
  reordered allocations, numeric string normalization, changed amounts,
  changed payslips, added/removed or duplicated allocations and empty
  allocations. This is a database expression test, **not** an authenticated
  `record_payroll_payment` end-to-end posting/replay test.
- The remaining full Vitest/typecheck/lint/build, rollback-only fixture
  with synthetic organisational rows, authenticated UI + API tests and
  Vercel deployment verification have **not been run**. GitHub CI was
  **not run (per user instruction)**.


### Rollback-only Payroll currency guard integration verification and settlement date validation (November 6, 2026)

- Corrected and **executed** the end-to-end SQL currency-guard test fixture
  `tests/integration/basic-payroll-payment-currency-guards.sql` on the
  **connected Supabase database** inside an explicit `BEGIN ... ROLLBACK`
  transaction, after removing the psql-only `\\set ON_ERROR_STOP` directive
  for this execution. This was a transaction-only test against the connected
  environment, **not an isolated PostgreSQL test instance**.
- Aligned test setup with current schema: transaction-local
  `linkbooks.trusted=on` for creating synthetic company ownership; chart of
  accounts code length limit; bank account kind; explicit synthetic contact
  account number to bypass unrelated authenticated auto-number allocation;
  and `posted` payroll-run status. Restored the `DO $$` delimiter that an
  earlier text replacement had accidentally reduced to `DO $`.
- Verified in SQL: valid same-currency payment and allocation insertion;
  rejection of a foreign-currency GL on INSERT and UPDATE; rejection of a
  foreign linked bank; non-base currency payment INSERT and UPDATE
  rejection; cross-currency payslip allocation rejection; and rejection of
  changing allocation run ID or run employee ID. Also verified all 3
  currency trigger helpers are not callable directly by anon/authenticated
  and the clearing account guard trigger is enabled.
- A separate post-transaction query confirmed **0 fixture companies,
  contacts and GL accounts**, **0 Payroll payments or allocations**,
  and **3 active currency guard triggers**. The fixture's synthetic
  transaction did not persist.
- Added `src/lib/payroll/payment-date.ts` and regression tests; the
  `recordPayrollPayment` endpoint and both Payroll reversal endpoints
  now reject non-calendar dates including non-leap February 29 and
  April 31, rather than relying on format-only checks or PostgreSQL errors.
  **14/14 focused direct-source runtime and wiring checks passed.** The
  real Vitest suite remains unexecuted.
- **Still pending:** complete repository typecheck, lint, Vitest and build;
  authenticated RPC payment posting/idempotency/reversal and browser E2E
  verification; merge and Vercel application deployment. GitHub CI
  **not run (per user instruction)**.


### Verified SQL payment lifecycle (November 6, 2026)

The versioned `tests/integration/basic-payroll-payment-currency-guards.sql`
fixture now exercises **the actual authenticated-context SQL Payroll payment
RPC**, rather than only direct table writes. It was executed successfully on
the connected Supabase PostgreSQL instance **inside an outer transaction
that ends in ROLLBACK**. The synthetic identity and organisation exist only
within the fixture; this is not a full browser-auth session or an isolated
PostgreSQL instance.

In addition to the previous foreign-currency payment/allocation guards,
the fixture creates a valid balanced accrual journal with `post_journal`,
configures the net-pay liability and salary expense accounts, then verifies:

1. `record_payroll_payment` posts a new payment of 125 GBP minor units,
   allocates 50 to a posted-run payslip, leaves 75 unallocated, and updates
   `payroll_payslips.amount_paid_minor`.
2. Identical idempotency-key replay returns the **same payment ID and
   journal ID**, the unchanged unallocated amount, and `replayed=true`.
3. Mutating any of payment amount, allocation amount, payment date, payment
   method, clearing GL account, currency, reference or memo under the same
   key produces the expected conflict instead of an incorrect replay.
4. Exactly one settlement payment and one settlement journal are created
   for the reused key.
5. `reverse_payroll_payment` produces a reversal journal, marks the
   payment reversed and restores the payslip paid amount to zero.
6. Reusing the original key after reversal produces the expected conflict.
7. Earlier base-currency/GL/bank/allocation mismatch checks still pass.

**After executing the fixture:** an independent database query confirmed
0 fixture companies, contacts, GL accounts or journals; 0 total Payroll
payments or allocations; and the 3 Payroll currency guard triggers still
enabled. No test payment or journal persisted.

This validates the database posting/reversal paths with a *synthetic*
user identity set within a privileged rollback-only test transaction.
It does **not** verify real browser authentication, MFA, deployed app API,
end-to-end UI, full project Vitest/typecheck/lint/build or Vercel release
readiness. GitHub Actions CI was not run, per user instruction.
