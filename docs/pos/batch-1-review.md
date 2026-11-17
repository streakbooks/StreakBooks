# Batch 1 review — partially completed

Draft [PR #238](https://github.com/linkbusinessadvisory/LinkBooks/pull/238). Real read-only `/pos` catalogue/cart preview; no sale/payment/stock/journal mutations. Scope and next dependencies are in [the tracker](tracker.md).

| Verification                        | Actual evidence                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| Unit/regression                     | 81 passed / 0 failed, 6 focused Vitest files                                         |
| Server integration                  | Mocked authentication/database boundary; live RLS untested                           |
| Browser                             | 6 passed / 0 failed isolated fixtures; actual screen, simulated services             |
| TypeScript                          | Passed with 6GB heap after test-only corrections and generated route tree            |
| Production build                    | Passed locally; no deployment                                                        |
| New POS lint/format                 | Passed                                                                               |
| Shared registry lint                | 2 formatting errors also reproduced on audited main                                  |
| Module/navigation                   | Passed                                                                               |
| Shared UI gate                      | Failed: references absent pre-existing Messages wrapper                              |
| GitHub CI                           | Not run; no check runs, baseline workflow commented out; concurrent #237 restores it |
| Migrations                          | None introduced/applied                                                              |
| Merge/staging/deployment/production | Not performed; production unverified                                                 |

Last fetched main: `18cf5454`; audited base `ddaff917`. Purchasing PRs #230–232 merged while working; no merge/conflict resolution was performed on this feature branch. GitHub reported it mergeable at draft creation. Future batches must refresh main and re-audit these dependencies.

## Changed files

- `docs/pos/README.md`
- `docs/pos/accounting.md`
- `docs/pos/architecture.md`
- `docs/pos/competitors.md`
- `docs/pos/database.md`
- `docs/pos/gap-analysis.md`
- `docs/pos/hardware.md`
- `docs/pos/offline.md`
- `docs/pos/payments.md`
- `docs/pos/prd.md`
- `docs/pos/requirements.csv`
- `docs/pos/rollout.md`
- `docs/pos/security.md`
- `docs/pos/tax-currency.md`
- `docs/pos/testing.md`
- `docs/pos/tracker.md`
- `docs/pos/workflows.md`
- `e2e/pos/cart.spec.ts`
- `e2e/pos/fixtures.ts`
- `e2e/pos/index.html`
- `e2e/pos/main.tsx`
- `e2e/pos/vite.config.ts`
- `playwright.pos.config.ts`
- `src/lib/modules/registry.ts`
- `src/lib/pos/catalogue-quote.functions.test.ts`
- `src/lib/pos/catalogue-quote.functions.ts`
- `src/lib/pos/catalogue-quote.test.ts`
- `src/lib/pos/catalogue-quote.ts`
- `src/routeTree.gen.ts`
- `src/routes/_authenticated/pos/index.tsx`
- `src/screens/pos/README.md`
- `src/screens/pos/index.tsx`
- `docs/pos/batch-1-review.md` (this report)

## Local PowerShell review

The cloud checkout does not modify the Windows project. Protect local changes before reviewing:

```powershell
cd D:\MyApp\LinkBooks
git status
if (git status --porcelain) { throw "Commit or stash changes first." }
git fetch origin
if ($LASTEXITCODE -ne 0) { throw "Fetch failed." }
git switch --detach origin/feature/pos-catalogue-quote-foundation-20261117
if ($LASTEXITCODE -ne 0) { throw "Checkout failed." }
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw "Installation failed." }
npm.cmd run dev
```

Use existing authorized development environment configuration, visit `http://localhost:8080/pos`. No migration is required. This preview must not be used to collect customer payment.

## Manual review

- In a dedicated test company, search name/SKU, Add, change quantity, Remove, Clear and Refresh; check inclusive/exclusive totals and company currency.
- Switch company: cart must clear and only active company's catalogue should load.
- Deny Sales view permission: both UI and direct server access must fail.
- Simulate quote/search failure: expect Try again and no stale total; retry should recover.
- Review desktop/tablet/mobile, light/dark themes, keyboard Enter/Tab, focus order and screen-reader announcements. Width/Enter fixtures passed; full accessibility remains unverified.
- Confirm no persisted orders, payments, stock movements or journals are created.

Next work: location ownership and dedicated POS permissions/configuration, isolated PostgreSQL RLS tests, register/session lifecycle, then atomic non-stock cash sale/payment/posting. Inventory/COGS, refunds, providers, country fiscal validation, offline/hardware and restaurant workflows remain unimplemented. Eight-platform research remains incomplete for Lightspeed/Clover. No production readiness claim. Merge, live migration and deployment require separate authorization.
