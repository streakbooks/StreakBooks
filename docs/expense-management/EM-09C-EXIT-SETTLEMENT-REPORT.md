# EM-09c — Employee exit settlement

## Delivered (local)

- `expense_exit_settlements` draft → finalized checklist
- Outstanding snapshot: open advances, open claims, unmatched/disputed card lines for the employee’s cards
- `reclaim_expense_cash_advance` — DR bank / CR advance asset for remaining float
- Finalize voids leftover drafts, reclaims open advances, blocks when submitted claims or open card lines remain
- Exit Settlement tab + loading/retry UX hardening across EM screens

## Migration

`supabase/migrations/20261107145000_expense_management_exit_settlement.sql` — committed, **not applied**.

## Not in this slice

- Automatic payroll final-pay export
- Soft-lock preventing new claims after finalize (admin process only)
- Provider chargeback automation
