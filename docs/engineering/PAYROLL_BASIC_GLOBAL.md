# Basic Global Payroll

| Field | Value |
|-------|-------|
| **Module route** | `/payroll` (authenticated) |
| **Branch foundation** | `feature/basic-global-payroll-batch-1-foundation` |
| **Batch 7 focus** | Security smoke tests, docs honesty, UX polish (setup checklist, empty states, Feature Manager readiness), unit test coverage |
| **Production claim** | **Not production-ready** for live payroll until staging smoke passes (migrations alone are insufficient) |
| **LinkBooks production DB** | Foundation migrations applied **2026-11-05** on the linkbook Supabase project; `/payroll` is reachable — still verify on staging before claiming readiness |

## Scope (what ships in code)

- Organisation payroll settings, pay schedules, and component catalogue.
- Employee master, masked payment details (writes via RPC; no full bank numbers via client SELECT).
- Salary structures and effective-dated assignments.
- Pay runs (calculate → review → approve), payslip snapshots, ledger accrual posting.
- Net-pay payments with payslip allocations and generic bank CSV export (manual upload only).
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
