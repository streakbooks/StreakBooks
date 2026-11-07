# EM-07b — Batch reimbursement + unused advance reclaim UI

## Delivered (local)

- `batch_reimburse_expense_claims` — pays up to 50 selected claims via existing single-claim RPC
- Reimbursements UI: multi-select + Pay selected
- Cash Advances UI: Reclaim unused / partially used balances (RPC from EM-09c)

## Migration

`supabase/migrations/20261107149000_expense_management_batch_reimburse.sql` — committed, **not applied**.

## Not in this slice

- Partial amount within a single claim
- Payroll reimbursement path
