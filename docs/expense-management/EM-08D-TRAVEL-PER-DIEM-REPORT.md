# EM-08d — Travel / per diem

## Delivered (local)

- `expense_per_diem_rates` with location, daily rate, account, effective dating
- Per diem columns on `expense_claim_lines` (mutually exclusive with mileage)
- `save_expense_claim` recalculates `round(days × rate)` server-side
- Travel tab at `/expense-management/travel`: admin rates + trip draft claims

## Migration

`supabase/migrations/20261107142000_expense_management_travel_per_diem.sql` — committed, **not applied**.

## Not in this slice

- Flight/hotel booking integrations
- Multi-leg itineraries with mixed lodging + meals rates
- Policy caps by grade/city band beyond a single daily rate
