# EM-07c — Partial bank reimbursement + payroll queue

## Delivered (local)

- `reimbursed_minor` + payment ledger rows
- Partial `_amount_minor` on `reimburse_expense_claim`
- Payroll queue / cancel (channel flag; no payslip posting)
- Reimbursements UI: partial amount, payroll queue, refund last payment

## Migration

`20261107152000_expense_management_partial_payroll_reimburse.sql` — not applied.
