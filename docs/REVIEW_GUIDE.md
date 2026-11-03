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
