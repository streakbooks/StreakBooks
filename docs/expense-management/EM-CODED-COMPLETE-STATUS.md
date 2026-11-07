# Expense Management — coded-complete vs verified

**Date:** 2026-11-07  
**Branch:** local `main` (not pushed)

## Coded end-to-end (migrations committed, not applied)

EM-01 foundation through EM-12a release notes, plus gap closes:

- Approvals: decide, spending requests, delegation, escalation, multi-level
- Posting / reimbursements: accrual, full/batch/partial bank, payroll queue, refund, bank suggestions
- Capture: receipts upload/match, offline queue, risk/duplicates, OCR honesty
- Specialty: mileage, travel, advances+reclaim, petty cash, cards, disputes, rebilling, exit
- Reports / Action Center / legacy import / budgets bridge

## Blocked on external providers / ops (cannot finish in code alone)

1. Apply Supabase migrations on a live project (through `20261107156000`)
2. Authenticated browser E2E + staging/production verification
3. Inbound receipt email provider wiring
4. Live OCR provider wiring (beyond unavailable stub)
5. Payroll payslip posting for queued reimbursements
6. Travel booking integrations
7. Email/push notification delivery (Action Center in-app is done)
8. GitHub CI / PR / merge / Lovable sync (user forbade push unless asked)

## Verified batch count

Still **3/12** in `EM-PROGRESS-TRACKER.md` until migrations + browser gates pass. Do not inflate this from local commits alone.
