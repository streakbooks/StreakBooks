# Superadmin status — 3 November 2026

Delivery branch: **main**, as the owner now explicitly requires. This supersedes
the older branch-only instruction. Latest synchronized starting main was `a7fe70e`;
PR #66 and its hosted apply were already merged. No Vercel commands or checks.

## Implemented in this continuation

| Capability                                                            | State        | Paths/evidence                                                                                     |
| --------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------- |
| Search businesses, users and accounting firms by name/email/record ID | IMPLEMENTED  | `PlatformSearch.tsx`, `platform.functions.ts`, hosted `platform_global_search`                     |
| Exact permission-checked record metadata                              | IMPLEMENTED  | `PlatformRecordDialog.tsx`, hosted `platform_record`; existing related-record authorization reused |
| Native record and relationship links                                  | IMPLEMENTED  | `PlatformResource.tsx`, `PlatformCustomer360.tsx`, `navigation.ts`                                 |
| Refresh, Back/Forward, another tab, keyboard search/focus             | IMPLEMENTED  | `e2e/platform/navigation.spec.ts`; real router and production components with synthetic API        |
| Invalid raw URL IDs surviving validation                              | FIXED        | Explicit `record: undefined` when rejected, plus unit/browser regression                           |
| Hosted public types                                                   | SYNCHRONIZED | Generated from the same Supabase project after apply                                               |
| Local lint/format scanning generated scratch bundles                  | FIXED        | Exclude only `work/`; tracked application/test/script source remains checked                       |

Staff metadata navigation uses existing platform permissions and audit. No new
customer plan, price, entitlement engine, tenant membership, ledger read policy,
posting behavior or accounting calculation is introduced. The previous supervised
support workflow and Customer 360 tabs are retained.

## Executed local evidence

- `npm test`: **221 files / 1,571 tests passed**.
- `npm run test:platform`: **25 browser tests passed**. Covers navigation, reload,
  Back/Forward, native new tab, related records, invalid ID, error/empty/permission
  states, keyboard navigation/focus, narrow viewport and existing support behavior.
- `npm run test:platform:postgres`: passed using disposable network-isolated
  PostgreSQL. Executes the 43 original pending migrations plus the support and
  navigation migrations against a minimal synthetic baseline. Runtime checks cover
  permissions, firm-only scope, MFA/live session, wildcard escaping, cap/order,
  exact records, request throttling, audit, lifecycle, concurrency and two rollbacks.
- Typecheck and production build passed. Full lint: **0 errors, 20 existing warnings**.
- Lookup audit: **131 declarations / 0 violations**. Native-navigation audit: passed.
- Production dependency gate: passed; **9 moderate affected-package entries remain**.
  No forced upgrades/downgrades were applied.

Browser API data is synthetic. The SQL harness reuses actual platform permission,
rate-limit and related-record functions but is not the full Supabase schema. These
checks do not substitute for a real authenticated second-person walkthrough, load
measurement or independent human review.

## Broader browser regression and GitHub outcome

