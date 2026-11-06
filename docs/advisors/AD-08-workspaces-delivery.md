# AD-08 — Workspaces, tasks and documents

## Delivery model

Active Advisors engagements open a delivery workspace:

- Bookkeeping → monthly work periods + reconcile/source-docs/report/sign-off tasks
- Coaching → session periods + agenda/prep/notes/actions/follow-up tasks

Document requests are Advisors-native checklist items. Binary uploads continue to use the company documents subsystem when `advisors_clients.company_id` is linked (AD-07/AD-09).

## Admin

| Route | Purpose |
| --- | --- |
| `/advisors-admin/workspaces` | Open workspaces/periods, update tasks, notes |
| `/advisors-admin/documents` | Cross-workspace document request board |

## Persistence

Migration `20261106190000_advisors_workspaces_delivery.sql`.

No ledger posting and no second document storage bucket.
