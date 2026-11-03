# 009 — Operational workflows on the existing platform stores

Date: 3 November 2026.

Extend the existing service-case, incident, segment and release tables rather than
introducing a second help desk, audit system or deployment controller. These are
included staff operations under the existing support, businesses and settings
permissions. They do not introduce a separately priced customer module, tenant
membership, entitlement engine or permission to read a customer ledger.

Use an operations workspace with server-side pagination, exact record URLs,
searchable shared record lookups, UTC storage and a displayed viewer time zone.
The database returns the permitted modules and management rights. Every write
requires current MFA/live-session authorization and a reason, locks the target,
checks its revision and records the before/after state in `platform_audit`.
Per-actor request receipts make an identical retry return its original result;
reuse of a request ID with different details fails. This is not a second audit log.

Cases support eligible staff assignment, priority, work phase, response deadline,
notes, closure and reopening. Incidents support assignment, severity, work phase,
impact start, notes, resolution and reopening. Assignment never grants access to
customer data. Legacy missing timestamps, priorities and severities stay unknown.

Segment changes require an authoritative preview for at most 100 distinct
businesses. Confirmation rechecks the revision. Removal and archival retain rows.
Undo restores the immediately applicable membership state using the existing
audit event, and fails after a later change. This affects grouping only; it does
not bulk-change subscriptions, permissions or entitlements. The old tag entry
point delegates to the same implementation and restores a removed association.

Release plans store notes and version, then separately record verified change and
rollback references. These are evidence records; no release action runs Vercel,
changes a deployment, or asserts that a deployment occurred. A legacy recorded
version is not backfilled with invented evidence.

Private definer entry points check permissions; public RPC wrappers are invokers.
Private helpers and receipt tables cannot be accessed directly. No new direct
customer-table policies are added. New indexes support company/status and open
case deadlines. A private receipt table intentionally has RLS with no client
policy; two initially unused indexes need real traffic before usage is measurable.

Reverse by reverting the Operations UI and executing
`docs/superadmin/rollbacks/disable-platform-operations.sql`. It revokes entry-point
access and preserves all records, notes, member associations and audit history.
This disable path is exercised only in the disposable SQL fixture.

The owner supplied GitHub's startup annotation: account payments/spending limit
prevent all four Actions jobs from starting. The Ubuntu runner migration is a
notice. Do not modify application code or retry runs to work around account
billing; continue local checks and report CI as blocked until the account is fixed.
