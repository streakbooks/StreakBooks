# EM-08a — Mileage rates and mileage claim lines

## Delivered (local)

- `expense_mileage_rates` table with effective dating, currency, account, distance unit
- Mileage columns on `expense_claim_lines` (`is_mileage`, distance, rate, origin/destination)
- `save_expense_claim` recalculates mileage net as `round(distance × rate)` server-side
- RPCs: `list_expense_mileage_rates`, `save_expense_mileage_rate`
- Client helpers + vitest for calculation and rate mapping
- Mileage tab at `/expense-management/mileage`: admin rates + employee draft trip claims

## Migration

`supabase/migrations/20261107139000_expense_management_mileage.sql` — committed, **not applied**.

## Not in this slice

- Travel bookings / per diem schedules
- Cash advances and petty cash settlements
- GPS / map distance capture
- Batch import of odometer readings
