# EM-11a — Expense reports, CSV export, audit feed

## Delivered (local)

- `get_expense_management_report` — period totals, status buckets, open aging
- `export_expense_claims_report` — claim rows for CSV (requires `expenses.export` / audit / admin)
- `list_expense_claim_audit_events` — recent claim event timeline
- Reports tab UI with date range, aging cards, status tables, CSV download
- Formula-safe CSV helper coverage

## Migration

`supabase/migrations/20261107147000_expense_management_reports.sql` — committed, **not applied**.

## Not in this slice

- Scheduled email notifications
- Legacy employee-expense migration wizard
- Printable PDF packs / BI dashboards
