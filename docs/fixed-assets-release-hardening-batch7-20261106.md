# Fixed Assets — Batch 7: Release hardening and verification evidence

Date: 2026-11-06
Repository: `linkbusinessadvisory/LinkBooks`
Working branch: `feature/fixed-assets-register-safety-ux-20261106`
PR: https://github.com/linkbusinessadvisory/LinkBooks/pull/111 (draft)
**Release gate: not ready for merge or deployment.**

## Work completed in source

1. Hardened `portfolio-dashboard.ts` to reject unsafe/inconsistent cost, residual and opening depreciation inputs for active assets instead of showing misleading portfolio totals.
2. Hardened `AssetPortfolioPanel.tsx` to show an accessible, non-mutating error and real navigation back to the register or GL reconciliation when the read-only summary cannot be calculated.
3. Extended `portfolio-dashboard.test.ts` to cover invalid residual, negative opening and unsafe precision; completed the base test fixture with a valid opening accumulated depreciation field.
4. Performed a **source import existence check** across all 29 changed TypeScript/TSX files in the draft PR against its repository tree. No missing local imports were identified. This is not a TypeScript compiler or ESLint check.

## Isolated runtime smoke verification (limited)

An isolated Vercel Sandbox (single vCPU, persistent=false, outbound network disabled, no linked deployment) was created for pure-function runtime checks because the private repository could not be cloned into the normal working container. The helper source files were read from the feature branch and copied to the sandbox. Only TypeScript module import paths were adjusted to permit local Node ESM execution; no accounting application, database or API was exercised.

One Node.js smoke harness (19 assertions covering depreciation preview totals, duplicate rejection, 36-month catch-up, leap-year month-end, reconciliation variance totals and ordering, saved filter parsing and quotas, exact asset-book-value arithmetic, portfolio balance gaps, and capitalisation-review classification) completed with command exit code **0**.

**Evidence limitation:** the sandbox stopped at its expiry before detailed command logs could be retrieved. The command exit status was returned synchronously, but line-by-line assertion output is not available. These checks were performed before the latest dashboard-validation changes, and the latest changes have **not** been rerun. Therefore they must not be counted as full or latest-head unit test verification.

This isolated run does **not** replace the project's Vitest suite, `tsc --noEmit`, ESLint, build, Playwright, RLS, SQL, staging, performance or recovery tests.

## Remaining blockers

- The private repository is not available as a complete checkout in the working container; no authenticated local/project-wide build is available in this chat.
- The feature branch is significantly behind main because other LinkBooks modules are being merged concurrently. A clean GitHub mergeability indication is not equivalent to latest-main regression verification.
- The fixed-assets API and posted-ledger reconciliation need real company data, at least two isolated tenants, genuine FX purchase data, locked-period and duplicate-posting fixtures.
- Browser accessibility, keyboard focus, mobile viewports, screen-reader labelling, form validation, Excel/CSV exports and multi-module navigation must be verified on the running app.
- Browser-local saved filters are not cross-device sync and do not confer permissions; server-side paging for very large registers remains further work.
- No GitHub Actions/CI has been triggered intentionally. No deployment or main-branch merge is authorised without test verification.

## Release exit criteria

All items must be verified before calling this module production-ready:

- [ ] Latest main integrated without erasing other module changes; `git status` clean.
- [ ] Full Fixed Assets Vitest suite passes on the resulting tree.
- [ ] `npm.cmd run typecheck` and `npm.cmd run build` pass.
- [ ] `npm.cmd run lint` has no introduced errors.
- [ ] `npm.cmd run check:ui`, `check:lookups`, `check:navigation` pass.
- [ ] Authenticated browser tests pass for Dashboard, Register, asset details, depreciation, GL reconciliation, purchase review and mobile.
- [ ] RLS and permission tests pass for two independent organisations with safe cross-company switching.
- [ ] Posting/idempotency tests pass: monthly and 36-month catch-up, locked period partial failure, source bill FX and disposal.
- [ ] Date, rounding, historic account mappings, opening balances and report-as-of summaries reconcile with posted GL.
- [ ] PR approved and merged after the above; a verified main SHA is recorded.
- [ ] Production deployment checked separately and app smoke tests pass.

## PowerShell local verification commands

