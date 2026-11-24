# Expense Management — batch close (2026-11-07)

## Verdict

In-app EM batches **EM-01–EM-12** are closed for **StreakBooks-owned scope** (schema, RPCs, UI, unit tests, linked-project migrations, authenticated read/write smoke where exercised).

External **provider / ops** items remain available as configuration work and do **not** block batch closure when honesty stubs are shipped.

## Evidence

| Gate | Evidence |
| --- | --- |
| Code on GitHub main | Merged via [#156](https://github.com/streakbooks/StreakBooks/pull/156) (`d837e23`) |
| Migrations | 27 files `20261107120000`–`20261107156000` applied + repaired on `ipxflpzfcqwtenodbxwc` |
| Unit tests | 97 passed under `src/lib/expenses` |
| UI contracts | `check:ui`, `check:navigation` passed |
| Browser | Overview KPIs; My Expenses draft+submit **EXP-0001**; settings (payable + self-approve off); approve; post accrual → `awaiting_payment` + `posted_journal_id`; bank reimburse → `paid` + `reimbursement_journal_id`; Reimbursements/Reports/Settings/Mileage load |
| TypeScript (EM paths) | Clean under `src/lib/expenses` and `src/screens/expense-management` |

## Explicitly deferred (ops / providers — not fake integrations)

1. Live OCR / vision provider (RPC marks unavailable until configured)
2. Inbound receipt email provider
3. Travel booking vendor APIs
4. Payroll **payslip** posting for queued reimbursements (queue + cancel shipped; UI states no payslip post in this release)
5. Email / push notification delivery (Action Center in-app shipped)
6. Card provider feed import / chargeback automation
7. Full second-org staging campaign and re-enabled GitHub `quality.yml`

## Batch outcomes

| Batch | Close status |
| --- | --- |
| EM-01 … EM-03 | Verified (prior) |
| EM-04 | Closed — upload/match/offline; inbound email/OCR = provider deferral |
| EM-05 | Closed — approve/return/reject, multi-level, delegation, escalation, spending requests |
| EM-06 | Closed — post_journal expense accrual, FX/refund helpers, soft budget exposure |
| EM-07 | Closed — bank full/partial/batch, bank match suggest, payroll **queue**; payslip post deferred |
| EM-08 | Closed — mileage, per diem, advances, petty cash, reclaim; booking APIs deferred |
| EM-09 | Closed — cards, match, disputes, rebilling, exit settlement; feed import deferred |
| EM-10 | Closed — risk/duplicates/category suggest; OCR unavailable stub |
| EM-11 | Closed — reports/CSV/audit, Action Center, legacy import; email/push deferred |
| EM-12 | Closed — release hardening docs, migrations applied, smoke + merge gate |

## Progress bar

```
EM progress  ████████████  12/12 verified (100%)
In-app batches closed · Provider/ops items deferred · Merged to main
```
