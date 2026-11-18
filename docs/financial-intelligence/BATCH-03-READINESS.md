# Batch 03 — production-readiness continuation

Status: **partially implemented; release blocked**. Date: 17 November 2026.

This continuation combines the Coding Memory event work with repository readiness repairs and real localhost API/browser verification. It does not complete Phases 2–7, certify the five-feature programme, or authorize a live migration, merge or deployment. The requirement tracker still has zero of 53 requirements fully acceptance-verified.

## Delivery and integration

- Authoritative repository: https://github.com/linkbusinessadvisory/LinkBooks.
- Earlier draft work: [PR #225](https://github.com/linkbusinessadvisory/LinkBooks/pull/225), [readiness PR #227](https://github.com/linkbusinessadvisory/LinkBooks/pull/227).
- Current draft: [PR #251](https://github.com/linkbusinessadvisory/LinkBooks/pull/251).
- Continuation branch: `feature/financial-intelligence-readiness-20261117`. The remote foundation branch advanced while this session paused. A rejected non-fast-forward push was not forced; that branch was preserved. This continuation includes its Coding Memory implementation; a source comparison found no difference in the event migration, memory controls, or memory fixtures.
- Integrated GitHub main snapshot: [fa57d602e9552c92e6dc77914052df467b48285d](https://github.com/linkbusinessadvisory/LinkBooks/commit/fa57d602e9552c92e6dc77914052df467b48285d). Subsequent remote changes are outside this snapshot.
- Concurrently merged purchase receipts, partial billing, supplier statements/void dates, customer/supplier credit gates, copying and reconciliation opening balance changes were retained. Overlapping TypeScript repairs from PR #228 retain equivalent validated contracts. A duplicate import, duplicate HTML property and unnecessarily narrowed onboarding helper type introduced by automatic merging were resolved. Digest HTML retains the existing escaping helper.
- Mechanical formatting is isolated in commits `4a24c80c` and `d99bf1aa`; it touches hundreds of pre-existing files. Review functional commits separately. No published history was rewritten.

## Implemented repairs

- Repaired the original 107 TypeScript diagnostics without weakening compiler options. Current main independently merged many equivalent repairs. JSON serialization, exact optional properties, cursor bounds, CRM types and mocks now express their real contracts.
- Replaced conditional permission-hook chains with one unconditional hook. Preserved existing validation of control characters through a shared helper. Fixed missing workspace imports and module navigation/permission metadata, including Messages.
- Strengthened fixed-asset posting evidence to require the asset account. Kept existing safe budget overflow and remainder policies; corrected stale expectations.
- Restored executable CI with pinned official checkout/setup-node actions, Node 24, bounded test workers, a 6 GB Node heap, repository/migration/type/lint/unit/UI/navigation/lookup/build/bundle gates, and isolated PostgreSQL jobs. These gates do not deploy or use production secrets. An existing lookup gate remains red and has not been suppressed.
- Added migration filename uniqueness enforcement. Corrected three historical filenames to the identities recorded in the connected project's read-only migration metadata. Added three missing PL/pgSQL terminators found during clean replay.
- Added the missing Payroll billing-feature catalogue identity, matching existing application metadata, with `ON CONFLICT DO NOTHING`. It changes no plan prices or subscriptions.
- Added real localhost-only Auth/PostgREST tests and real signed-in browser tests. Session credentials stay in ignored `work/`; no raw Supabase status/startup output is published.
- Fixed the shared header overflowing a 375 px viewport after calculator/messaging integration: controls wrap on narrow screens. Preserved the more complete delegated-screen resolver and its tests from main PR #241, including directory index screens.

## Migration reconciliation and isolated database

| Repository identity before                              | Recorded identity used                                         | Verification limit                                                                                                                       |
| ------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `20261022180000_settings_centre_foundation.sql`         | `20261022125237_settings_centre_foundation.sql`                | Recorded remote SQL is only an applied-file placeholder; its historical body cannot be checksum-verified. Repository SQL body unchanged. |
| `20261106120000_action_center_server_side_triage.sql`   | `20261106064610_action_center_server_side_triage_20261106.sql` | Recorded body matches MD5 `3505065e455950bf91a2ef5994e23d50`.                                                                            |
| `20261106200000_action_center_search_trigram_index.sql` | `20261106074931_action_center_search_trigram_index.sql`        | Recorded body matches MD5 `b56955307c52dc1a1554908d2ad6f2f9`.                                                                            |

No linked/remote migration repair was executed. Renaming local migration files does not reconcile every historical or deployed schema difference.

A clean local Supabase PostgreSQL 17.12 replay applied 337 migrations at the earlier integrated snapshot. Twelve subsequent main messaging migrations upgraded that **isolated** database to 349. All five later purchase migrations from main `fa57d602` then applied successfully with the CLI explicitly reporting target `local stack (127.0.0.1:54322)`: 354 migration identities are now applied locally. This is clean replay plus two isolated upgrades, not a single clean replay of the final head, a production upgrade, or a backup/restore drill. The Coding Memory and Payroll migrations were applied locally, never to production by this session.

Cloud proxy policy causes the containers' own wget probes to receive HTTP 403. The stack was kept running with the CLI's explicit `--ignore-health-check`; normal host requests using inherited networking reached real Auth and REST with HTTP 200. The successful API tests below verify those operations, not overall service health. No proxy bypass was configured.

## Real end-to-end evidence

The API tests use real synthetic Auth password sessions, canonical company creation, RLS, `post_journal`, reconciliation links and Coding Memory RPCs. Only creating synthetic Auth users uses the local admin credential; accounting requests use the normal user's token.

- **12 API assertions passed:** real sign-in; company creation; retry-idempotent balanced posting; exactly one linked learning precedent; deduplicated feedback; rejected feedback does not teach; persisted disable/re-enable; cross-company RLS invisibility; direct event forgery denied.
- **3 real browser scenarios passed:** desktop sign-in → evidence/preferences → disable/re-enable → Reject → supporting journal in a new tab → keyboard Enter on Use suggestion → authoritative Post → balanced journal lines and accepted posted feedback in REST → reload persistence; signed-in tablet at 768 px; signed-in mobile at 375 px with keyboard focus and no document overflow.
- **3 reversal assertions passed:** reversal is restricted to the same explicit localhost fixture; reversing fixture postings removes precedents; immutable event evidence remains.
- Earlier isolated component browser fixtures passed **5 scenarios**, including delayed company-switch responses, read-only role, unavailable migration and retry. Those scenarios are stubs, not real Auth/RLS acceptance.
- The isolated Coding Memory PostgreSQL runner passed **59 assertions**, including concurrent relink/reversal sessions. Seven existing PostgreSQL suite commands passed on the earlier readiness snapshot (workflows, documents, accountant exceptions, correction approvals, workpaper items, platform, billing). These are isolated fixtures, not hosted staging or final-main schema acceptance.

The first real desktop browser attempt used a five-second assertion while a new tab was still bootstrapping. The test now waits for its actual journal heading with a 60-second bound. The first mobile attempt exposed actual header overflow, which was fixed. Both reran successfully. This is focused keyboard verification; it is not screen-reader, touch-device, or WCAG certification.

## Reproducing the local tests

Use a dedicated local Supabase stack and synthetic data. Review CLI help first; never use `--linked` or `--remote`. Store CLI status environment output privately under ignored `work/`. Do not print or commit that file. The API runner refuses all targets except `http://localhost:54321` or `http://127.0.0.1:54321`.

```sh
npm ci
npm run test:banking:local-api -- --env-file /absolute/private/path/local-supabase.env
```

For the browser run, explicitly configure **both** `VITE_SUPABASE_URL` and `SUPABASE_URL` to the local API and **both** `VITE_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_PUBLISHABLE_KEY` to its public/anon key. Never pass the service-role key to Vite. Disable external OAuth/SSO/CAPTCHA only in this isolated local test environment. Start the app on `127.0.0.1:8098`, then:

```sh
npm run test:banking:local-ui
npm run test:banking:local-api -- --env-file /absolute/private/path/local-supabase.env --reverse
```

The browser tests require the synthetic session file produced by the API runner. They are excluded from the generic E2E config. Reversal intentionally invalidates its learned examples; rerun setup before another browser pass. No messages or emails were sent by these tests.

## Remaining release blockers and manual acceptance

- Resolve the repository-wide shared-lookup violations; do not hide entity selectors behind fixed-enumeration annotations. The earlier combined snapshot reported 147 violations; final integrated count is recorded in the evidence JSON.
- Complete final-head clean-schema and realistic upgrade replay, historical migration review including the placeholder entry, and operational rollback/backup review in an isolated environment.
- Verify real authenticated company switching, permission revocation, MFA/AAL2 enrollment/challenge, failure/retry, audit access and concurrent sessions on the final deployment. Local RLS tests and stubbed UI tests cover only parts of this matrix.
- Banking → Transactions → Code: check edited allocations, taxes, split journals, FX, archived/control accounts, closed periods, repeated requests, reversal, and Back/Forward/refresh. Use a dedicated test company. Split events remain excluded from single-account hints; broader split/contact/tax memory and preference reset are unfinished.
- Review desktop/tablet/mobile with Tab/Shift+Tab, Enter, Escape, visible focus and a screen reader; verify header wrapping does not hide controls.
- Complete Phases 2–7, programme acceptance, hosted staging, review and actual GitHub CI. No main merge, Vercel deployment, live migration or production verification was performed by this continuation.

A production-ready label is not justified by the present evidence.

## GitHub CI

[Actions run 44116032487](https://github.com/linkbusinessadvisory/LinkBooks/actions/runs/44116032487), associated with runtime revision `d99bf1aa`, completed with **failure**. All three job summaries report failure. The API returned no step summaries; downloading the validate job log returned 404/BlobNotFound. The failure cause has therefore not been established. Do not infer a passing hosted check from local results.

## Safe Windows review

This cloud checkout does not change `D:\MyApp\LinkBooks`. Preserve the four untracked messaging files shown in the user's status. A separate detached worktree avoids switching or cleaning that checkout:

```powershell
cd D:\MyApp\LinkBooks
git status
git fetch https://github.com/linkbusinessadvisory/LinkBooks.git feature/financial-intelligence-readiness-20261117
if ($LASTEXITCODE -ne 0) { throw "Fetch failed." }
git worktree add --detach D:\MyApp\LinkBooks-readiness-251 FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw "Worktree creation failed. Do not reset existing work." }
cd D:\MyApp\LinkBooks-readiness-251
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw "Installation failed." }
$env:NODE_OPTIONS = "--max-old-space-size=6144"
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw "Typecheck failed." }
```

Before `npm.cmd run dev` at http://localhost:8080, explicitly configure a dedicated test environment. The localhost integration suite additionally requires the isolated database and port 8098 described above. No production migration command is part of this review.

## Final local verification

Runtime revision: [d99bf1aa152d196ad4b6771b9fe36d02f0dc4562](https://github.com/linkbusinessadvisory/LinkBooks/commit/d99bf1aa152d196ad4b6771b9fe36d02f0dc4562). See [sanitized machine-readable evidence](BATCH-03-EVIDENCE.json) and the [147 lookup violations](BATCH-03-LOOKUP-VIOLATIONS.txt). The real browser evidence predates the final main integration; the final static/unit/SQL/build checks below do not replace a final deployed browser pass.

| Item                                    | Result                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Task implementation                     | Partial; Coding Memory continuation and readiness repairs only                                                                 |
| Pull request                            | Draft #251; aggregates earlier #225/#227 work                                                                                  |
| Merge into main                         | Not performed                                                                                                                  |
| Verified main snapshot                  | fa57d602; integrated locally, not a deployed verification                                                                      |
| Pre-merge GitHub CI                     | Failed; actual run linked above, cause not established                                                                         |
| Unit tests                              | 582 files, 3,985 passed, 0 failed, 0 skipped at d99bf1aa                                                                       |
| Integration tests                       | 59 isolated Banking SQL assertions; 12 real local API + 3 local reversal assertions from earlier runtime                       |
| Browser / E2E                           | 3 real localhost scenarios passed; earlier 5 stubbed component scenarios passed; final integrated runtime not rerun in browser |
| TypeScript validation                   | Passed with the CI-configured 6 GB Node heap                                                                                   |
| Production build                        | Passed locally; framework inputValidator deprecation and build warnings remain                                                 |
| ESLint                                  | Full repository passed: 0 errors, 0 warnings                                                                                   |
| Repository hygiene / migration identity | Passed; 4 hygiene tests, 3 identity tests, 354 unique versions                                                                 |
| UI / modules / native navigation        | Passed; 702 TSX files, 187 route definitions, 0 UI violations; 6 delegated-screen resolver tests                               |
| Lookup architecture                     | **Failed: 147 violations**; no suppression                                                                                     |
| Client bundle budget                    | Passed                                                                                                                         |
| Supabase migrations                     | 354 identities applied locally via clean baseline plus upgrades; hosted changes not performed by this continuation             |
| Vercel deployment                       | Not performed                                                                                                                  |
| Authenticated hosted staging            | Not executed                                                                                                                   |
| Production verification                 | Not verified                                                                                                                   |

One intermediate test run overlapped the later main merge and failed because a newly imported reporting function was not in that worker's earlier module snapshot. That mixed-tree result is not acceptance evidence. The final stable-tree run at d99bf1aa passed all 3,985 tests. One earlier TypeScript attempt exhausted the default heap; the final run used the same explicit memory limit as CI and exited 0.