```powershell
cd D:\MyApp\LinkBooks
git status
git fetch origin
# Only switch when your working tree is safe: save or commit Cursor changes first.
git switch feature/fixed-assets-register-safety-ux-20261106
git pull --ff-only origin feature/fixed-assets-register-safety-ux-20261106
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- src/lib/fixed-assets/
npm.cmd run check:ui
npm.cmd run check:lookups
npm.cmd run check:navigation
npm.cmd run build
npm.cmd run dev
```

For a first local branch checkout, use `git switch --track origin/feature/fixed-assets-register-safety-ux-20261106`.

Do not trigger GitHub Actions/CI, merge, modify database environments or deploy as a shortcut. Local tests and source review are permitted.

## Tracker position after this hardening increment

- Code development: **6 of 7 planned batches committed**; Batch 7 has additional hardening commits but release criteria are not complete.
- Full-batch testing: **0 of 7 fully verified**. A limited isolated pure-helper smoke run returned exit 0, with logs unavailable; latest code is untested.
- PR / main integration: **0 of 7 merged**; PR #111 remains draft.
- Production deployment: **0 of 7 verified**.

**Next work:** complete the checks above in a real checkout, repair any failures, integrate the latest main, conduct authenticated browser and database testing, then review merge and deployment separately.


## Additional verification increment — 2026-11-06

**Code changes after the original hardening report:**
- Active portfolio input validation now enforces `residual_minor + opening_accumulated_minor <= cost_minor`; the dashboard fails closed rather than showing a nonphysical depreciable base.
- Register accumulated depreciation is treated as unavailable if it is below the saved opening accumulated amount, above the depreciable ceiling `cost - residual`, unsafe, or missing. No estimated net book value is shown.
- Regression tests were added in `portfolio-dashboard.test.ts` for combined residual/opening excess, impossible low accumulated amounts, and accumulated amounts exceeding depreciable cost.
- Posted capitalisation review now classifies **all foreign-currency lines** as `fx_review` before it evaluates linked/unlinked status. An unlinked FX line cannot shortcut directly into asset creation until a separate, verified base-currency registration is prepared.
- Supplier-bill lines with zero or negative **net** amounts are classified as `non_purchase` even when their tax amount makes gross positive; this blocks accidental positive-asset creation from a tax-only or credit line.
- Regression cases were added to `capitalisation-review.test.ts` for unlinked FX and zero/negative-net examples.

**Independent smoke test evidence (source from this branch, after both fixes):**
- Test environment: Vercel isolated one-vCPU temporary Sandbox with network egress **disabled**, Node v24, no linked deployment, no database credentials and no GitHub Actions.
- Copied a small subset of pure TypeScript accounting utilities from the feature branch; adjusted only module import paths for isolated Node execution.
- Ran `node --experimental-strip-types --test fixed-assets-focused.test.mjs` using the Node built-in test runner, not the project Vitest suite.
- **42 tests passed, 0 failed, 0 skipped; exit code 0.** Output was retrieved while the sandbox was running and recorded as proof of this limited isolated run.
- Coverage included dashboard active/disposed/future state, opening/residual restrictions and missing/unsafe balances; depreciation preview/36-month plans/leap years; GL variance precision and exceptions; browser-local saved view logic; form validation; read-only asset detail arithmetic; and supplier-bill classification/FX/credit/paging/CSV safeguards.
- This smoke run **does not establish** a passing full Vitest suite or `tsc`, `eslint`, Vite build, route UI, Playwright, RLS, posted-ledger accuracy or production readiness.
- The updated code and focused tests are committed to **draft PR #111**; no merge, deployment or GitHub Actions were performed.

**Progress accounting:** Code batches *6/7 fully completed as committed development batches*; the seventh release-hardening batch has source changes and a successful limited isolated smoke test, but full-project verification remains incomplete. Count **0/7** batches as fully QA-approved and **0/7** as merged or deployed.


## Further release-hardening increment — permission gate and local verification command

**Security finding:** The earlier Fixed Assets GL reconciliation reader used only `assertCompanyMember`, which allows an organisation member to load detailed GL balances even without `accounting.view`. The endpoint now uses server-side `assertCompanyPermission(..., "accounting.view")`. The Fixed Assets reconciliation screen shows a clear permission explanation without fetching GL data when that permission is absent. The actual RLS/role integration must still be tested against distinct organisations and roles.

