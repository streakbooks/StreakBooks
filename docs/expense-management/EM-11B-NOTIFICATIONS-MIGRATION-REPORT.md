# EM-11b — Expense Action Center notifications + legacy import

## Delivered (local)

- `expense_claim` Action Center category (preferences + `can_read_action_notification`)
- `private.notify_expense_claim_action` hooked from `private.expense_claim_event`
  - submit → approvers (excludes claimant)
  - approved / returned / rejected / reimbursed → claimant
- Preference-aware (default on; opt-out via Notification preferences)
- Legacy preview + import RPCs creating EM draft claims linked by `legacy_employee_claim_id`
- Settings UI: preview sample + import next 50 drafts

## Migration

`supabase/migrations/20261107148000_expense_management_notifications_migration.sql` — committed, **not applied**.

## Not in this slice

- Email / push delivery
- Automatic backfill of historical Action Center items
- Migrating legacy reimbursement journals (imports are drafts only)
