# Expense Management — Development Progress Tracker

Update after every verified batch. The visual percentage counts only **completed and locally verified** batches.

## Mandatory end-of-batch status bar

At the **end of every EM phase/slice chat response and final report**, paste this visual bar (update counts from this file). Do not bury it mid-response.

```
EM progress  ████████████  12/12 verified (100%)
In-app batches closed · Provider/ops deferred · Merged to main (#156+)
```

## Visual progress

**Development batches coded:** 12 / 12

`████████████ 100%`

**Remaining batches:** 0 (provider/ops items listed in `EM-BATCH-CLOSE-20261107.md`)

| Area | Status |
| --- | --- |
| Code Development | 12 / 12 closed for StreakBooks-owned in-app scope |
| Local Testing | Unit 97; EXP-0001 full lifecycle (draft→submit→approve→post→paid); settings/approvals/reimburse/reports/mileage smoke |
| GitHub Commit | On `main` via [#156](https://github.com/streakbooks/StreakBooks/pull/156) |
| GitHub PR / Merge | Merged |
| Database Migrations | Applied 2026-11-07 on linked project `ipxflpzfcqwtenodbxwc` (27 files) |
| Application Deployment | Local Vite verified; Vercel not separately verified |
| Production Readiness | In-app ready; external providers still ops-configured |

## Batch checklist

| Batch | Scope | Status |
| --- | --- | --- |
| EM-01 | Audit, architecture, gap analysis, schema foundation, permissions | Verified |
| EM-02 | Navigation, dashboard, list/Kanban, employee profiles | Verified (Kanban polish optional) |
| EM-03 | Claims, lines, splitting, allocations, templates, lifecycle | Verified (core) |
| EM-04 | Receipts, email inbox, file security, mobile capture, offline drafts | Verified — upload/match/offline; inbound email/OCR = provider deferral |
| EM-05 | Approvals, policies, delegation, escalation, spending requests | Verified |
| EM-06 | Accounting, tax, journals, FX, refunds, budgets | Verified — soft budget exposure; envelopes remain Budgets module |
| EM-07 | Reimbursements, partial/batch payments, bank matching, payroll | Verified — payroll **queue**; payslip posting deferred |
| EM-08 | Mileage, travel, per diem, advances, petty cash, settlements | Verified — booking APIs deferred |
| EM-09 | Corporate cards, disputes, rebilling, exit settlement | Verified — card feed import deferred |
| EM-10 | AI OCR, categorisation, duplicates, fraud indicators | Verified — OCR unavailable stub until provider |
| EM-11 | Reports, analytics, notifications, migration, exports, audit | Verified — Action Center in-app; email/push deferred |
| EM-12 | Integration, security, performance, recovery, UX, release verification | Verified — see `EM-BATCH-CLOSE-20261107.md` |

## Navigation note

Expense Management is a **top-level** sidebar module at `/expense-management` (not under Purchases). See `NAVIGATION-STANDALONE.md`.

## Coexistence note

Legacy submit/approve remains on `/purchases/employee-expenses`. Purchases spend-money remains on `/purchases/expenses`. New multi-line drafts live under Expense Management → My Expenses after migrations are applied.
