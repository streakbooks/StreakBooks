# Feature: fail-closed ledger health contract and authorization

**Priority:** P0 · **Date:** 4 November 2026 · **Scope:** additive TypeScript-only, no data or schema migration.

## Existing behavior
The read-only `public.ledger_health_check(jsonb)` SQL function returns eight source-backed checks for each authorized company: trial balance, unbalanced entries, orphans, document journals, AR, AP, period locks, and automation. Its SQL checks both membership and `accounting.view`. The TypeScript parser previously converted a missing or empty `checks` array into an overall `pass`, and trusted numeric defaults of zero. The server wrapper checked only membership explicitly before RPC.

## Independent implementation
- Keep the original SQL accounting algorithms and database contents unchanged.
- Require all eight expected check keys; reject duplicate/missing keys, unsafe counters, a missing company ID, or a response for a different tenant. Unknown statuses or inappropriate `na` status become **fail**, never pass.
- Make `overallStatus([])` fail closed. True empty ledgers remain valid when the database actually returns all eight passing checks and zero journal/line counts.
- Enforce `accounting.view` at the server function boundary *before* calling the privileged RPC (the SQL must continue enforcing its own guard).
- Add pure parser and server authorization regression tests, including mismatch, denial, and missing-function behavior.

## Acceptance
1. Eight-source-check response may be green, including a genuinely empty ledger.
2. Zero/partial/duplicate check responses and other-company results cannot show green.
3. An unauthorized caller cannot trigger the privileged health RPC.
4. Full TypeScript, ESLint, Vitest, PostgreSQL tests and build green at exact feature commit.
5. Signed-in owner/bookkeeper/read-only users can read only authorized company results; a non-member or a user without accounting-view permission cannot. Requires authenticated staging review.

## Limitations / next steps
This protects the **presentation and authorization contract** only; it does not independently certify the eight SQL checks or transaction histories. The separate ledger posting, cut-off, period close, control reconciliation and zero/2/3-decimal FX matrix remain roadmap work. Do not alter posted client financial transactions, local credentials, or migrations as part of this change.