**Local release gate implemented:** `scripts/check-fixed-assets-release.mjs`.
- Invoked with `node scripts/check-fixed-assets-release.mjs` from a local checkout.
- Confirms the Git origin is the authorised `linkbusinessadvisory/LinkBooks` repository and does not echo credential-bearing remote URLs.
- Reports current branch, commit and whether the working tree is dirty, without modifying files.
- Runs existing `npm` scripts for TypeScript typecheck, ESLint, Fixed Assets Vitest, UI contracts, lookup contracts, navigation contracts and production build, then displays a per-check pass/fail summary and returns nonzero when any check fails.
- Explicitly does **not** call GitHub Actions, merge, fetch/pull, push, apply SQL migrations or deploy.
- **Isolated script verification:** `node --check` passed, and a test from a directory without the correct Git origin refused execution with exit code 2. The gate's seven project commands were **not** run in that sandbox, because the private full checkout was unavailable.

**Independent pure-helper smoke test evidence updated:** all **42/42** focused Node test cases passed (0 failed, 0 skipped) in a network-restricted isolated sandbox. Retrieved logs showed `EXIT=0` and `tests 42 / pass 42 / fail 0`. Covers the branch's helper source including the new FX/unlinked and tax-only protections. This is **not** the repository's actual Vitest suite, a UI build or authenticated integration coverage.

**Coordination with main:** PR #140, `feat(accounting): audit Fixed Asset depreciation/disposal posting evidence — batch 1`, has merged into `main`. It changes three additional files outside PR #111, deliberately avoiding overlap with PR #111. Its new pure evidence contracts are **not** yet connected to PR #111's user-facing GL reconciliation, and semantic integration/permission/accessibility tests are still required after bringing the feature branch up to date.

**Release status unchanged:** Batch 7 remains incomplete pending real checkout/full tests, two-tenant RLS role matrix verification, posting and FX fixture tests, browser/mobile QA, main integration, review, and separately verified deployment. The code branch may be mergeable in GitHub but does not qualify as production-ready.


## Batch 7 continued — depreciation API posting safety and exact totals

**Problem identified in the original server endpoint:** `runDepreciation` previously sorted and silently deduplicated incoming period ends. A direct API request with a duplicate, reversed order, or skipped month could therefore be transformed and executed without the caller's original intent being enforced. Its preview and posted-result totals also used JavaScript `number` addition, which can lose exact minor-unit precision across multiple individually valid charges.

**Source changes committed to PR #111:**
- New pure `validateDepreciationPostingPeriods` enforces 1–36 **real month-end dates**, chronological order, consecutive months without gaps or duplicates, and no period beyond the latest permitted month. The server calls this function in the mutation input validator; it does not reorder or silently deduplicate requests.
- New `exactDepreciationTotalMinor` totals posted amounts via `BigInt` and returns an exact decimal string. The result is compatible with the existing UI's string-aware money formatting.
- New `safeDepreciationTotalMinor` refuses a preview total that cannot be represented precisely as an API number. It also refuses invalid/fractional/zero or negative included charges.
- `previewDepreciation` now uses the safe exact-number boundary instead of floating accumulation; `runDepreciation` uses exact string totals for posted-result reporting.
- Extended `src/lib/fixed-assets/depreciation-review.test.ts` to cover contiguous periods, duplicates, reverse ordering, skipped dates, leap February, future/invalid dates, 36/37-month limits, exact posted totals and unsafe preview amounts.
- The accounting RPC's existing authorisation, period locking, idempotency and posting semantics are unchanged. The SQL implementation remains authoritative.

**Isolated test evidence:** A network-restricted temporary sandbox executed the branch's `depreciation-review.ts` and `fiscal-year.ts` pure utilities using Node's built-in test runner. **25 focused tests passed, 0 failed, 0 skipped; process exit 0.** Logs were retrieved while the sandbox was live. This was run after the new helpers and API wiring, but the harness exercises the **pure helpers only**, not the TanStack server wrapper, Vitest, Supabase RPC, permissions or journal posting.

