# Superadmin status — 2 November 2026 continuation

Branch: `chore/superadmin-continue`, [PR #66](https://github.com/rohitmehra86/LinkBooks/pull/66).
Cursor history through `3ace577` is retained; main `c672888` was merged into this
branch. This continuation is **not merged to main, not deployed, and not
production-certified**. No Vercel action was run.

## Completed in this batch

- Restored the exact uploaded master directive at `docs/superadmin-master-prompt.md`.
- Structured Customer 360: overview, team, subscription and permission-scoped billing
  events, with honest list caps, empty/error states and viewer-local timestamps.
- Connected bounded support requests to the existing approval inbox and actual
  scoped diagnostic grants. Self-approval and support-only approval are refused.
  Direct legacy grants cannot bypass the approval guard. No new ledger policy.
- Revocation, time-based expiry without a worker, expiry cleanup, member-readable
  access events, and audited diagnostic reads. Unknown legacy actors/reasons are
  not fabricated or disclosed retrospectively.
- Unsupported approval types cannot be marked applied; feature-grant form requires
  feature-management permission. Platform loading/errors no longer render blank.
- Fixed lifetime-value type failure and safe-integer overflow handling.
- Added repeatable Docker PostgreSQL component tests, browser component tests and
  a GitHub Actions job. Expanded static migration checks to include Cursor files
  50–61 and the new workflow.
- Extended public benchmark to 15 accounting products plus three SaaS controls;
  official public documentation only, no private competitor-console claims.

## Local verification

- `npm test`: **216 files, 1,521 tests passed**.
- `npm run test:platform`: **14 browser component tests passed**, including keyboard
  navigation and a 390px viewport. The test adapter uses synthetic data.
- `npm run test:platform:postgres`: **43 existing pending migrations + one new
  migration compiled** against a minimal synthetic baseline; actual support
  authorization/lifecycle/expiry/ACL assertions passed. Concurrent requests and
  concurrent approvals each produce exactly one committed effect. The disable
  rollback was also executed locally: reads/requests denied and audit retained.
- Lookup audit: **131 declarations, zero violations**.
- Native-navigation source audit: **23 files, 11 reporting tabs, passed**.
- Changed-source lint: **19 files, zero findings** at the recorded run; final changes
  are checked again before commit.
- Final typecheck and production build pass locally; GitHub run outcomes are recorded
  in the PR. A failed or pending job is not a passing certification.

The Postgres fixture copies actual platform permission/session helpers and table
DDL, and supplies minimal synthetic dependencies. PL/pgSQL resolves some statements
lazily. This does **not** prove every pending RPC, full Supabase migration history,
Auth HTTP flow, hosted schema equivalence or restored-backup recovery. Browser
component tests are not a real hosted second-user walkthrough.

## Hosted state (updated 2 November 2026, evening)

Backup taken and restore-verified, then all pending migrations through
`20261103000000` applied and recorded on the hosted project, plus
`20261103000100` (MFA policy coverage) and `20261103000200` (anon EXECUTE revoke).
Evidence and caveats: [HANDOFF.md](../HANDOFF.md#hosted-apply--2-november-2026-evening).
The section below is the earlier, superseded state.

## Unapplied and blocked (superseded)

`20261103000000_supervised_support_workflow.sql` is **UNAPPLIED HOSTED**. All 43
Cursor migrations `20261102190000` through `20261102610000` were executed only in
an isolated disposable fixture by this continuation. No hosted migration/backfill
was applied, and no provider call or production-data exercise was made.

No verified hosted backup/restore approval was received. A quoted approval phrase
in documentation is not confirmation. Test-mode provider credentials, a real
second platform approver, full schema/history reconciliation and a second person's
independent PR review remain outstanding. GitHub currently has no submitted reviews
on PR #66. Main merge requires a new explicit instruction under the uploaded prompt.

## Programme completeness

The full A–H programme remains **partial**. Jobs need workers; alerts need measured
observations/delivery; API keys need actual enforcement; finance drafts need connected
test-provider workflows; partner and sandbox metadata do not provision services.
No production certification or measured p95/SLO is claimed. The exact findings,
remaining work, paths and rollout gates are in
[RESUMPTION-20261102.md](RESUMPTION-20261102.md), the public benchmark is in
[benchmark-follow-up-20261102.md](benchmark-follow-up-20261102.md), and safe rollback
SQL is in [rollbacks/disable-supervised-support.sql](rollbacks/disable-supervised-support.sql).
