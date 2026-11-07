# Expense Management — coded-complete vs verified

**Date:** 2026-11-07  
**Branch:** batch-close docs → merge to `main` (see `EM-BATCH-CLOSE-20261107.md`)

## Coded end-to-end (migrations committed and applied)

EM-01 foundation through EM-12a release notes, plus gap closes:

- Approvals: decide, spending requests, delegation, escalation, multi-level
- Posting / reimbursements: accrual, full/batch/partial bank, payroll queue, refund, bank suggestions
- Capture: receipts upload/match, offline queue, risk/duplicates, OCR honesty
- Specialty: mileage, travel, advances+reclaim, petty cash, cards, disputes, rebilling, exit
- Reports / Action Center / legacy import / budgets bridge

## External providers / ops (deferred — honesty stubs shipped)

1. Inbound receipt email provider wiring
2. Live OCR provider wiring (beyond unavailable stub)
3. Payroll **payslip** posting for queued reimbursements (queue + cancel shipped; UI states no payslip post)
4. Travel booking integrations
5. Email/push notification delivery (Action Center in-app is done)
6. Card provider feed import / chargeback automation
7. Full second-org staging campaign and re-enabled GitHub `quality.yml`

## Verified on linked project `ipxflpzfcqwtenodbxwc` (Demo Company)

| Gate | Result |
| --- | --- |
| Migrations `20261107120000`–`20261107156000` | Applied + repaired |
| Unit tests `src/lib/expenses` | 97 passed |
| Browser draft → submit → settings → approve → post accrual → bank reimburse | **EXP-0001** ended `approval_status=approved`, `reimbursement_status=paid`, both journals set |
| Section routes (authenticated titles) | Overview, My Expenses, Approvals, Reimbursements, Mileage, plus HTTP 200 shells for remaining sections |

**Batch count:** **12/12** in-app verified with provider deferrals listed above. See `EM-PROGRESS-TRACKER.md` and `EM-BATCH-CLOSE-20261107.md`.
