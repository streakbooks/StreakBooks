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
