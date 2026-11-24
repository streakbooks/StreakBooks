# Batch 2 — register/session foundation (partial implementation)

Continuation of [POS PR #238](https://github.com/streakbooks/StreakBooks/pull/238). Adds physical-location register setup, cashier location grants, dedicated POS role permissions, real opening/unchanged-float closing commands and closed-session history. There are no sale/payment/stock/journal mutations. This is not a production-ready POS release.

| Required verification           | Actual integrated review status                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task implementation             | Partial: configuration/session foundation implemented                                                                                                                |
| PR                              | [#238](https://github.com/streakbooks/StreakBooks/pull/238), draft; published integrated register/session foundation                                          |
| Merge into main                 | POS not merged; #241 audit repair and #246 regression repairs merged externally                                                                                      |
| Main inspected                  | `98d937359b6f6546f3eccc19f8b2729b80b12ccb`; latest banking/sales work merged locally into this feature branch                                                        |
| GitHub CI                       | Blocked before any steps by account billing/spending limit; [actual run](https://github.com/streakbooks/StreakBooks/actions/runs/44123447850)                 |
| Unit tests                      | 4,075 passed / 0 failed / 0 skipped across 591 files on integrated source revision `bb50d250`                                                                        |
| PostgreSQL integration/security | 45 POS assertions including 3 concurrency scenarios passed; broader workflow/platform suites and 59 banking PostgreSQL assertions also passed, all isolated fixtures |
| Browser / E2E                   | 9 POS, 74 shared UI/accessibility and 5 banking fixtures passed; no authenticated live browser flow                                                                  |
| TypeScript                      | Final integrated incremental TypeScript check passed with no diagnostics                                                                                             |
| Production build                | Integrated production build and client bootstrap budget passed (269,300 gzip bytes); no deployment                                                                   |
| ESLint                          | Final full-repository lint passed with zero errors and zero warnings                                                                                                 |
| Lookup contract                 | 378 shared lookup declarations, zero violations; 147 baseline dynamic selectors migrated                                                                             |
| Supabase migrations             | New POS migration local-fixture tested only; NOT applied to hosted project                                                                                           |
| Live read-only audit            | Prerequisite columns confirmed, POS tables absent; advisor summary below                                                                                             |
| Authenticated staging           | Not executed                                                                                                                                                         |
| Deployment / production         | Not deployed / not verified                                                                                                                                          |

Database ownership and security: reuse `hr_locations`, `accounts`, `company_members`, `profiles` and existing audit history. Composite tenant FKs protect register location/account links; RLS and current permission/location checks protect reads. Only private, guarded commands elevate; public RPCs use invoker rights; anonymous execute and direct cashier writes are revoked. Mutable operation IDs cannot alter a prior result, and one register cannot have multiple open sessions. Atomic audit failure rolls back creation/opening/closing. SQL tests cover foreign-register replay and null access actions. An opening float declares existing cash, without inventing an accounting transfer. Closing a variance fails and leaves the session open until a later approved accounting workflow exists.

Connected database audit was read-only: required master columns exist, latest migration metadata includes `20261117220000`, and both POS tables are absent. Security advisors returned 92 informational no-policy notices, 21 search-path warnings, 26 anonymous definer-execute warnings, 726 authenticated definer-execute warnings and one Auth protection warning. These are untriaged platform notices, not verified exploits, and do not describe the unapplied POS migration. No live configuration or data was changed. The local Supabase CLI advisor could not connect because a full local Supabase stack was not running; actual RLS/privilege/concurrency assertions ran against disposable PostgreSQL instead.

## Exact changed paths in this foundation batch

- `docs/pos/README.md`
- `docs/pos/architecture.md`
- `docs/pos/competitors.md`
- `docs/pos/database.md`
- `docs/pos/gap-analysis.md`
- `docs/pos/requirements.csv`
- `docs/pos/security.md`
- `docs/pos/tracker.md`
- `docs/pos/workflows.md`
- `e2e/pos/cart.spec.ts`
- `e2e/pos/fixtures.ts`
- `e2e/pos/main.tsx`
- `e2e/pos/registers.spec.ts`
- `e2e/pos/vite.config.ts`
- `package.json`
- `scripts/check-module-contracts.mjs`
- `scripts/check-module-permissions.mjs`
- `scripts/check-native-navigation.mjs`
- `scripts/test-pos-postgres.mjs`
- `src/components/pos/PosNavigation.tsx`
- `src/lib/access-catalogue.ts`
- `src/lib/ai-voice/deterministic-engine.ts`
- `src/lib/modules/registry.test.ts`
- `src/lib/modules/registry.ts`
- `src/lib/nav-coverage.test.ts`
- `src/lib/nav.ts`
- `src/lib/permissions.ts`
- `src/lib/pos/catalogue-quote.functions.test.ts`
- `src/lib/pos/catalogue-quote.functions.ts`
- `src/lib/pos/register-contracts.test.ts`
- `src/lib/pos/register-contracts.ts`
- `src/lib/pos/registers.functions.test.ts`
- `src/lib/pos/registers.functions.ts`
- `src/routeTree.gen.ts`
- `src/routes/_authenticated/pos/registers.tsx`
- `src/screens/pos/README.md`
- `src/screens/pos/index.tsx`
- `src/screens/pos/registers.tsx`
- `supabase/migrations/20261117220001_pos_register_session_foundation.sql`
- `tests/fixtures/pos/baseline.sql`
- `tests/integration/pos-register-sessions.sql`
- `docs/pos/batch-2-review.md` (this report)

## Integrated release repairs

This PR includes reviewable dependencies: [#246](https://github.com/streakbooks/StreakBooks/pull/246) corrects stale accounting assertions, voice navigation and the missing payroll feature-catalogue seed (merged externally); [#252](https://github.com/streakbooks/StreakBooks/pull/252) repairs repository lint debt using relevant existing #227 fixes; [#253](https://github.com/streakbooks/StreakBooks/pull/253) migrates 147 dynamic record selectors in 66 files onto the shared searchable lookup. These branches are preserved, with overlap documented; no remote main merge or history rewrite occurred. The broad formatting changes are not POS business logic. I can inspect repository branches and commits, but cannot inspect unsaved changes in a separate Cursor session. Concurrent work is therefore reconciled through Git, not certified absent.

Integrated static gates passed: 707 TSX files / 189 routes with zero UI violations; all module/workspace, navigation and lookup checks passed. The quality workflow retains all prior checks and adds the disposable POS PostgreSQL job. Shared browser fixtures now explicitly isolate unused messaging mutations and throw if invoked without a configured fixture, rather than importing real server middleware.

The broader workflow runner also needed two fixture repairs: a dedicated one-company test actor (the prior actor legitimately belonged to the supposed foreign company), and valid PostgreSQL `$$` delimiters in the concurrent-numbering assertion. Both suites now pass without changing production contact-numbering code.

An initial integrated unit run passed 4,031 tests and timed out five PDF/export tests under simultaneous typecheck/browser/lint load. The quieter complete rerun passed all 4,075 tests; timeouts were not increased and tests were not disabled. Final results are recorded in the verification table. The full unit run tested application source [`bb50d250`](https://github.com/streakbooks/StreakBooks/commit/bb50d2503739bac15bacf6cd690dbebfcc2dd547). Fixture-only cleanup [`e1222754`](https://github.com/streakbooks/StreakBooks/commit/e122275452c462a94060db79c693cb4a8d375436) separates component/service exports without weakening lint; its five banking browser tests passed again. Application TypeScript, full lint and all static contracts also passed after integration. Subsequent commits update documentation only. Broader workflow fixture repairs isolate the tenant-denial actor and restore the concurrency assertion SQL delimiter. Build warnings remain for pre-existing deprecated TanStack inputValidator usage and Nitro configuration; they did not fail the build.

## Safe Windows review

The cloud checkout is separate from `D:\MyApp\StreakBooks`. Protect local edits, fetch, and check out the review branch after it is published:

```powershell
cd D:\MyApp\StreakBooks
git status
if (git status --porcelain) { throw "Commit or stash changes first." }
git fetch origin
if ($LASTEXITCODE -ne 0) { throw "Fetch failed." }
git switch --detach origin/feature/pos-register-sessions-20261117
if ($LASTEXITCODE -ne 0) { throw "Checkout failed." }
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw "Installation failed." }
npm.cmd run dev
```

Use the existing authorized development configuration and `http://localhost:8080/pos/registers`. No hosted migration is authorized by these review commands. The UI fails closed if its database upgrade is absent. `npm.cmd run test:pos:postgres` requires Docker and runs a disposable isolated database, not the configured hosted project.

## Manual staging checklist and remaining gates

- In a dedicated test company with the reviewed migration, create a register from an existing location/account; grant an active cashier location access and verify another location/company stays inaccessible.
- Open with physical float, retry the same request, count into the blank closing field, reject a variance, close matching cash, then retry close and verify locked history. Revoke location or count permission and repeat denied requests.
- Check exact USD/GBP/AUD/NZD/CAD/INR decimals; excessive precision and negative counts must fail.
- Review desktop/tablet/mobile, light/dark themes, keyboard searchable lookups, focus and screen-reader labels. Fixtures prove selected widths/flows, not full accessibility or real sessions.
- Do not collect customer payments through this module. Checkout, cash movements, adjustments, receipts/refunds, COGS, providers, offline/devices and restaurant workflows remain unimplemented.

Next release step: fix the GitHub account runner blocker, review release dependencies and complete approved full-schema/authenticated staging gates. Merge, live migration and deployment need separate explicit authorization. No such action was performed.

Existing build notices remain: the framework deprecates `inputValidator()` in favor of `validator()`, and Nitro reports its ignored `inlineDynamicImports` option. These did not fail the build and have not been represented as resolved.
