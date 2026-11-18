# Batch 05 — scoped Coding Memory reset

18 November 2026. Continuation of [draft PR #251](https://github.com/linkbusinessadvisory/LinkBooks/pull/251). This implements another part of CM-03 and strengthens CM-04; full programme acceptance and release readiness remain open.

## Resulting behavior

Banking → Transactions → Code → Supporting history and preferences now offers **Reset learned preference**. A confirmation identifies the payee, account and direction and explains that prior learning is forgotten only for this bank account and currency. Cancel and Escape do not write. Reset preserves journals, approval events and feedback, enables future learning, and records an audit receipt. The next approved posting can teach the preference again; history then displays its reset date. Selection and reset do not post an accounting entry.

Disable/re-enable previously used a company-wide history key, which could affect another bank's matching preference. New controls use company, bank account, currency and history together. Existing legacy choices remain the fallback until a scope is explicitly overridden; direct legacy writes are frozen.

The database assigns immutable event numbers and records a reset watermark, rather than relying on posting dates or browser time. A backdated approval made later is eligible as new learning. A repeated reset request returns the same receipt before checking current eligibility and never advances the watermark again. Feedback retries now also survive a later reset, reversal or unmatch. Fresh feedback still requires currently eligible evidence. Retries always recheck membership, MFA and both Banking permissions; reusing a request ID for another payload is rejected.

New control/reset tables have tenant/MFA read policies and no authenticated write grants. Private mutation helpers have fixed search paths and explicit checks; public endpoints are invokers. Company reset locks coordinate the existing guarded demo-reset workflow, and per-scope/request locks serialize conflicting controls and duplicate receipts. Bank and transaction row locks keep the derived bank/currency stable through the control commit, including concurrent bank-setting changes. Reset and its mandatory audit commit atomically. The established demo reset also cleans dependent controls/receipts and rolls everything back if its parent fails.

The dialog uses the shared accessible alert dialog, restores focus on cancel, and focuses the explanation after a successful reset removes its button. A late response after a company switch cannot update the new panel. Automatic and manual retries share the confirmed request ID.

## Verification

Final outcomes are recorded in [machine-readable evidence](BATCH-05-EVIDENCE.json). Runtime revision: [89f7078c](https://github.com/linkbusinessadvisory/LinkBooks/commit/89f7078cb1590de054b107afa600252f382fca70). The full unit, TypeScript, initial source-contract and Coding Memory fixture checks ran at [b267af8e](https://github.com/linkbusinessadvisory/LinkBooks/commit/b267af8e21c3ec2d81923f8a358c92d1274c6557); `src`, `e2e` and Coding Memory fixture sources are byte-identical at the final runtime. The later commit contains only the SQL scope-lock migration and its PostgreSQL runner coverage. Final database, shared-UI, real API/browser, lint, build, migration-identity and hygiene checks include that change.

| Item                           | Actual result                                                                                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task implementation            | Scoped reset and control hardening implemented; whole programme partial                                                                                                                                   |
| Pull request                   | Draft [#251](https://github.com/linkbusinessadvisory/LinkBooks/pull/251), open                                                                                                                            |
| Merge into main                | Not performed                                                                                                                                                                                             |
| Verified main snapshot         | [8c79ac08](https://github.com/linkbusinessadvisory/LinkBooks/commit/8c79ac08e1f21884395a6066a71267f04ffda6d5), fetched again on 18 November                                                               |
| Pre-merge GitHub CI            | Failed before job steps; [runtime run](https://github.com/linkbusinessadvisory/LinkBooks/actions/runs/44258135155); confirmed account restriction described below                                         |
| Unit tests                     | 591 files; 4,012 passed, 0 failed/skipped, at b267af8e                                                                                                                                                    |
| Integration tests              | Disposable Banking PostgreSQL: 111 assertions, 0 failed; workflow and platform commands also exit 0; real local API: 28 setup + 4 reversal + 9 MFA assertions                                             |
| Browser/E2E                    | Real localhost Auth/API: 8 passed; shared UI fixtures: 79 passed; Coding Memory fixtures: 7 passed; 0 final failures                                                                                      |
| TypeScript                     | Full check passed with 6 GiB heap at b267af8e                                                                                                                                                             |
| Production build               | Passed locally at final runtime; existing framework deprecations remain                                                                                                                                   |
| ESLint                         | Full repository: 0 errors, 0 warnings                                                                                                                                                                     |
| Source contracts               | UI: 702 TSX / 187 routes / 0 violations; 374 shared lookup declarations / 0 violations; modules/navigation, resolver, hygiene and migration-identity checks passed                                        |
| Supabase migrations            | Two new migrations applied only to the isolated database; clean replay records all 359 source versions exactly; CLI exits 1 during its service-health probe; independent host Auth/REST probes return 200 |
| Database advisors/helper smoke | 0 local security warning/error findings; 19 helper functions passed under caller `pg_temp`; INFO/performance and production are not certified                                                             |
| Vercel deployment              | Not deployed by this continuation                                                                                                                                                                         |
| Authenticated hosted staging   | Not executed; real local Auth evidence is separate                                                                                                                                                        |
| Production verification        | Not verified                                                                                                                                                                                              |

Discovery failures are not acceptance evidence. The initial unconfigured-heap typecheck was interrupted and replaced by the successful 6 GiB run. A cold real-browser run encountered Vite dependency reload, and two shared-UI fixture pages were blank during concurrent database recreation. Final serialized runs passed with the existing assertions and timeouts. Missing JWT setup in newly added fixture sessions was corrected before the final SQL pass. The concurrent reversal fixture accepts either of the engine's two precise reversal-denial guards and also verifies the committed reversal and absence of a link/event.

Earlier results remain in [Batch 04](BATCH-04-LOOKUPS-AND-VERIFICATION.md) with their original revision and scope.

## Rollout and remaining limits

The additive migrations are `20261118065451_scoped_coding_memory_reset.sql` and `20261118071316_lock_coding_memory_control_scope.sql`. The second closes a concurrent scope-change race and preserves the first published migration unchanged. Adding an identity column rewrites the existing event table and requires an exclusive table lock: measure duration on a representative staging copy and plan the approved rollout before production. Apply and verify the database migration before deploying the new reset UI. Older clients calling the existing preference RPC get the corrected scoped behavior; their direct legacy-table writes are intentionally denied. Historical migration provenance is still a separate blocker.

No hosted database change, main merge or deployment is performed here. Local security advisors do not certify business authorization, production performance or service health. Tax/contact/split recommendations, the rest of Phases 2–7, full criterion acceptance, operational restore rehearsal, hosted CI/staging and screen-reader/touch review remain open. Zero of the 53 complete directive criteria is claimed acceptance-verified.

## Hosted CI blocker confirmed

The user supplied all five job error annotations from [run 44256575474](https://github.com/linkbusinessadvisory/LinkBooks/actions/runs/44256575474) at runtime `b267af8e`. Each says: “The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings”. This establishes a GitHub account billing/spending restriction; it does not distinguish a payment failure from a spending-limit issue.

The later [runtime run 44258135155](https://github.com/linkbusinessadvisory/LinkBooks/actions/runs/44258135155), for `89f7078c`, also has five failed jobs. The validate job returns an empty step list and its log download returns `NOT_FOUND`. The connector cannot read the annotation text itself. An account administrator must resolve the restriction in GitHub Billing & plans and rerun required checks. No payment, spending limit, runner, or branch-protection setting is changed here. The Ubuntu 26 migration notices are informational and are separate from the job-start errors.

## Manual review

Use a dedicated test company. In Banking → Transactions → Code, open supporting history and verify the payee/account/direction, linked journal and enabled state. Open Reset, cancel with both Cancel and Escape, and confirm focus returns with no audit entry. Confirm a reset and verify one receipt/audit, unchanged posted journals, and no old recommendation after reload. Make one new approved posting and verify a single fresh precedent. Drop committed responses and retry; newer approvals must remain eligible. Verify another bank/currency/company is unaffected and that read-only, revoked and MFA-insufficient sessions are denied.

Repeat on desktop, tablet and mobile with Tab/Shift+Tab, Enter, Escape, touch and a screen reader. Existing accounting acceptance still includes taxes, splits, FX, closed periods, simultaneous sessions, posting and reversal; this batch does not certify all of them.

## Safe Windows review

The cloud checkout does not modify `D:\MyApp\LinkBooks` or its untracked messaging files. Review in a separate worktree; preserve the original checkout:

```powershell
cd D:\MyApp\LinkBooks
git status
git fetch https://github.com/linkbusinessadvisory/LinkBooks.git feature/financial-intelligence-readiness-20261117
if ($LASTEXITCODE -ne 0) { throw "Fetch failed." }
git worktree add --detach D:\MyApp\LinkBooks-review-251-b05 FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw "Worktree creation failed. Preserve existing work." }
cd D:\MyApp\LinkBooks-review-251-b05
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw "Installation failed." }
$env:NODE_OPTIONS = "--max-old-space-size=6144"
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw "Typecheck failed." }
```

Configure this review checkout for an isolated Supabase database before running `npm.cmd run dev` at http://localhost:8080. Hosted migration/deployment approval is separate; do not blindly push the historical migration set to production.

The explicit local API harness uses localhost:8098 and rejects hosted targets. Run its setup, browser, reversal and finally MFA modes in that order. MFA enrollment changes the synthetic owner's requirements; run fresh setup before another browser session. Keep session files and CLI status private. See [Batch 04 harness instructions](BATCH-04-LOOKUPS-AND-VERIFICATION.md#safe-windows-review-and-manual-acceptance) for the guarded startup helper.
