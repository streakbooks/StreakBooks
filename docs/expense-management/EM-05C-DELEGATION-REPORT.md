# EM-05c — Approval delegation

## Delivered (local)

- `expense_approval_delegations` table with create / list / revoke RPCs
- Approver assert allows active delegates of current approvers
- Claim list / read allows active delegates
- Submit notifications also reach active delegates
- Approvals UI: create cover window, list, revoke; Action Center label for expense claims

## Migration

`supabase/migrations/20261107150000_expense_management_approval_delegation.sql` — committed, **not applied**.

## Not in this slice

- Escalation timers / multi-level approval chains
- Auto-expire jobs beyond date-window checks
