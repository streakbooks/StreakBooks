# 007 — Resume the existing control plane with supervised support

Date: 2 November 2026. Branch: `chore/superadmin-continue`, existing PR #66.

## Authority and scope

The uploaded consolidated master execution prompt is preserved byte for byte in
`docs/superadmin-master-prompt.md`. Its branch-only instruction controls this task:
no main merge or production deployment without a new explicit instruction. The
owner separately prohibited Vercel pushes, deployment checks and connection work.
No Vercel platform commands or hosted superadmin migrations were run.

The directive permits fewer complete, tested features when the programme exceeds
a safe run. This batch completes the metadata customer view and supervised support
workflow, fixes approval and money-precision defects, and records the remaining
programme honestly. It does not certify batches A–H as complete.

## Reuse

Use `approval_requests`, `platform_support_grants`, `platform_audit` and the existing
platform permission/session helpers. Support permission alone cannot approve;
`approvals.manage` and a different person are required. An approved request enables
only the existing bounded journal-header diagnostic RPC. No ledger SELECT policy,
financial posting rule, tenant membership or customer entitlement is changed.

These changes extend the existing staff control plane. They are included operational
controls, not a newly sold customer module, metered feature or parallel entitlement
system. No new feature price or plan is created. Customer feature decisions still
use the existing entitlement and price registry.

The direct legacy grant path is blocked by a table trigger; old unapproved grants
cannot read through the updated RPC. Rollback must retain that guard. A separate
rollback script disables requests/reads and retains history.

## Schema and test limits

The CLI generated `20261102150940_supervised_support_workflow.sql`. Cursor's published
migration names include hours 24–61. To preserve that history and ensure the new
change follows all its prerequisites, the new, unpublished file was ordered as
`20261103000000_supervised_support_workflow.sql`. This is an ordering identifier,
not a claim it was applied on 3 November. Do not rename published migrations or
blindly push this history. Full CLI migration-history reconciliation remains open.

An isolated, disposable PostgreSQL 17 container is available here. It has no network,
exposed ports, hosted credentials or production data. The harness copies the actual
existing platform tables and permission/session helpers, then executes all 43 pending
Cursor migrations and the new workflow migration. The baseline supplies only the
minimal synthetic dependencies. PL/pgSQL resolves some dependencies lazily; compiling
DDL does not prove every old RPC works. Authorization/lifecycle/concurrency assertions
exercise the support workflow at runtime. This is not a full Supabase reset, hosted
schema equivalence check, restore test or independent human review.

Browser tests exercise production components using an explicit in-memory adapter.
They verify interaction and display; they do not impersonate a real signed-in user
or prove hosted delivery. The SQL harness verifies the database boundary separately.

## Customer access log

New requests disclose that reasons and events are visible to business members. Reads,
approvals, expiry and revocation record actor, reason, time, scope and expiry. Legacy pending/active requests are closed with a system reason so unbounded old
requests cannot block replacement. Original reasons and rows are retained. Legacy
private reasons are not retroactively disclosed; unknown actors remain null and legacy
scope is marked unverified. The member-scoped RPC is available after migration; a
new customer-facing settings screen is not part of this batch.
