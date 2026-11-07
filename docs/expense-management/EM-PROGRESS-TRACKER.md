# Expense Management — Development Progress Tracker

Update after every verified batch. The visual percentage counts only **completed and locally verified** batches.

## Visual progress

**Development batches coded:** 1 / 12

`█░░░░░░░░░░░ 8%`

**Remaining batches:** 11

| Area | Status |
| --- | --- |
| Code Development | 1 / 12 verified |
| Local Testing | Partial (unit tests for EM-01; no DB/browser) |
| GitHub Commit | Pending until local commit recorded |
| GitHub PR / Merge | Pending |
| Database Migrations | Pending (SQL committed; not applied) |
| Application Deployment | Pending |
| Production Readiness | Not Verified |

## Batch checklist

| Batch | Scope | Status |
| --- | --- | --- |
| EM-01 | Audit, architecture, gap analysis, schema foundation, permissions | Verified locally |
| EM-02 | Navigation, dashboard, list/Kanban, employee profiles | Not started |
| EM-03 | Claims, lines, splitting, allocations, templates, lifecycle | Not started |
| EM-04 | Receipts, email inbox, file security, mobile capture, offline drafts | Not started |
| EM-05 | Approvals, policies, delegation, escalation, spending requests | Not started |
| EM-06 | Accounting, tax, journals, FX, refunds, budgets | Not started |
| EM-07 | Reimbursements, partial/batch payments, bank matching, payroll | Not started |
| EM-08 | Mileage, travel, per diem, advances, petty cash, settlements | Not started |
| EM-09 | Corporate cards, disputes, rebilling, exit settlement | Not started |
| EM-10 | AI OCR, categorisation, duplicates, fraud indicators | Not started |
| EM-11 | Reports, analytics, notifications, migration, exports, audit | Not started |
| EM-12 | Integration, security, performance, recovery, UX, release verification | Not started |

## Coexistence note

Until EM-03 cutover, live UI continues to use `/purchases/expenses` and `/purchases/employee-expenses` against `purchase_expenses` / `employee_expense_claims`. New `expense_*` tables are additive.
