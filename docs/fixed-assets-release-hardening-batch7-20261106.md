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
