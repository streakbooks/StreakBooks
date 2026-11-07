# EM-08b — Cash advances issue and claim settlement

## Delivered (local)

- `expense_cash_advances` with draft → issued → partially_settled → settled lifecycle
- Issue journal: DR employee advance asset, CR bank (`expenses.manage_advances` bridge on `post_journal`)
- `expense_claims.cash_advance_id` + `link_expense_claim_cash_advance`
- `post_expense_claim` posts `cash_advance` claims as DR expense / CR advance asset and reduces remaining
- Cash Advances tab at `/expense-management/cash-advances`
- Settings: employee advance account (asset) picker
- My Expenses: payment source cash advance + link issued advance on save

## Migration

`supabase/migrations/20261107140000_expense_management_cash_advances.sql` — committed, **not applied**.

## Not in this slice

- Petty cash floats / replenishment
- Travel / per diem schedules
- Advance reclaim (unused cash returned to bank)