**Latest outstanding release gates:** The full project remains unavailable as an authenticated checkout here, so `npm.cmd run typecheck`, `npm.cmd run lint`, full fixed-assets Vitest, UI contracts, browser/RLS, latest-main reconciliation and deployment have **not** passed. No GitHub Actions/CI, merge, Supabase migration or production deployment was performed.

**Local commands:** `node scripts/check-fixed-assets-release.mjs` in the authoritative repository's feature checkout, after saving existing local work. Afterwards perform logged-in cross-company accounting tests, a 36-month catch-up with locked periods and repeated post requests, and run against current main before release approval.


## Batch 7 reconciliation history and residual-floor hardening

**Source changes committed to PR #111 (2026-11-06):**
1. The read-only reconciliation data query now selects `residual_minor` for tenant-scoped fixed assets. The pure `ReconciliationAsset` model and tests have been updated to match.
2. The reconciliation calculator requires `opening_accumulated_minor + residual_minor <= cost_minor`, rejecting negative or inconsistent costs, residuals and opening balances. It also fails closed if recorded depreciation would reduce book value below residual value, not merely below zero.
3. Source status integrity is now validated: disposed assets must have a disposal date on or after acquisition, while active assets cannot claim an inconsistent disposal date.
4. For depreciation entries through the report cutoff, the calculator rejects dates before acquisition and after disposal. It checks posted-history amounts and residual floors even for assets disposed before the selected as-at date, rather than silently discarding invalid historical postings.
5. The calculator now uses an asset-ID lookup map to avoid repeated O(assets × entries) scans while applying these validations. No journals are posted, reversed or mutated.
6. `src/lib/fixed-assets/reconciliation.test.ts` adds regression cases for all of the above, and existing over-depreciation fixtures were adjusted to test the intended boundary accurately.

**Test evidence:** An isolated, network-disabled non-deploying Node sandbox executed `src/lib/fixed-assets/reconciliation.ts` using Node's built-in TypeScript-strip support. **27/27 focused checks passed, 0 failed, 0 skipped; exit status 0.** Retrieved logs verified these results, including a real Excel/CSV formula-injection regression. This is an isolated pure-function smoke suite and **not** full Vitest, TypeScript, authenticated RLS, actual GL integration, UI accessibility or deployment verification.

**Accounting limits remain:** This account-level check covers only accounts referenced by registered assets using their current GL mappings. It does not cover unregistered asset accounts, immutable historical mappings, journal-linked posting evidence, or a transactionally consistent snapshot. Separately merged Accounting PRs #140 and later audit batches contain independent posting-evidence contracts, but these have not yet been connected and verified end-to-end with PR #111. Never call a matched account reconciliation a complete source-level audit.

**Release gate remains closed:** PR #111 is a draft and has not been merged or deployed. The branch must be integrated with the latest main and pass the local seven-check script, complete Vitest, browser/mobile and keyboard QA, two-tenant permission/RLS verification, period-lock/idempotency/FX fixture testing, and deployment verification. GitHub Actions remain intentionally untriggered.


## Batch 7 continued — disposal-month SQL parity, preview permissions and type correction

**Verified source-level findings (2026-11-06):**

- In `supabase/migrations/20261025400300_fixed_assets.sql`, `dispose_fixed_asset` explicitly allows depreciation already posted for the calendar month of disposal, even when the disposal date is mid-month. It prohibits depreciation **after the disposal month**, not all entries with a period-end date after the disposal day.
- The earlier reconciliation hardening incorrectly rejected a period-end date in that same month when disposal preceded month-end. `src/lib/fixed-assets/reconciliation.ts` now checks the year/month of the entry against the disposal year/month. The guard still rejects entries in subsequent months.
- The read-only GL reconciliation now rejects duplicated source rows for the same asset and depreciation period, consistent with SQL's `asset_depreciation_entries_once` uniqueness constraint, rather than allowing duplicate source amounts to create misleading differences.
- The SQL `run_depreciation` procedure requires `accounting.post` or `journals.manual` **even when `_preview=true`**. The `previewDepreciation` server function now enforces the same prerequisite explicitly. The Depreciation UI does not request the preview without the permission and instead displays a clear access explanation.
- In `src/lib/fixed-assets/fixed-assets.functions.ts`, the posted result array was declared with `totalMinor: number` despite returning the precise string from `exactDepreciationTotalMinor`. The declaration was corrected to `totalMinor: string`, matching the client formatters and preventing an avoidable TypeScript mismatch.
- New Vitest regression cases added to `reconciliation.test.ts`: valid same-month postings, invalid following-month postings, and duplicated asset/month entries.

