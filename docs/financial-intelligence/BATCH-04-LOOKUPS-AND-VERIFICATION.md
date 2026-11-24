# Batch 04 — shared lookup migration and verification

Updated: 18 November 2026; work began on 17 November. This is a continuation of [draft PR #251](https://github.com/streakbooks/StreakBooks/pull/251), not a production release.

## Implementation

The 147 mapped selectors previously failing the repository lookup contract now use the existing `RecordLookupSelect` adapter and shared searchable `LookupSelect`. The migration covers 66 application files across accounting, AI, budgets, practice, HR, CRM, expenses, payroll, products and sales. Both native option declarations and Radix option declarations retain their option IDs, labels, disabled states, change callbacks and empty selections. Fixed enumeration choices in the affected set are searchable too; no entity selector is disguised as a fixed enumeration and no lookup checker exemption was added.

Native change handlers now receive the selected ID rather than a synthetic DOM event. The expense template action remains controlled with an empty selection so applying the same template twice still works. The shared adapter now carries trigger sizing classes without copying popup/item classes onto the control. The application trigger has a stable display name: its upstream primitive did not provide one, which the new browser test exposed.

The unified portal messaging imports added on main now have explicit deny-write stubs in the isolated UI harness; the harness no longer tries to import server authorization modules into its plain Vite browser build. This affects the fixture configuration only, not production authorization. New browser scenarios cover searching records by label while retaining IDs, disabled records and controls, clearing to “all”, repeated template actions, trigger descriptions, and keyboard selection at 375/768/1280 px. A browser-fixture CI job now runs UI and Coding Memory fixture suites without hosted credentials.

Main snapshot `b9f4e863` was integrated first. A separate integration worktree then preserved main `8c79ac08e1f21884395a6066a71267f04ffda6d5`, including PR #225 and the newer sales/purchase lifecycle and company-scoped matching guards. Matching controls follow the server’s categorise-or-reconcile permission rule. Later remote changes are outside that snapshot. The two Payroll catalogue registration migrations are idempotent (`ON CONFLICT DO NOTHING`); neither changes subscription grants or prices.

The selector migration does not add a financial posting path or change accounting amounts or company queries. Follow-up permission and audit repairs are described below. They preserve existing query scope and require final workflow acceptance on the deployed application.

## Verification scope

Use [Batch 03](BATCH-03-READINESS.md) only for its historical evidence. This batch reruns current local gates and exercises a fresh isolated database rather than treating earlier fixture results as final acceptance. Exact results are recorded when commands complete.

The first browser discovery run exposed missing trigger sizing. Intermediate discovery runs also overlapped source edits or exceeded timeouts while browser, unit, typecheck and database recreation competed for resources. Those runs are not passing acceptance evidence. Final runs are performed sequentially with existing test timeouts; no timeout, assertion, permission, or compiler gate is weakened to obtain a pass.

The localhost API runner has a new optional `--mfa` mode. It enrolls a synthetic owner's TOTP factor through real Auth, creates and verifies a challenge, verifies the resulting token is AAL2, checks the old AAL1 token loses evidence/RPC access, and checks elevated authentication still cannot forge learning events. It never prints or stores the TOTP secret. Run this mode last: verifying a factor changes the synthetic user's authentication requirements. This test requires TOTP enrollment and verification enabled in the dedicated local Supabase configuration.

## Release limits

Hosted CI, hosted staging, full product acceptance and Phases 2–7 remain separate from these repairs. A green source contract or an isolated browser fixture does not certify every migrated screen, screen-reader behavior, company switching or accounting scenario. No live migration, merge into main, deployment or production verification was performed by this continuation.

## Audit and permission defects found through real tests

The real Banking test exposed a pre-existing PostgREST ambiguity between the text and UUID overloads of `record_audit_event`. Posting succeeded, but the following application audit RPC failed. A new `record_app_audit_event` endpoint has one text-ID signature and delegates explicitly to the existing SQL helper. All application callers and their mock expectations now use that endpoint. Both old overloads remain available to SQL callers, including payroll; non-UUID references still go into `details.entity_ref` and common secret fields are stripped. The client type catalogue retains the legacy endpoint and includes the new one.

The new endpoint is an invoker with company membership and real MFA checks. The legacy UUID definer also enforces MFA and uses an empty search path, so clients cannot bypass that policy through its default arguments. Anonymous execution is revoked. Neither function accepts a caller-supplied audit actor: the stored actor is `auth.uid()`.

The read-only test found that Banking offered Code/Match/management and bulk-coding controls despite the server denying the mutation. Desktop and mobile now derive the controls from `banking.categorise` and `banking.reconcile`, while retaining read-only Preview. An editor is no longer rendered when its permission is absent, and the action confirmation also guards against a permission change while it is open. These UI gates supplement the existing server checks; they do not replace them.

## Function search-path hardening

Local Supabase security advisors identified 19 pre-existing mutable search paths. Their bodies were reviewed before pinning paths. Eighteen pure helpers now have an empty path. The advisor token generator resolves pgcrypto through its actual extension namespace from `pg_extension`, with `pg_catalog` first and `pg_temp` last. The helper bodies, volatility, grants, output shape and 24-byte random token algorithm remain unchanged.

A read-only SQL smoke script exercises all 19 helpers under a caller search path containing only `pg_temp`, including JSON mappers, payroll periods/payment state/account validation, direct-message pair ordering, agreement text and token generation. It prints only success/failure, never generated tokens. Local security advisors subsequently returned zero warning/error findings. This is a local security-linter result, not certification of production, custom authorization logic, or query performance.

## Real test semantics

The feedback retry test deliberately discards two successful server responses after the backend has committed them: the initial request and the built-in automatic retry. The UI then offers Retry. Retrying manually retains the same request ID, and the database still contains exactly the same single feedback row. Successful responses are not stubbed.

The read-only API test checks the posting engine's existing HTTP 400 permission response and verifies that no additional journal appears. Feedback/preference denial uses HTTP 403; anonymous audit denial uses HTTP 401. A response-status assumption was corrected to the existing posting contract rather than changing the engine or accepting arbitrary validation failures.

The synthetic MFA test runs last. It verifies real TOTP enrollment/challenge/verification, the AAL2 claim, denial of the old AAL1 session, scoped AAL2 access, event-forgery denial and MFA enforcement on both app and legacy audit endpoints. No TOTP secret is persisted in the session artifact or printed.

## Deployment and compatibility limits

The 357 SQL migration files are byte-identical before and after the late main integration. The clean local replay therefore covers the final schema even though application checks are repeated for the integrated TypeScript changes. The CLI migration phase completes and all recorded versions match; its exit code remains non-zero because the container health probe cannot use the cloud proxy successfully. Host Auth and REST probes return 200. Service health is not certified by those narrower results.

Apply and verify the additive migrations before deploying application callers of `record_app_audit_event`. The old overloaded endpoint remains for native SQL compatibility and is still ambiguous for old five-argument JSON clients. Coordinate the application deployment and cached-client update; do not assume earlier clients gain the new audit delivery behavior automatically. No hosted change is performed here.

GitHub main's tracker reports immediate Actions failures with empty step lists and restricted administration APIs. The cause has not been independently established from those symptoms. A zero count from the self-hosted runner API does not establish hosted runner availability or billing status. Hosted CI still needs an actual successful run, not a local-pass inference.

## Safe Windows review and manual acceptance

The cloud work does not alter `D:\MyApp\StreakBooks` or its untracked messaging files. Review in a separate directory; do not reset or clean the original checkout:

```powershell
cd D:\MyApp\StreakBooks
git status
git fetch https://github.com/streakbooks/StreakBooks.git feature/financial-intelligence-readiness-20261117
if ($LASTEXITCODE -ne 0) { throw "Fetch failed." }
git worktree add --detach D:\MyApp\StreakBooks-readiness-251-20261118 FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw "Worktree creation failed. Preserve existing work." }
cd D:\MyApp\StreakBooks-readiness-251-20261118
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw "Installation failed." }
$env:NODE_OPTIONS = "--max-old-space-size=6144"
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw "Typecheck failed." }
```

For the real local suite, start the explicit isolated database first, save CLI status privately, then run `npm run dev:banking:local -- --env-file /private/path/local-supabase.env` in another terminal. The helper refuses hosted API URLs, binds the app to localhost:8098, supplies anon keys to the frontend and a local server key only to the server, and disables external login/CAPTCHA providers only for that isolated process. The browser suite now fails once during preflight if this app has not been started, before seeding transactions. Use `test:banking:local-api`, then `test:banking:local-ui`, then the API runner's `--reverse` and finally `--mfa` modes. The normal development URL outside this fixture remains http://localhost:8080.

In a dedicated test company, manually review Banking → Transactions → Code/Match/Preview: select and edit a suggestion, reject/disable/re-enable it, switch companies, refresh, retry errors, post and reverse. Include taxes, split allocations, FX, archived/control accounts, closed periods and simultaneous sessions. Verify categorise-only, reconcile-only and read-only roles on desktop/tablet/mobile with Tab/Shift+Tab, Enter, Escape, touch and a screen reader. Real automated scenarios cover only the cases explicitly recorded in the evidence.

Remaining programme work includes Coding Memory reset and tax/contact/split-aware recommendations, the rest of Phases 2–7, hosted CI/staging, historical migration provenance, operational rollback/restore review and complete feature acceptance. Zero of the 53 complete directive criteria is claimed acceptance-verified by this batch.

## Final verified result

All corrective local checks below passed at [runtime revision 1b3d12ee](https://github.com/streakbooks/StreakBooks/commit/1b3d12eeba5e00feb2adfd92fdcb90324cb04453), including the integrated main snapshot. Subsequent report changes do not alter runtime code. [Machine-readable evidence](BATCH-04-EVIDENCE.json) records the exact scope and command exit codes. Raw CLI status, Auth state, startup logs and credentials are not committed.

| Item                          | Actual result                                                                                                                                                                                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task implementation           | Corrective batch implemented; whole programme remains partial                                                                                                                                                                                                                                              |
| Pull request                  | Draft #251; builds on independently merged #225 and includes earlier readiness work                                                                                                                                                                                                                        |
| Main merge                    | Not performed by this continuation                                                                                                                                                                                                                                                                         |
| Integrated main               | 8c79ac08e1f21884395a6066a71267f04ffda6d5; no later main snapshot is certified                                                                                                                                                                                                                              |
| GitHub CI                     | [Run 44220265623](https://github.com/streakbooks/StreakBooks/actions/runs/44220265623) failed: five jobs, two annotations each, no validate steps. Log retrieval returned 404/BlobNotFound; connector does not support reading annotations. Cause remains unestablished; annotation text requested. |
| Unit tests                    | **591 files; 4,010 passed, 0 failed, 0 skipped**                                                                                                                                                                                                                                                           |
| Integration                   | All **8 isolated PostgreSQL suite commands** passed: Banking, workflows, documents, accountant exceptions, correction approvals, workpaper items, platform and billing. Banking has **59 assertions**. An additional read-only smoke test exercises **19 search-path helpers**.                            |
| Real localhost API/Auth       | **23 API assertions, 8 MFA assertions and 3 reversal assertions passed**, with real Auth and RLS                                                                                                                                                                                                           |
| Browser                       | **7 real localhost scenarios**, **79 shared UI fixtures**, **5 Coding Memory fixtures** passed; zero failures in final runs                                                                                                                                                                                |
| TypeScript                    | Passed with explicit 6 GB Node heap, matching CI                                                                                                                                                                                                                                                           |
| ESLint                        | Full repository passed: **0 errors, 0 warnings**                                                                                                                                                                                                                                                           |
| Production build / bundle     | Passed locally; 39 bootstrap modules, 921,708 bytes / 269,306 gzip. Framework deprecation notices remain.                                                                                                                                                                                                  |
| Repository / source contracts | Hygiene, unique migration identities, module/UI/native navigation and 6 delegated-screen resolver tests passed                                                                                                                                                                                             |
| Lookup architecture           | **374 shared declarations; 0 violations**, down from 147                                                                                                                                                                                                                                                   |
| Supabase schema               | **357 clean local migrations**, exact repository version match; migration files unchanged by late main integration. CLI exit 1 reflects the native service health probe failure; host Auth and REST return 200. No hosted migration performed.                                                             |
| Security advisors             | Local scan: **0 warning/error findings**, down from 19 mutable search paths. No production or full performance certification.                                                                                                                                                                              |
| Authenticated hosted staging  | Not executed                                                                                                                                                                                                                                                                                               |
| Vercel deployment             | Not performed                                                                                                                                                                                                                                                                                              |
| Production verification       | Not verified                                                                                                                                                                                                                                                                                               |

GitHub Actions failure is not reported as a code failure diagnosed from logs: the steps and diagnostic annotation text are unavailable to this connector. Equally, local passes are not substituted for hosted CI approval. All named local gates passed again after the late main integration; this table does not use intermediate failed or interrupted runs as acceptance evidence.
