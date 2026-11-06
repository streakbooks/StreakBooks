# Firm & Clients — Manager Onboarding Escalations

## Scope and non-goals

This adds **opt-in** escalation to existing onboarding due-date reminders.
No client emails, SMS, access grants, accounting postings, journals, or
ledger changes. The existing assigned-staff notification job is unchanged.

## How to configure

As a firm owner or administrator with MFA, open **Firm & Clients → Onboarding
→ Manager overdue escalations**. Enable manager escalation and save the
first overdue day (1–30, default 3) and repeat interval (1–30, default 7).

No escalation notifications are sent until a policy is created and
**explicitly enabled**. Users may disable it again. The policy is versioned:
concurrent administrator changes require refreshing and retrying.

## Delivery and recipient authorization

Daily `pg_cron` job
`linkbooks-firm-onboarding-manager-escalations` is configured for
`35 1 * * *` (01:35, database cron timezone).

The private function `private.firm_onboarding_manager_escalations()`:
- Selects uncompleted, dated tasks overdue between the configured first
  day and 365 days. The day must match the repeat cadence.
- Reads existing `firm_client_assignments` for `lead` or `manager` roles.
- Requires an active firm/client link, firm membership, active company
  membership and effective `accounting.view` based on role permission
  plus grant/deny adjustments.
- Creates only **in-app** `action_notifications` of category `system`.
- Uses the existing unique notification event key to avoid duplicates.
- Writes an immutable escalation history entry in the same transaction
  only when a new notification is inserted.

Recipients need both an assignment and current client access. No
unassigned company administrator or unrelated firm member is notified.
Manager notifications are distinct from assignee reminders and may be
generated in addition to them when a manager also owns a task.

## Security and audit

- Policy table has firm-member read/admin-write RLS plus MFA.
- Event history is select-only for firm administrators with the required
  client access and an active link. It has an MFA restriction; no
  client-side INSERT, UPDATE or DELETE grant.
- The cron entry point is `SECURITY DEFINER` in the `private` schema,
  with an empty search path and no EXECUTE grants to client roles.
- History stores the firm, client, task key, recipient, delivery date,
  overdue age, and policy version; it does not store the client note.
- Removing a client's link prevents new escalations and hides its
  history through RLS. Removing manager assignment or denying
  `accounting.view` prevents new manager alerts.

## Validation

Run rollback-only `supabase/tests/firm_onboarding_manager_escalations.sql`.
It covers opt-in, disabled policy suppression, version conflicts, invalid
thresholds, non-admin denials, MFA, private history access, deduplication,
effective company permission denials, and cron registration.

Manual QA still required: two organizations and multiple firms,
policy save/reopen, manager assignment, reminders on the configured days,
history visibility after revocation, responsive layout and keyboard behavior.
Scheduled cron delivery has not yet been witnessed at its actual daily
wall-clock execution; the private function was tested synchronously.
GitHub Actions CI must **not** be run (per user instruction).

## Following roadmap

Batch 3: operational reporting, trends and safe CSV exports.
Batch 4: local unit/typecheck/lint/build/browser release QA and staging /
production verification. Merged code is not equivalent to production readiness.
