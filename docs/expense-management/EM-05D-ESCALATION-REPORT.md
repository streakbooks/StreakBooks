# EM-05d — Approval escalation

## Delivered (local)

- `approval_escalation_days` setting (0–90; 0 disables)
- List stale submitted/in_review claims past threshold
- Refresh pushes critical Action Center `expense_claim` alerts to approvers/admins/delegates
- Approvals UI: threshold editor, stale list, refresh button

## Migration

`supabase/migrations/20261107151000_expense_management_approval_escalation.sql` — committed, **not applied**.

## Not in this slice

- Scheduled cron auto-refresh
- Email/push delivery
- Multi-level approval chains
