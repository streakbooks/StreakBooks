# 008 — Permission-scoped platform search and record navigation

Date: 3 November 2026.

The owner now explicitly requires synchronization with GitHub and commits to
`main` only. This supersedes the older branch-only delivery instruction for the
continuing programme. Do not rewrite shared history or run Vercel commands/checks.

## Decision

Connect the existing platform search RPC to the console and extend its result
kinds to businesses, users and accounting firms. Search names, user email and
record IDs. Return at most 20 results with stable ordering, literal wildcard
escaping, the existing request limit, and per-resource platform permissions.
Record only the result count in the search audit event; do not persist the query
or returned names there.

Use native links to `/platform?section=…&record=…`. Add one exact-ID metadata RPC
that reuses the existing authorized related-record function. URLs work after
refresh, with Back/Forward, and in another tab. Relationship links are rendered
only when the viewer has permission for the destination. Database authorization
still applies to manually entered URLs and direct RPC calls.

TanStack merges validated search fields with raw URL fields. Invalid or inapplicable
record IDs must therefore be explicitly returned as `undefined`, rather than
omitted. A browser regression test covers this behavior. Both server input and
Postgres UUID/resource arguments also validate the boundary.

These are included staff operations under the existing `businesses.view`,
`users.view` and `firms.view` capabilities. They are not a new billable customer
module or a second entitlement/search/billing system. No new plan, price, tenant
membership, ledger policy or accounting calculation is introduced.

## Verification and reversal

Use the isolated Postgres fixture for actual role/MFA/session restrictions, firm-only
search, direct-record access, wildcard escaping, rate limiting, audit and rollback.
Browser tests use the production components and a real router with a synthetic API
adapter. They verify navigation and display, not a real second-user login.

The existing handoff records the owner's verified backup/restore and application
through `20261103000200`. The new migration contains functions/grants only; no
customer data updates. Current apply and verification evidence is recorded in
`docs/superadmin/STATUS.md` after execution. Types are regenerated from the same
project. `docs/superadmin/rollbacks/undo-platform-search-navigation.sql` restores
the old search and removes the new exact-record RPC; restore the previous app
before that rollback. Audit data and existing support controls are retained.

Local `work/` is a verification scratch directory. Exclude it from lint/format
scans, as with other generated output; continue checking all tracked application,
script and test source. This prevents compiled scratch bundles from dominating
local lint while retaining the same source gate as clean CI.