**Focused verification evidence:** Copied the latest `src/lib/fixed-assets/reconciliation.ts` from the feature branch to a temporary, network-denied Vercel Sandbox and ran Node's built-in test runner with 21 isolated reconciliation cases. **21 passed, 0 failed, 0 skipped, exit code 0**. Tests include same-month disposal posting, next-month rejection, residual limits, invalid statuses, accounting differences, CSV formula protection and duplicate-period rejection. Sandbox logs were retrieved. This validates pure reconciliation functions, **not** SQL calls, the full Vitest suite, React UI, TypeScript typecheck, role/RLS matrix, staging or deployment.

**Outstanding release gates unchanged:** PR #111 remains a draft branch and substantially behind main. Complete the full local release command (`node scripts/check-fixed-assets-release.mjs`) on a safe local checkout, independently exercise depreciation/disposal against authenticated SQL fixtures, validate the permissions in two organisations, run browser/mobile regressions, integrate current main, and verify deployment after approved merge. No GitHub CI workflows were initiated, and no SQL migrations or production changes were made in this increment.


## Batch 7 continued — shared as-at register balance controls

**Finding (2026-11-06):** The Fixed Assets dashboard previously rejected impossible as-at accumulated depreciation, but the register list summary and CSV export still considered any nonnegative accumulated value up to gross asset cost valid. That allowed register totals or exported rows to look valid while the dashboard deliberately marked them unavailable.

**Code changes committed:**
- Added pure `validAssetAccumulatedAt` to `src/lib/fixed-assets/register-view.ts`. It rejects missing, fractional and unsafe minor-unit balances; nonpositive/unsafe acquisition costs; negative or imprecise residual/opening depreciation; an opening-plus-residual amount greater than cost; amounts below opening; and accumulated depreciation beyond `cost - residual`.
- `summariseActiveAssets` now validates each active asset's accounting terms before aggregating cost, and uses `validAssetAccumulatedAt` rather than accepting invalid balances. Financial totals fail closed if the sums would be unsafe or a required balance contradicts asset terms.
- `src/routes/_authenticated/fixed-assets.tsx` now calls the same shared helper for individual register balances and the CSV export readiness gate, preventing inconsistent UI/readout and spreadsheet exports.
- Added `register-view.test.ts` regression coverage for missing balances, below-opening/over-residual balances, invalid cost and financial terms, exact fully depreciated NBV and safe aggregate handling.

**Isolated verification evidence:** A non-persistent Vercel Sandbox with outbound networking disabled ran the latest branch's pure `register-view.ts` under Node's built-in test runner. **24/24 focused checks passed; 0 failed; 0 skipped; exit status 0.** Logs were retrieved. The check was limited to pure source logic; it did not run the repository's full Vitest, TypeScript, ESLint, Vite build, browser/CSV interaction or authenticated database/RLS tests.

**Release status:** PR #111 remains draft and unmerged. Its branch must still integrate current main; the complete local release script, authenticated ledger/FX/period-lock verification and browser accessibility tests remain mandatory before any production readiness claim. No GitHub Actions/CI or production deployment was initiated for this increment.


## Batch 7 continued — asset-type pagination and export testability

**Further source issues corrected (2026-11-06):**

1. The `getAssetRegisterPage` endpoint previously fetched asset types with `.limit(500)`, silently truncating the list in organisations with over 500 configured types. This was changed to `fetchAllPages<AssetTypeRow>` with a unique `id` order and stable client sorting by `name` / `id`. The existing shared pager handles PostgREST server limits and fails loudly at its safety cap.
2. The register's 12-column CSV generator was embedded inside a large React route, preventing direct pure-function regression testing. The CSV generation is now in `src/lib/fixed-assets/register-export.ts`, with `buildFixedAssetRegisterCsv` taking already authorised asset rows and exact as-at accumulated depreciation balances.
3. The helper rejects absent/inconsistent as-at balances, invalid calendar report dates (using the shared `isReportDate` helper), duplicate assets, values below opening depreciation or beyond cost less residual value; it leaves original records unchanged.
4. The CSV retains the standard full column set independently of hidden UI columns, preserves a disposed asset's accumulated depreciation while reporting zero NBV after disposal, shows future acquisitions without invented balances, and neutralises spreadsheet formulas in user-controlled asset numbers, names, categories and GL account labels.
5. The browser download wrapper now catches CSV validation failures and displays an actionable toast rather than throwing an uncaught export error.
6. Added `src/lib/fixed-assets/register-export.test.ts` with Vitest regression cases for CSV formatting, as-of amounts, residual values, future purchases, duplicate rows, unsafe/missing balances, formula protection and non-mutating output. The tests are committed but have not yet been executed by the full Vitest project runner.

