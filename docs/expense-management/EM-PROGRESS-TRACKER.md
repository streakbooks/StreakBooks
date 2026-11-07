# Expense Management — Development Progress Tracker

Update after every verified batch. The visual percentage counts only **completed and locally verified** batches.

## Visual progress

**Development batches coded:** 3 / 12

`███░░░░░░░░░ 25%`

**Remaining batches:** 9 (EM-04 in progress)

| Area | Status |
| --- | --- |
| Code Development | 3 / 12 verified (+ EM-04a receipts foundation coded) |
| Local Testing | Partial (unit + check:ui; no DB/browser) |
| GitHub Commit | Local commits only; not pushed |
| GitHub PR / Merge | Pending |
| Database Migrations | Pending (SQL committed; not applied) |
| Application Deployment | Pending |
| Production Readiness | Not Verified |

## Batch checklist

| Batch | Scope | Status |
| --- | --- | --- |
| EM-01 | Audit, architecture, gap analysis, schema foundation, permissions | Verified locally |
| EM-02 | Navigation, dashboard, list/Kanban, employee profiles | Verified locally (nav + overview KPIs) |
| EM-03 | Claims, lines, splitting, allocations, templates, lifecycle | Verified locally (core); Kanban/print/dimension pickers deferred |
| EM-04 | Receipts, email inbox, file security, mobile capture, offline drafts | In progress — EM-04a attachments + inbox foundation; email/OCR/offline pending |
| EM-05 | Approvals, policies, delegation, escalation, spending requests | Not started |
| EM-06 | Accounting, tax, journals, FX, refunds, budgets | Not started |
| EM-07 | Reimbursements, partial/batch payments, bank matching, payroll | Not started |
| EM-08 | Mileage, travel, per diem, advances, petty cash, settlements | Not started |
| EM-09 | Corporate cards, disputes, rebilling, exit settlement | Not started |
| EM-10 | AI OCR, categorisation, duplicates, fraud indicators | Not started |
| EM-11 | Reports, analytics, notifications, migration, exports, audit | Not started |
| EM-12 | Integration, security, performance, recovery, UX, release verification | Not started |

## Coexistence note

Legacy submit/approve remains on `/purchases/employee-expenses`. New multi-line drafts live under Expense Management → My Expenses after migrations are applied.
