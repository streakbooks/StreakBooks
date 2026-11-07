# Expense Management — Development Progress Tracker

Update after every verified batch. The visual percentage counts only **completed and locally verified** batches.

## Mandatory end-of-batch status bar

At the **end of every EM phase/slice chat response and final report**, paste this visual bar (update counts from this file). Do not bury it mid-response.

```
EM progress  ███░░░░░░░░░  3/12 verified (25%)
Coded slices EM-04…EM-11a · Migrations not applied · Not pushed
```

## Visual progress

**Development batches coded:** 3 / 12

`███░░░░░░░░░ 25%`

**Remaining batches:** 9 (EM-04–09 in progress)

| Area | Status |
| --- | --- |
| Code Development | 3 / 12 verified (+ EM-04–11a slices coded; those batches not closed) |
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
| EM-04 | Receipts, email inbox, file security, mobile capture, offline drafts | In progress — EM-04a/b upload+match+offline queue; inbound email/OCR still pending |
| EM-05 | Approvals, policies, delegation, escalation, spending requests | In progress — EM-05a/b approvals + spending requests; delegation/escalation pending |
| EM-06 | Accounting, tax, journals, FX, refunds, budgets | In progress — EM-06a employee-paid accrual posting; FX/refunds/budgets pending |
| EM-07 | Reimbursements, partial/batch payments, bank matching, payroll | In progress — EM-07a full bank reimbursement; partial/batch/payroll pending |
| EM-08 | Mileage, travel, per diem, advances, petty cash, settlements | In progress — EM-08a–d core paths coded; unused-advance reclaim / booking integrations pending |
| EM-09 | Corporate cards, disputes, rebilling, exit settlement | In progress — EM-09a–c cards, disputes, rebilling, exit settlement coded; batch not closed |
| EM-10 | AI OCR, categorisation, duplicates, fraud indicators | In progress — EM-10a rule-based risk/duplicates/category + OCR unavailable stub |
| EM-11 | Reports, analytics, notifications, migration, exports, audit | In progress — EM-11a summary/aging/CSV/audit coded; notifications/migration tooling pending |
| EM-12 | Integration, security, performance, recovery, UX, release verification | Not started |

## Navigation note

Expense Management is a **top-level** sidebar module at `/expense-management` (not under Purchases). See `NAVIGATION-STANDALONE.md`.

## Coexistence note

Legacy submit/approve remains on `/purchases/employee-expenses`. Purchases spend-money remains on `/purchases/expenses`. New multi-line drafts live under Expense Management → My Expenses after migrations are applied.