**Independent pure-source verification:** In a temporary, network-disabled Vercel sandbox, Node's built-in test runner executed 17 focused tests using the branch's `register-view.ts`, `register-export.ts`, shared `fetch-all.ts`, and `date-validation.ts`. **17 passed; zero failed; zero skipped; exit 0.** This includes a mock 1,203-record asset-type pagination case with a server response cap of 250, and hard-cap failure, and valid/invalid CSV cases. Logs were retrieved after correcting two test-harness wording mismatches. The tests did not access private tenant data or execute SQL.

**Remaining limitations:** None of these isolated tests prove the full TanStack route compiles, React UI works, or Supabase tenant roles/RLS are correct. The feature branch remains significantly behind main. The full local release script `node scripts/check-fixed-assets-release.mjs`, authenticated SQL posting and FX tests, browser/mobile/accessibility QA, latest-main integration, PR review and deployment verification remain mandatory.

**State:** Committed to draft PR #111 only. No GitHub Actions/CI, database migration, production deployment or merge was performed in this increment.


## Batch 7 continued — read-only connected schema and RLS metadata

**Scope:** Connected Supabase project named `linkbook`, inspected read-only on 2026-11-06. This project's staging/production designation was **not** established, so these checks do not prove another environment is migrated, deployed or tested. No company IDs, users, transactions, keys, private data or journal contents were retrieved. No schema, policy, row or migration was modified.

**Migration and schema observations:**
- The database migration list contains `fixed_assets` (recorded as version `20261023130414`), `journal_source_types_fixed_assets` (`20261023130206`) and `fixed_asset_register_csv_import` (`20261030153000`).
- All five related tables exist and are RLS-enabled: `asset_types`, `fixed_assets`, `asset_depreciation_runs`, `asset_depreciation_entries` and `fixed_asset_import_refs`. At the time of inspection, the schema reported 8 fixed asset rows, 0 asset-type rows and 0 depreciation runs/entries. These are schema metadata counts, not business or accounting verification.
- Relevant `SECURITY DEFINER` functions `save_fixed_asset`, `delete_fixed_asset`, `run_depreciation`, `dispose_fixed_asset`, and `report_fixed_asset_register` are present. Metadata indicated `anon` does **not** have EXECUTE while `authenticated` does, and each function contains a company-membership check; the write/posting functions also contain a company-permission check. The register report uses the company-member rule.
- RLS policies for all five tables show member-scoped `SELECT` policies and an MFA-required `ALL` policy. Critically, `mfa_aal2_required` is **RESTRICTIVE**, not `PERMISSIVE`, so it is combined with membership restrictions rather than providing an OR-based bypass. This is a verified structural check, **not** a logged-in cross-tenant RLS test.
- The live database constraints include `asset_depreciation_entries_once UNIQUE (asset_id, period_end)`, `amount_minor > 0`, `fixed_assets_residual_le_cost`, `fixed_assets_start_not_before_purchase`, `fixed_assets_disposed_has_date`, and `fixed_assets_number_uniq UNIQUE (company_id, asset_number)`. This aligns with recent frontend fail-closed and reconciliation source-history validations.

**Limitations:** A database catalog query cannot confirm correct runtime behaviour for all user roles, cross-tenant RLS, MFA sessions, locked periods, idempotent posting, FX conversions, journal correctness or restore/recovery. There were no existing depreciation rows in this project for safe, non-mutating posted-history integration tests. Do not run a depreciation RPC with `_preview=false` or disposal RPC without a separate isolated test database and explicit release approval. The full PR #111 application has not been deployed or merged here.