Executed the existing suites locally as well: navigation **5**, PCM wake **6**,
voice **57**, practice **2**, corrections **8**, themes/PDF **5**, reporting **15**.
Together with platform **25**, this is **123 passed browser tests**. In this
workspace the legacy suites used the installed browser via
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`; the first wake launch
reported a missing bundled browser, then all six wake tests passed with that path.
No test assertions were removed or skipped.

[GitHub Actions run 41583439318](https://github.com/streakbooks/StreakBooks/actions/runs/41583439318)
for implementation commit `5f3b1f3` failed on both attempts before any steps ran
in all four jobs. The owner supplied the annotations: recent account payments
failed or the spending limit must be increased. The Ubuntu 26 runner notice is
not the failure. GitHub CI remains **BLOCKED** until the account owner resolves
billing/spending; no further manual retries are useful. Local results do not change
that status. No Vercel command or check was run.

## Hosted verification

Project: `ipxflpzfcqwtenodbxwc`. Applied and recorded:
`20261103051315_platform_search_navigation.sql`. The CLI created the original
unpublished file at `20261103044725`; it was aligned to the actual migration-service
version before commit. Published history was not renamed or repaired.

- Public search and record wrappers are **SECURITY INVOKER** with empty search_path.
- Private helpers use guarded SECURITY DEFINER with empty search_path.
- Anonymous EXECUTE denied; authenticated calls require current platform permissions.
- Authenticated-role tests with empty JWT claims were denied before customer reads;
  verification ran in a rolled-back transaction. No synthetic production staff or
  customer records were created.
- Generated database types refreshed. No ledger/tenant policy or customer row update.
- Both rollback scripts were executed only in the isolated test database. Navigation
  rollback restores the prior search, removes the new record RPC and retains audit.

Backup/restore evidence for the earlier hosted application is in the evening
2 November [handoff](../HANDOFF.md). This continuation does not claim to have
created a new backup or conducted that earlier restore itself.

## Advisor results and existing work

No ERROR findings before or after this migration. Authenticated executable definer
warnings decreased **251 → 250** after moving public search to an invoker wrapper.
Other security/performance counts did not increase.

Existing findings remain for review:

- Three intentional public anonymous definer endpoints and 250 authenticated ones:
  [execute-grant guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- [Leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains a warning.
- Private rate-limit buckets intentionally have RLS with no direct table policies;
  access is through guarded functions.
- [Unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
  [RLS initplans](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan),
  [permissive policies](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies)
  and a duplicate index require separate measured remediation.

## Still pending

The full A–H programme remains **PARTIAL**, not production-certified. See
[TASKS.md](TASKS.md) and [DEFECTS.md](DEFECTS.md) for the exact remaining billing,
workers, alerting, API, service desk, partner/sandbox, recovery and assurance work.
Test-mode provider credentials, a real second approver and independent human review
must come from authorized people. Do not fabricate completion of those gates.

## Operational workflows continuation

Connected `/platform/operations` with permission-scoped module navigation and
refreshable native record links. Added case ownership, priority, response deadlines,
phases, internal notes and close/reopen; incident ownership, severity, impact start,
phases, notes and resolve/reopen; segment archive/restore, paginated membership,
server preview, bulk add/soft-remove and revision-checked undo; release plans,
change evidence and rollback evidence. Customer 360 links to that business's cases.

Backend: seven guarded invoker RPCs over existing stores; shared platform audit,
optimistic revisions, row locks, field allowlists and per-actor idempotency receipts.
Shared remote LookupSelect searches eligible businesses/staff, caps pages at 25,
aborts obsolete lookups and exposes loading/error/retry states. Mutation forms
freeze during save; stale edits remain visible with explicit Reload latest.
A late preview is hidden when its selection differs from the current intent.

Applied `20261103055903_platform_operational_workflows.sql` to the same project.
The CLI's unpublished `054030` file was aligned to the migration service's actual
version before publishing. Generated public types refreshed. Verified seven public
invoker wrappers, empty search paths, no anonymous execution, only guarded private
entry points callable by authenticated users, and denial of empty-JWT reads/writes
inside a rolled-back transaction. No synthetic hosted customers/staff were created.
No ledger policies, posting engine, tenant permissions or payment provider changed.

SQL fixture passes lifecycle, idempotent replay, changed-payload refusal, ownership,
MFA/session/role denial, stale revisions, real membership previews, retained removed
associations, stale undo refusal and rollback. Two concurrent identical requests
both return successfully with one case effect. The disable script denies entry
points while retaining records/audit. Browser checks use the real components/router
with synthetic transport; they do not claim real second-person authentication.

Advisor delta: no ERRORs; authenticated public definer warnings **250 → 248**;
anonymous warnings unchanged at 3. Private RLS/no-policy INFO **1 → 2** for the
receipt table, deliberately accessible only through guarded functions. Unused-index
INFO **80 → 82** for the two new operational indexes before real traffic. Other
security/performance counts unchanged. Existing findings remain open as above.

Full support communications/time tracking, automated escalation, incident affected
service/organization links and root-cause/follow-up management still require work.
Release records do not constitute deployment orchestration. The full programme
remains partial; continue the remaining tasks rather than treating this batch as
production certification.

Final batch verification: **222 unit files / 1,574 tests passed**, **33 platform
browser tests passed**, current typecheck and production build passed. Full lint:
**0 errors, 20 existing warnings**. Lookup audit: **132 declarations, 0 violations**;
native-navigation audit passed. Production dependency gate passed with the same
9 moderate affected-package entries. Earlier 98 broader browser checks were not
rerun for this isolated operations addition; their prior passing evidence remains
separate. GitHub Actions remains blocked by account billing, not represented as green.

## Executing jobs and measured operational alerts

Implemented `/platform/automation`: background job queue/history, redacted attempt
errors, bounded retry/cancel/failed-record closure, rule configuration/enable/pause,
measured values, deduplicated alert history, acknowledgment, recovery and UTC quiet
hour labels. Server pagination caps pages at 25; roles cannot see or mutate modules
without the corresponding permission. Unknown and stale observations remain explicit.

Applied to `ipxflpzfcqwtenodbxwc`:

- `20261103060832_platform_workers_and_observed_alerts.sql`
- `20261103061120_platform_worker_dead_letter_guard.sql`
- `20261103061306_platform_worker_minute_alignment.sql`

Each CLI-created unpublished filename was aligned to the migration service's actual
version before commit. Public types regenerated. A resulting optional RPC-argument
type-check failure was corrected by omitting empty filters, plus a serializable
scalar result contract. Corrected typecheck completed with exit 0; no unsafe cast
was added to silence it.

The hosted **real pg_cron run** at **06:14:00 UTC, 3 November 2026** succeeded;
worker completion was `06:14:00.099823+00`, with both handlers processed. The first
observed 06:09 run also recorded `expire_support` and `check_operations` succeeded
on attempt 1. Recurrence alignment was verified true after the follow-up migration.
These are actual scheduled operational records, not seeded customers or browser
fixture execution. One observed duration is not a p95/SLO or production certification.

Only two fixed handlers execute. JWT roles cannot invoke the private worker;
public wrappers are invokers, anonymous access is denied, and empty-JWT context,
queue writes and direct worker calls were denied in a rolled-back hosted test.
No Vercel command, provider call, live charge or customer-ledger policy change.

The SQL harness passes actual expiry, actor attribution, observation/fire/repeat/
recovery/acknowledgment, injected dependency failure, rollback, backoff, dead letter,
manual retry, retained attempts, no automatic retry-budget reset, minute alignment,
explicit failed-job closure, permissions and disable-with-history-retained tests.
Full unit suite: **223 files / 1,577 passed**; current targeted boundary/migration
checks: **7 passed**. Platform browser suite: **40 passed**, using production UI and
synthetic transport. Typecheck/build and source audits passed. Lint has **0 errors /
20 existing warnings**. The previous production dependency gate still has 9 moderate
affected-package entries; this batch adds no dependency or lockfile changes.

Final advisors: no ERRORs. Authenticated public-definer warnings **248 → 247**;
anonymous 3/password protection 1 unchanged. RLS/no-policy INFO **2 → 6** for the
four deliberately RPC-only worker/attempt/alert tables; unused-index INFO **82 → 84**.
Other performance counts unchanged. Existing remediation links above still apply.

Remaining engineering includes provider-backed billing, dependency/removal notices,
API authentication/webhook delivery workers, trusted IP enforcement, partner/sandbox
provisioning, promotion review/recovery, measured AI spend and broader load/recovery
assurance. Additional financial/integration alert sources and external alert delivery
remain pending. This delivery does not mark the full master programme complete.
