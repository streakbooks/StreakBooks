# LinkBooks modernization — implementation handover

**Updated:** 4 November 2026 · **Verified source:** `linkbusinessadvisory/LinkBooks` · **Scope:** foundation, advanced reporting and the first three P0 accounting-integrity fixes. **Not a production compliance certification.**

## Delivered to main and how to review

| Feature | PR | Merge commit | What changed |
|---|---|---|---|
| Professional Account Transactions | [#17](https://github.com/linkbusinessadvisory/LinkBooks/pull/17) | `04f15ea1` | Searchable, sortable, configurable single-account ledger explorer, saved/visible screens |
| Universal presentation explorer | [#18](https://github.com/linkbusinessadvisory/LinkBooks/pull/18) | `ef53489f` | Loaded-row customization, column choice, filters, grouping and URL/saved state across reporting catalogue |
| Architecture, gap analysis and source hygiene | [#19](https://github.com/linkbusinessadvisory/LinkBooks/pull/19) | `f5c058e6` | Architecture/roadmap, clean-room IP policy, tracked-`.env` removal, repository gate, README |
| Unified multi-account financial reporting | [#20](https://github.com/linkbusinessadvisory/LinkBooks/pull/20) | `5b1bab70` | Multi-account pickers and real company-scoped account-based GL and summaries, account scope and group choices |
| Fail-closed ledger health | [#21](https://github.com/linkbusinessadvisory/LinkBooks/pull/21) | `65beabfb` | Eight required DB integrity checks, no silent pass on missing evidence, explicit `accounting.view`, tenant-scoped results |
| Year-end/close exactness | [#22](https://github.com/linkbusinessadvisory/LinkBooks/pull/22) | `ac851d29` | Only active posted closing journals count; fail on DB errors; safe BigInt-to-number boundaries |
| Accounting Ledger Health screen | [#23](https://github.com/linkbusinessadvisory/LinkBooks/pull/23) | `0679cd10` | New Accounting tab with on-demand checks, keyed per-company results, keyboard-friendly native URL and semantic heading |

### Source-level / CI verification
- [PR #21 exact-head CI](https://github.com/linkbusinessadvisory/LinkBooks/actions/runs/41696750497) — green.
- [PR #22 exact-head CI](https://github.com/linkbusinessadvisory/LinkBooks/actions/runs/41697565330) — green.
- [PR #23 exact-head CI](https://github.com/linkbusinessadvisory/LinkBooks/actions/runs/41698757672) — **1,830 unit tests passed in 250 files**, 4 repository checks, TypeScript, changed-file ESLint, isolated PostgreSQL workflow/cash-history tests, navigation checks and production build all passed.
- The authenticated browser **staging** job was skipped. Playwright test discovery passed; that does **not** mean live signed-in journeys ran.
- Each merge starts its own main-branch gate; verify the newest main run before deploying.
- No production migration, package installation, tax filing submission or live journal posting was performed for PR #21–#23.

## Windows/PowerShell local setup and checks

**Environment:** Node.js 22 and npm, Git, valid *publishable* credentials for the authorized Supabase project. Never put service-role or `sb_secret_` credentials in `VITE_` variables.

```powershell
cd D:\MyApp\LinkBooks
git status --short
# If generated src/routeTree.gen.ts has local modifications, back it up:
git stash push -m "Local generated route tree before update" -- src/routeTree.gen.ts
git switch main
git pull --ff-only origin main
# Keep your existing local .env; it is ignored by Git.
npm ci
npm run check:repository
npm run typecheck
npm test
npm run lint
npm run build
npm run dev
```

Open `http://localhost:8080`. A previously tracked `.env` is intentionally no longer version-controlled. If this is a fresh checkout, copy `.env.example` to `.env` and fill in valid project URL and publishable key for both browser and server configuration. Never commit that file.

### Seed data and logins
Existing LinkBooks users sign in normally; **no new usernames, passwords or user accounts were created**. An existing **Demo Company** uses the real posting engine; do not reset or reseed live client companies. No new demo fixture was inserted into the connected project in this milestone. For fixtures, review `tests/fixtures/` and the existing demo initialization screens. Authenticated staging tests require separately provisioned *non-production* credentials via GitHub secrets; none are printed here.

## Manual acceptance cases

### A. Ledger Health (new user-visible path)
1. Sign in with a user who has `accounting.view`, select the intended company, then visit **Accounting → Ledger health** or `/accounting?tab=health`.
2. Click **Run health check**. Expect 8 checks: trial balance, journal balance, orphans, document journals, AR, AP, period locks and automation.
3. Check pass/warn/fail/NA text, posted journals/lines and date, details of failing checks, and available **Review** links. Zero-journal books can legitimately pass **only when all required checks are returned**.
4. Switch to a different company: previous results should disappear until run again. Refresh or Ctrl+Click the tab; the selected URL should persist.
5. With a different authenticated user lacking the permission or company membership, the RPC must reject access. This requires real second-role staging credentials.

### B. Period close and year-end
1. **Accounting → Period close**: choose a valid end date and examine bank, draft document, AR/AP, tax and year-end evidence.
2. Test on a **synthetic/test company only**: when a posted, unreversed closing journal exists, Year-end shows complete. A reversed/draft journal does not. Check errors do not silently report success.
3. The large-number boundary is covered by `src/lib/accounting/money.test.ts` and `period-close.functions.test.ts`. An amount greater than JS safe integer throws instead of silently rounding.
4. **Do not post/reverse a real client's year-end journal to test the screen.** Confirm actual ledger TB/GL/BS against source documents separately.

### C. Reports: existing #17–#20
1. Open **Reports**, select General Ledger/Account Transactions, and switch between one and multiple accounts using the account picker. Verify company scope, archived/all accounts and period boundaries.
2. Compare a single-account running balance to GL/TB for the same currency, period and basis. Selected-account Trial Balance subtotals need not balance; the UI labels this distinctly.
3. Try **Customize view** to select/reorder/filter columns and save a view. Remember its filters operate on loaded rows and are not accounting calculations.
4. Test CSV/XLSX/PDF exports and source drill-down on a non-client dataset; do not assume page-scoped exports represent the entire ledger.

## Known unfinished or external gates

- **P0:** complete **signed-in** tenant/role/period-lock matrix, full ledger/AR/AP/control reconciliation, historical allocation accuracy, banking duplicate/matching and region-specific US/UK/AU/NZ tax truth tables.
- **P0:** HMRC MTD, ATO BAS, IRD GST and state-level US sales-tax filing connectors **must not be represented as certified** without provider/regulator approval, sandbox receipts and professional review.
- **P0:** privileged SQL function authorization review, MFA and negative tenant tests across actual browser/server/RLS boundaries. Live security advisor warnings need deliberate triage, not blanket privilege changes.
- **P0/P1:** server-side large-ledger pagination and all-matching export; current presentation explorer is loaded-row only. Scheduled email/pack delivery must be verified end to end.
- **P1:** safe exact-string UI/API support for exceptionally large minor-unit balances; active year-end repost after reversal needs idempotency review; FX, inventory/COGS cost layers, consolidation, intercompany and practice task workflows need additional acceptance.
- **P1/P2:** data migration, API/webhooks, payroll integration, performance >100,000 ledger lines, synthetic demo fixtures and production rollout tests.
- **Supply chain:** earlier local `npm ci` reported 22 moderate npm advisories; audit transitive dependencies and do not blindly run `npm audit fix --force`.
- **Tag limitation:** the available GitHub connector can commit and merge but does not provide tag creation. Do not claim a release tag exists. Commit hashes above are immutable rollback checkpoints.
- **Frontend runtime:** successful CI builds do not prove a user's local browser, `.env`, Supabase authentication or deployed Vercel runtime; those require separate validation.

## Next engineering milestone
Proceed from [ROADMAP.md](ROADMAP.md), starting with complete **authenticated accounting integrity and multi-company authorization fixtures**, then region-specific tax and bank controls. Reuse existing accounting SQL and routes, avoid destructive changes, and require a feature design, tests, financial sign-off and rollback evidence for every major module.

## 4 November 2026 continuation — banking and tax safeguards

| Area | PR | Merge checkpoint | Delivered and validated |
|---|---|---|---|
| Account-focused reports (concurrent independent work) | [#25](https://github.com/linkbusinessadvisory/LinkBooks/pull/25) | `6340e270` | Budget/asset/tax GL account focus. CI green; signed-in financial acceptance still required. |
| QIF bank statements | [#26](https://github.com/linkbusinessadvisory/LinkBooks/pull/26) | `5b947a21` | New original Bank/CCard QIF parser, explicit date-order selection, normalized import preview, duplicate review, retained tenant-scoped server workflow. |
| Bank import input integrity | [#27](https://github.com/linkbusinessadvisory/LinkBooks/pull/27) | `faa08c84` | Real date validation, no lossy minor-unit conversion, strict duplicate/row IDs and bounded request types for CSV, OFX/QFX and QIF. |
| Tax input safety | [#28](https://github.com/linkbusinessadvisory/LinkBooks/pull/28) | `e1ae798b` | Reject invalid/unsafe monetary Numbers, unknown tax treatment and quantity precision beyond six decimals. Existing tax formulas remain unchanged. |

**CI:** [PR #26](https://github.com/linkbusinessadvisory/LinkBooks/actions/runs/41756745252), [PR #27](https://github.com/linkbusinessadvisory/LinkBooks/actions/runs/41757833009) and [PR #28](https://github.com/linkbusinessadvisory/LinkBooks/actions/runs/41758651721) all passed exact-head full quality gates. The latest PR #28 head had **1,881 passing unit tests across 253 files**, 4 repository-hygiene tests, TypeScript, changed-file ESLint, isolated PostgreSQL checks, navigation discovery and production build. Post-merge `main` CI must also be checked for the latest merge and this documentation update. Authenticated staging browser checks remain **skipped**.

### Local manual review — QIF
1. Update local `main` following the PowerShell commands in this guide. Keep your existing `.env` and use an authorized login.
2. Select a **Demo Company or a separate synthetic test company**. Confirm it has a test bank account in the expected currency (e.g. GBP).
3. Open **Banking → Import statement**, choose that bank account and select `tests/fixtures/banking/demo-statement.qif`.
4. Choose **Day / month / year**. Confirm the preview contains two rows dated **2026-11-03** and **2026-11-04**, with amounts **+250.00** and **−12.35** in a two-decimal bank currency, payees and demo references. If the bank account currency differs, verify the file's amounts using that account's declared currency; QIF itself does not specify currency.
5. On a **disposable test company only**, import. Expect uncategorised statement lines, not posted sales/purchase journals. Re-upload the same file to review duplicate detection. Do not bypass duplicate warnings without a reason.
6. Change the date order to **Month / day / year** and verify ambiguous source dates are interpreted differently; do not import the wrong interpretation. QIF split records, multi-account exports and investment records are expressly unsupported.
7. Confirm previously saved CSV column mappings still work after QIF import. Test invalid bank dates via a synthetic CSV and ensure submission is refused.

### Local regression review — tax and ledger
- Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build`.
- Unit tests in `src/lib/tax/tax-math.test.ts` verify a 20% exclusive and inclusive calculation, numeric-safety failures, quantities with up to six decimals, and exact BigInt values.
- In synthetic invoices/bills, verify legitimate decimal quantities still calculate as before. More than six decimal quantity places now cause an explicit validation error rather than being silently truncated.
- **Do not** run unverified filing flows or post/reverse real client transactions for QA. Country packs remain configuration scaffolds and are not regulator-certified.

### Pending user-side access and external requirements
No new demo login was created; use your existing authorized test account. Authenticated negative tests need **separate non-production company memberships and roles**. Regional filing needs HMRC/ATO/IRD or approved partner access and sign-off, and US sales tax needs state-by-state jurisdiction and nexus controls. No tax submission or live client posting was carried out.

### Remaining backlog after this batch
**P0:** authenticated cross-tenant/RLS negative matrix, privileged-function audit, period locks and complete GL↔TB↔BS↔AR/AP reconciliations, bank-feed/large-ledger controls, regional tax return evidence, exact full-result exports. **P1:** FX revaluation, fixed-asset inventory/COGS costs, consolidation and intercompany eliminations, scheduled report email, practice management workflows. **P2:** payroll integration and advanced automation. Browser accessibility, 100k+ row performance, dependency licensing, npm advisories and country compliance require independent completion.

This checkpoint includes two operationally important *limits*: QIF imports lack bank-generated FITIDs (heuristic duplicates), and tax input validation does **not** guarantee country-specific return accuracy.

## 4 November 2026 continuation — FX posting and historical reporting

| Milestone | Pull request | Merge commit | Scope and status |
|---|---|---|---|
| Cash-basis Account Transactions and General Ledger | [#30](https://github.com/linkbusinessadvisory/LinkBooks/pull/30) | `4244b949` | Source-backed recognition ledger and fail-closed account filter, still bounded by data/recognition limits. |
| Cash General Ledger paging | [#31](https://github.com/linkbusinessadvisory/LinkBooks/pull/31) | `396fe6a9` | Page-scoped cash ledger retrieval with full prior running balance; page exports remain page-scoped, NOT all history. |
| Journal posting FX, dates, and exact amount integrity | [#32](https://github.com/linkbusinessadvisory/LinkBooks/pull/32) | `b91f3e06` | No silent 1:1 when an explicit currency's lookup is missing/invalid; exact minor units and genuine dates required before posting. |
| Historical FX report rate provenance | [#33](https://github.com/linkbusinessadvisory/LinkBooks/pull/33) | `5a95e52c` | Known foreign-currency journals without their posted rate fail instead of displaying unconverted amounts; unsafe numeric JSON amounts rejected, exact integer text preserved. |

**Feature-head CI:** [PR #32](https://github.com/linkbusinessadvisory/LinkBooks/actions/runs/41761885315) and [PR #33](https://github.com/linkbusinessadvisory/LinkBooks/actions/runs/41762615240) completed successfully with typecheck, lint, all unit tests, isolated PostgreSQL, navigation and production build. PR #31 main-branch CI also passed. The latest combined main run and this documentation PR should be verified independently before deployment. Authenticated staging browser jobs were **skipped**, not passed.

### Source-backed integrity check (read-only)
On 4 November 2026 the connected Supabase project had 38 posted journals, **zero journals in a currency different from the company's base**, and therefore **zero foreign journals missing a posted FX snapshot** in that sample. This is not evidence that currency conversion works in production: use the synthetic staging matrix below.

A read-only inspection of the deployed `public.lookup_fx_rate_to_base(uuid, char, date)` found it is SECURITY DEFINER, **not executable by anon**, and includes a company-membership check before accessing rates. No grants, permissions, rate records or SQL function definitions were changed by these PRs. Do not assume the other privileged RPCs have equivalent checks.

### Non-production manual acceptance — exchange rates
1. With a **disposable synthetic GBP-base company**, create active GL accounts, an open financial year and an authorized accountant/owner test user.
2. Post a balanced **GBP** journal dated 2026-11-04 without an explicit FX rate. It should post with a base rate of 1.
3. Attempt a balanced **EUR** journal with no explicit FX rate and no valid prior manual rate; it **must fail**, and the posted journal count must be unchanged.
4. Add a date-appropriate **manual EUR→GBP** rate via the existing Settings UI. Post another balanced EUR journal; verify its journal snapshot matches the selected rate and both debit and credit appear correctly converted in GL and TB.
5. Try an explicitly verified rate for another synthetic foreign journal. A rate of 0, negative, infinite or not-a-number must be refused before posting.
6. Try non-calendar dates (2026-02-29, 2026-04-31) and impossible/earlier auto-reversal dates; ensure none create a journal or reversal schedule. Test 2028-02-29 as a valid leap day.
7. For a synthetic posted EUR journal with no rate snapshot (inject **only into an isolated test database**, never actual client books), confirm the ledger report fails with the clear missing-snapshot error rather than showing the EUR amount as GBP.
8. Test JPY (zero decimals), USD/GBP (two) and KWD (three) with independent expected base minor units, then reconcile Trial Balance totals and each source posted line. Signed-in users from another organization must be denied.
9. Check that Account Transactions, cash General Ledger pagination and export scopes are clearly labelled. Neither presentation-only customization nor a page-scoped file is necessarily an all-records accounting export.
10. Do not alter client historical FX snapshots to make a report appear green; investigate missing source rates and authorize corrections through the established accounting process.

### Additional outstanding work
- **P0** Complete independent signed-in cross-company/role tests, period locks, all posting pathways and AR/AP dated balances; certify source-backed GL↔TB↔BS reconciliation.
- **P0** Currency-specific posting FX is stricter, but FX revaluation, historical settlement, reversal, rate source policy and country-specific amounts still require accounting acceptance.
- **P0** Server paging and complete matching-result export for all financial reports, including 100,000+ posted lines, require benchmarking; PR #31 is cash-ledger paging, not universal export.
- **P0** UK VAT/MTD, AU GST/BAS, NZ GST/IRD and US state sales-tax filings require regulatory/provider agreements, actual return reconciliation and sandbox receipts.
- **P1** Inventory cost layers, fixed asset and intercompany controls, consolidation, practice workflows and verified scheduled delivery remain incomplete.
- **Release** Node dependency audit, signed-in Playwright, staging performance, disaster recovery rehearsal and independent accountant sign-off are not replaced by a green GitHub workflow.