**Recommended next isolated verification:** Use a dedicated non-production Supabase branch or local DB with two test companies and users of distinct roles, insert fixtures through versioned migrations, execute preview/post/lock/disposal scenarios and verify double-entry, RLS and audit history. This should be accompanied by the full local release script, browser QA and latest-main integration. No production or connected database mutations were made during this check.


## Batch 7 continued — asset details residual-value floor and full-life depreciation schedule

**Source findings corrected (2026-11-06):**
- The read-only `summarizeAssetDetailHistory` summary used to reject posted depreciation only when it exceeded gross asset cost, even though the register, dashboard and GL reconciliation had been hardened to enforce the **cost-minus-residual** depreciable ceiling. It now requires exact positive cost, nonnegative residual/opening depreciation and `residual + opening <= cost`. It fails closed when opening plus posted charges exceeds `cost - residual` for both active and disposed assets; it does not invent or write journals.
- `AssetDetailsDialog` already forwards the complete fixed-asset row including `residual_minor`, so no additional client prop wiring was required. `asset-detail-summary.test.ts` now includes valid/invalid residual floors, unsafe values, disposed overdepreciation and exact large-integer arithmetic.
- The default projected `buildSchedule` stopped after **600 months** despite valid straight-line useful lives of **1,200 months** in the model and database. Its default `maxMonths` is now 1,200; callers can still specify a shorter explicit display cap. The UI already paginates the resulting schedule, avoiding a 1,200-row unbounded table.
- `depreciation.test.ts` now verifies the 1,200-period schedule from January 2026 through December 2125, the residual floor, total-charge conservation and explicit shorter caps.
- An existing `asset-detail-summary.test.ts` assertion expected a numeric fractional charge error containing "whole minor-unit", but the actual correct rejection message is "lost minor-unit precision". The test now matches `/minor-unit/i`; this changes only the regression assertion, not production validation.

**Isolated, non-deploying test evidence:** With outbound network denied, a temporary Vercel sandbox ran the updated pure `asset-detail-summary.ts` and `depreciation.ts` with their existing fiscal-year and budget-math dependencies using Node's built-in TypeScript-strip test runner. The first run passed 21/22 cases; one test-harness wording expectation differed from the correct rejection message. After adjusting that assertion, **22/22 focused tests passed, 0 failed, 0 skipped, exit 0**, with retrieved logs. This does not verify the full project Vitest suite, TypeScript compile, browser UI, authenticated SQL, RLS, or production deployment.

**Release gate remains closed:** PR #111 stays draft and unmerged, and the branch is not integrated with the latest main. The seven-check local verification command and all full-project/browser/accounting security checks remain necessary. No GitHub Actions/CI workflow was triggered, and no database migration, posting transaction, production record or deployment was changed.


## Post-merge Batch 7: local release-gate fail-closed hardening

