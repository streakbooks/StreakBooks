# EM-07a — Reimburse posted claims from bank

**Result:** Partially completed — coded locally. Migrations not applied; partial/batch payout and payroll export remain later.

## Completed

- `reimburse_expense_claim` RPC: DR employee payable, CR bank; sets `reimbursement_status = paid` and `reimbursement_journal_id`.
- `post_journal` bridge allows `expenses.reimburse` for expense claim sources.
- Accrual posting marks employee-paid claims `awaiting_payment` when previously `eligible`.
- Reimbursements workspace with bank account picker and full-amount pay action.
- Unit tests for reimbursement eligibility and journal line builder.

## Not claimed

- Partial reimbursements, batch payment files, bank matching UI.
- Payroll payslip reimbursement path.
- Applied migrations / browser E2E / GitHub push.
