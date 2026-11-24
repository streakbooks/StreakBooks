# Batch 02 — approved Coding Memory events and controls

Result: PARTIALLY COMPLETED; development and isolated verification, not a production release. Continues [draft PR #225](https://github.com/streakbooks/StreakBooks/pull/225). Main remains `a2a8a79efbf8ad11b0aa64bd00a7e64095ba0484`; previous draft head was `7bf972cf`. Runtime event/UI implementation: `cb2789b7`, followed by the bank-currency/evidence correction recorded in the final validation section. No merge or production mutation is authorised by this report.

## Delivered behavior

- A reconciliation-link trigger records one immutable learning event for each authorised, posted bank-coding journal. It verifies tenant/source/amount/currency, stores exact minor-unit allocation evidence, posted approver and time, bank account and source identities. Unique `(company_id, journal_id)` deduplicates repeated links and retries.
- Learning is atomic with link creation and audit. A failed link or event audit rolls the event back. A posted journal can still exist from the preceding posting RPC; existing idempotency remains responsible for safe completion on retry. This batch does not claim the entire posting-and-link sequence is one transaction.
- A caller-RLS read RPC counts only still-linked, matched/reconciled, posted, unreversed evidence for the same bank account, direction and currency. It rechecks the actual linked bank ledger line, amount, journal source and eligible GL account. Reversals and unmatches remove the precedent from recommendations without rewriting event history.
- Legacy aggregate counters are never backfilled as approved facts. The application no longer increments the old counter; authenticated execute/write privileges are revoked by the migration. Unmigrated environments show an explicit unavailable message and retain rule suggestions and existing coding.
- Enable/disable controls operate through caller RLS and existing MFA requirements, with immutable identity and mandatory audit. Repeated identical requests do not duplicate preference audit.
- Accepted, edited and rejected account feedback persists separately from learning. Selection feedback is marked as intention (`journal_id` null); a subsequent linked posting records accepted/edited account-level feedback in the same trigger transaction. Rejection or acceptance alone cannot create learning or accounting entries. Editing tax/contact/treatment while retaining the same GL mapping is not yet classified as edited feedback. Multi-account split events retain all allocation evidence but do not contribute to single-account hints; split-aware recommendation UX remains open.
- Feedback request IDs are tenant/actor-scoped. Retried requests deduplicate both rows and audit; reuse with a different payload is rejected. The UI keeps the request identity through automatic/manual retries.
- Existing Banking transactions now contain permission-aware Use suggestion / Reject, disable/re-enable, matching coverage, latest approved posting link and feedback context. Loading and failures are explicit. Company-keyed panels ignore late mutation callbacks after unmount.
- Bank coding now forwards the bank currency into the existing posting engine, so its established FX lookup/validation applies instead of implicitly defaulting to company currency. The posting engine is unchanged.

## Migration and object ownership

Migration: `supabase/migrations/20261117104621_bank_coding_memory_events.sql`, generated using actual Supabase CLI 3.2.0 after inspecting `--help` and `migration new --help`. The command only created a local file.

| Object                                  | Purpose / owner                                                 | Access and integrity                                                                                                                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bank_coding_events`                    | Banking owns approved evidence; accounting owns source journals | Immutable to clients, RLS read, source FKs and company/history composite FK, unique journal event, bank/history lookup indexes                                                                                         |
| `bank_coding_memory_preferences`        | Banking preference state                                        | RLS read/insert/update, no delete, MFA and current banking read/categorise grants, server-stamped actor/time, audited changes                                                                                          |
| `bank_coding_feedback`                  | Banking feedback history                                        | Client read only; scoped RPC/trigger writes, immutable to clients, unique request identity, distinguishes posted from selection feedback                                                                               |
| `get_bank_coding_memory`                | Authenticated source-grounded recommendations                   | SECURITY INVOKER, explicit company/read/MFA guard, caller RLS, bounded 101 matching rows with visible coverage                                                                                                         |
| `set_bank_coding_memory_preference`     | Preference mutation                                             | SECURITY INVOKER, strict server validation, RLS and audit trigger enforcement                                                                                                                                          |
| `record_bank_coding_feedback`           | Durable feedback API                                            | SECURITY DEFINER required to deny direct feedback-table forgery while allowing validated inserts; explicit auth/company/read/categorise/MFA checks, tenant/source validation, empty search path and restricted EXECUTE |
| Private capture/audit trigger functions | Trusted derived-event and mandatory-audit writes                | SECURITY DEFINER is limited to trigger operations; empty search path, qualified objects, no public/anon/authenticated execution grant. Independent security review remains a release gate.                             |
| Private preference stamp trigger        | Set actual actor/time                                           | SECURITY INVOKER; cannot forge audit actor through an editable payload                                                                                                                                                 |

The existing demo-reset chain is wrapped with the same permission/demo guards plus MFA/member checks, so authorised demo cleanup removes new dependent records before calling the previous reset. Denied or failed parent resets roll the deletion back. Production evidence retains restrictive source foreign keys; no ordinary cascading-delete bypass is introduced.

No second ledger, posting engine, period store or company model is introduced. Existing journals, accounts, bank lines, reconciliation links and history identities are reused. Reconciliation-only users retain their existing link workflow; they cannot teach new memory without categorise permission.

Applied only inside disposable, network-isolated PostgreSQL 17 fixture containers. Not applied to connected Supabase, staging or production. These fixture upgrades compile the new migration against extracted banking DDL and a reduced accounting/auth baseline. They do not prove a clean full-repository migration or a real current-production upgrade. Historical migration drift from Batch 01 remains unresolved; no migration repair/push was attempted.

## Validation commands and evidence

Cloud worktree `/workspace/work/streakbooks`; Node 24.19.0 and npm 11.9.0 with the authoritative lockfile installation. Tests execute real production domain code unless explicitly described as mocked/fixture.

| Exact command                                                                                                                                                     | Executed result                                                                                         | Scope / limitations                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test -- src/lib/banking src/lib/accounting/posting-engine.test.ts src/lib/accounting/period-close.test.ts src/lib/accounting/period-close.functions.test.ts` | 22 files; **208 passed, 0 failed, 0 skipped**                                                           | Unit and mocked server/posting boundaries, including bank currency and posting-rejection checks; not live financial E2E                                                                                    |
| `npm run test:banking:postgres`                                                                                                                                   | **59 assertions passed, 0 failed**                                                                      | New migration in isolated PostgreSQL 17; live SQL RLS/MFA fixture denial, approval/feedback/preference lifecycle, reversal/unmatch, retry/audit deduplication and concurrent relink/reversal sessions      |
| `npm run test:banking:ui`                                                                                                                                         | **5 passed, 0 failed, 0 skipped**                                                                       | Actual panel/shared UI with stubbed server/auth, Chromium 1440/768/375px, keyboard selection, rejection, preference controls, retry identity, migration absence and late-response company-switch isolation |
| Changed-file `npx eslint` (full file list below)                                                                                                                  | Passed, 0 errors/warnings                                                                               | Changed production TypeScript, focused tests and SQL runner; not full repository lint                                                                                                                      |
| `npm run check:ui`                                                                                                                                                | Passed: 683 TSX files, 185 routes, 0 violations                                                         | Source contracts, not a screen-reader audit                                                                                                                                                                |
| `npm run check:navigation`                                                                                                                                        | Passed: 23 files, 11 reporting tabs                                                                     | Source navigation audit                                                                                                                                                                                    |
| `npm run check:modules`                                                                                                                                           | Passed: permission/module/workspace/empty/error contracts                                               | No new top-level module or routes                                                                                                                                                                          |
| `NODE_OPTIONS=--max-old-space-size=6144 npm run typecheck`                                                                                                        | Earlier batch run: FAILED, 107 baseline diagnostics, none introduced; final-source check recorded below | Failure remains a mandatory repository release gate                                                                                                                                                        |
| `npm run build`                                                                                                                                                   | Earlier batch source build passed; final committed-source result recorded below                         | Local build only, existing deprecation warnings remain                                                                                                                                                     |
| GitHub CI, authenticated staging, production smoke, full-schema clean/upgrade, backup restore, p50/p95/500-client load                                            | NOT EXECUTED / not established                                                                          | No certification or invented counts                                                                                                                                                                        |

Changed-file lint command:

```sh
npx eslint src/components/banking/CodingMemoryPanel.tsx src/lib/banking/memory.ts src/lib/banking/memory.functions.ts src/lib/banking/memory.functions.test.ts src/lib/banking/suggestions.ts src/lib/banking/suggestions.functions.test.ts src/lib/banking/banking.functions.ts src/lib/banking/coding-server.ts src/lib/banking/coding-server.test.ts src/lib/banking/server-helpers.ts src/routes/_authenticated/banking/transactions.tsx scripts/test-coding-memory-postgres.mjs
```

Browser fixtures contain no account credentials, production URLs or real customer data; their API stubs do not prove browser-to-database integration. PostgreSQL uses an explicit local Docker socket, no published ports, no external network, and fixture-only auth helpers. Its 59 assertions are not substitutes for actual Supabase helper/RLS testing with two authenticated staging companies.

## Files changed in Batch 02

Added: `src/components/banking/CodingMemoryPanel.tsx`; `src/lib/banking/memory.ts`, `memory.functions.ts`, `memory.functions.test.ts`, `coding-server.test.ts`; the migration above; `scripts/test-coding-memory-postgres.mjs`; `playwright.coding-memory.config.ts`; `e2e/coding-memory/memory.spec.ts`; `tests/fixtures/coding-memory/setup.sql`, `scenarios.sql`, `ui/app.tsx`, `ui/index.html`, `ui/stubs.tsx`, `ui/vite.config.ts`; this report.

Modified: `package.json`; `src/lib/banking/banking.functions.ts`, `coding-server.ts`, `server-helpers.ts`, `suggestions.ts`, `suggestions.functions.test.ts`; `src/routes/_authenticated/banking/transactions.tsx`; programme tracker, requirement inventory and verification report. No files removed. The obsolete application history-increment helper was removed from `server-helpers.ts`.

## Release, compatibility and rollback

Draft PR #225 stays unmerged. No production migration, Vercel release or Windows checkout change was performed. Main and the separate messaging work are preserved.

The migration intentionally stops older clients from incrementing history via the old RPC; those clients already treat that logging failure as nonfatal. Reconciliation-link capture becomes the authoritative learning path once installed. Before rollout, test both old and new app builds against the migrated schema in authenticated staging. Do not deploy the migration solely on fixture evidence.

Rollback code by a new revert commit, preserving published history. Keep evidence/feedback tables and audit records. If migration rollback is needed, review a forward compatibility migration that disables the new capture trigger and new feature RPC grants; do not automatically restore the old unverified-counter path or drop evidence. Migration lock duration, backups/restoration and actual rollback execution are unverified release gates.

## Remaining acceptance and next executable work

The programme is still **0/53 full criteria acceptance-verified**. This batch adds working portions of CM-01/02/03/04/06/08/09/10; this does not certify those complete criteria or Gate 0. Phases 2–7 are not complete.

1. Reconcile remote/local migration provenance and compare actual Supabase helper definitions. Establish an authenticated isolated Supabase/staging database and replay the complete upgrade with backups and source policies.
2. Independently review privileged trigger/feedback code; test real permission revocation/MFA, audit failure rollback, old-client compatibility, native journal evidence links, posting/reversal races and browser→API→database flows.
3. Complete tax/contact/treatment/split preference semantics, governed historical backfill (currently none), authorised preference reset/retention, full evidence/feedback history and scalable coverage beyond the 100-match boundary. Feedback is currently GL-account-level; no calibrated confidence claims are made.
4. Verify currency/FX end-to-end for company/base and foreign bank currencies, effective dated tax treatments, high-value minor units, reversals, corrections and concurrent confirmation on the actual engine.
5. Measure recommendations and event capture under realistic histories, record p50/p95 and migration lock behavior. Complete accessibility with screen readers and full-company navigation/browser checks.
6. Once Phase 1 contracts/gates pass, implement Error Shield's persistent detector runs/coverage/resolution, atomic Live Close, scalable Mission Control and evidence-governed Financial Brain, followed by the full Phase 6/7 integration and release programme.

## Safe Windows review

Do not switch or clean the existing messaging checkout with its untracked work. Use a separate worktree; if the review branch/directory already exists, stop and inspect it rather than overwriting it.

```powershell
cd D:\MyApp\StreakBooks
git status
git fetch https://github.com/streakbooks/StreakBooks.git feature/financial-intelligence-foundation
if ($LASTEXITCODE -ne 0) { throw "Fetch failed." }
git worktree add -b review/coding-memory-batch02 D:\MyApp\StreakBooks-memory-review FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw "Worktree creation failed; inspect existing work." }
cd D:\MyApp\StreakBooks-memory-review
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw "Installation failed." }
npm.cmd test -- src/lib/banking src/lib/accounting/posting-engine.test.ts src/lib/accounting/period-close.test.ts src/lib/accounting/period-close.functions.test.ts
if ($LASTEXITCODE -ne 0) { throw "Tests failed." }
npm.cmd run test:banking:ui
```

The PostgreSQL runner requires a local Docker daemon at the explicit Linux socket; run it in the cloud/Linux workspace. It intentionally does not inherit a remote Docker context. These review commands do not apply migrations. Authenticated app review uses the existing secure local environment and http://localhost:8080.

Manual review: Banking → Transactions → Code; select/reject and edit/post; observe selection-only versus posted account feedback; disable/re-enable; follow latest posting; reverse/unmatch and confirm exclusion; revoke permissions/MFA and retry; switch company with an in-flight request; verify desktop/tablet/mobile, keyboard, screen reader and native new-tab/back/refresh. Use isolated test companies for financial actions.

## Final source validation

Runtime TypeScript/React source `188bbc71e2dc6f1040f209bdd65beabe941f81dc`: local `npm run build` passed (exit 0); final full typecheck failed with exactly the same 107 diagnostic lines as detached main, zero introduced/removed. Latest schema/test compatibility commit is [`a83cc45b`](https://github.com/streakbooks/StreakBooks/commit/a83cc45b22a0e80c95e178aee0b367f3454c0944); PostgreSQL passed 59 assertions against that final migration. Unit suite remains 208/208 and isolated browser suite 5/5. No release gate is waived.

Machine-readable actual result summaries: [BATCH-02-EVIDENCE.json](BATCH-02-EVIDENCE.json). Final source file inventory above also includes this evidence file.