**Date:** 2026-11-06. The original [Fixed Assets PR #111](https://github.com/linkbusinessadvisory/LinkBooks/pull/111) **has merged** into `main` at merge commit `b7d67d321444d5b811ea9d64eb3e8d146de609f4`. The feature branch for that PR was deleted after merge. The original PR's code, including the precision guard, is present on main. The module is **not production-ready** without full QA and deployment verification.

**Separate tooling change:** `feature/fixed-assets-release-gate-main-hardening-20261106` (review and merge tracked separately from the already merged PR #111). Changes are **only** to the local release-check script and its regression suite; no accounting API, journal, SQL, RLS, browser runtime, or deployment source is changed.

### Local release gate changes

`scripts/check-fixed-assets-release.mjs` now requires the following preconditions **before it runs any test or build command**:

1. Exact authorized Git origin `linkbusinessadvisory/LinkBooks` (it never prints a credential-bearing remote URL).
2. Git's top-level checkout directory exactly matches the script's project root.
3. The current branch is `main`, not a feature branch or a detached HEAD.
4. The Git worktree contains no modified or untracked files.
5. The local commit SHA matches the **locally fetched** `origin/main` tracking ref exactly.

The script performs no `git fetch` or remote network action. A matching tracking SHA does **not** prove the remote branch is current; the operator must run `git fetch origin --prune` immediately beforehand. The script refuses unsafe checkouts with exit status **2** and runs **zero npm tasks**.

The following **nine local checks** run sequentially on the verified checkout, with individual pass/fail results and an overall exit code of 0 for all passing or 1 if any fails:
- TypeScript (`npm.cmd run typecheck`)
- ESLint (`npm.cmd run lint`)
- Fixed Assets Vitest (`npm.cmd test -- src/lib/fixed-assets/`)
- Full Vitest suite (`npm.cmd test`)
- UI contracts (`npm.cmd run check:ui`)
- Lookup contracts (`npm.cmd run check:lookups`)
- Navigation contracts (`npm.cmd run check:navigation`)
- Production build (`npm.cmd run build`)
- Client bundle audit (`npm.cmd run check:bundle`)

The script does not invoke GitHub Actions/CI, migration deployment, `git push`, merge, or Vercel deployment, and does not treat nine local passes as final release approval.

### Repeatable non-CI test evidence

`scripts/check-fixed-assets-release.test.mjs` was added as a separate Node built-in test suite. An isolated Vercel sandbox with egress `deny-all` executed its tests using real temporary Git repositories and a mocked `npm` executable. **12 of 12 tests passed; zero failures, zero skipped; exit code 0.** Cases include a clean, locally synced main, wrong/old origin, withholding URL secrets, wrong/detached branch, changed and untracked files, absent or mismatched origin/main, correctly reported failing npm and argument refusal. Script syntax checking also passed.

These tests prove preflight and orchestration behaviour in a **Linux** sandbox only. The test suite now includes both a Unix `npm` mock and a Windows `npm.cmd` mock with OS-aware PATH configuration; its Windows branch still requires execution in the user's local PowerShell checkout. No actual project typecheck/Vitest/ESLint/build was executed in the isolated fixture.

### Remaining release blockers

- Actual nine-check project gate in a clean, recently fetched `main` checkout.
- Authenticated two-tenant RLS/permissions, posting idempotency, locked-period, FX and disposal accounting verification, and browser/mobile/accessibility QA.
- PR review and merge of the new release-gate-only change (separate from merged PR #111).
- Deployment repository alignment: the connected Vercel `linkbooks` project's last observed deployment is tied to the **old** `rohitmehra86/LinkBooks` repository, not the authoritative `linkbusinessadvisory/LinkBooks` repository. Reconnect/verify the correct project before any deployment claim.

### Recommended local commands

```powershell
cd D:\MyApp\LinkBooks
git status
# Save or commit unfinished Cursor work before changing branches.
git fetch origin --prune
git switch main
git pull --ff-only origin main
# The latest nine-check script is available after the new tooling PR is merged.
node --test scripts/check-fixed-assets-release.test.mjs
node scripts/check-fixed-assets-release.mjs
```

The final two commands must be executed on the local checkout only after the tooling PR is merged and the working tree is clean. They run no GitHub Actions. Record and share the output and exact main SHA before marking the release gate as verified.


## Release-gate postflight integrity (2026-11-06, separate follow-up)

**Verified issue:** The nine-check release script previously verified a clean, synced `main` only before running npm. A build/test task could modify tracked or untracked files, or alter checkout refs, and the gate could still print "PASSED." Such a result would not describe the exact reviewed source state.

**Change:** At the end of all nine local tasks, `scripts/check-fixed-assets-release.mjs` now re-reads branch, HEAD SHA, locally tracked `origin/main` and the Git working tree. If any differ from the initial clean-main baseline, it reports `FINAL GIT CHECK FAILED`, identifies the state as changed and returns exit status 1 **even when all nine npm commands individually passed**. It does not delete or reset any modified files.

**Non-CI verification:** Extended `scripts/check-fixed-assets-release.test.mjs` with real temporary Git fixtures and mocked npm tasks that deliberately modify a tracked file or create an untracked output after the initial preflight. The complete isolated Linux gate regression suite passed **14/14 cases, zero failures, zero skipped, exit 0**, with logs retrieved. Windows-specific invocation remains to be tested in the user's local checkout.

**Release scope:** Tooling-only: no accounting or Supabase schema/data changes, no GitHub Actions/CI initiated, no staging/production deployment. The 14 checks validate the orchestration script, not actual TypeScript/Vitest/build success. The nine full local tasks and authenticated accounting/role/browser QA are still pending for production approval.
