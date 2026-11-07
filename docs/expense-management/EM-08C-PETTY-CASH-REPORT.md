# EM-08c — Petty cash floats

## Delivered (local)

- `expense_petty_cash_floats` with target/balance and active/closed status
- Fund/replenish from bank: DR petty cash asset, CR bank
- `expense_claims.petty_cash_float_id` + link RPC for `company_paid` claims
- `post_expense_claim` supports company-paid: DR expense / CR petty cash; reduces float balance
- Petty Cash tab, settings petty cash account, My Expenses payment source option

## Migration

`supabase/migrations/20261107141000_expense_management_petty_cash.sql` — committed, **not applied**.

## Not in this slice

- Travel / per diem schedules (EM-08d)
- Physical cash count / variance journals
- Multi-currency float FX
