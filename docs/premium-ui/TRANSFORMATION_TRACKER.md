# Premium UI/UX Transformation Tracker

**Single source of truth** for the application-wide premium UI programme.  
**Authoritative repo:** https://github.com/linkbusinessadvisory/LinkBooks  
**Baseline main (Phase 0 audit):** `02397a65` (2026-11-18)  
**Progress rule:** a module is COMPLETE only when finished-screen DoD gates pass with evidence. Chrome inheritance alone is not completion.

## Programme summary

| Metric | Value | Evidence |
| --- | --- | --- |
| Modules in `MODULE_REGISTRY` | 34 | `src/lib/modules/registry.ts` |
| Sidebar modules | 29 | `check:modules` |
| Authenticated routes | 168 | `npm run check:browsing-coverage` |
| Supporting routes | 15 | `npm run check:browsing-coverage` |
| Modules COMPLETE (DoD) | 0 | No module has full gate PASS |
| Modules chrome-adopted / in-progress | 34 | Prior batches 1–22 + Batch 25 |
| Shared foundation Batch 25 | Merged | PR #271 → `2aafc864` |
| Transaction workspace Batch 26 | Merged | PR #272 → `c370c99c` |
| Line-grid keyboard + journals Batch 27 | Merged | PR #273 → `3697f35a` |
| Originality + Purchases PO Batch 28 | On main | `a610f1a5` (direct push) |
| Semantic colourful system Batch 29 | Merged | PR #274 → `4a16970c` |
| Bill sticky + honest controls + browsing Batch 30 | Merged | PR #275 → `d193bb0e` |
| Sales/purchases line keyboard + paste Batch 31 | Merged | PR #276 → `8cfa5280` |
| Expenses PersistedSwitch Batch 32 | Merged | PR #277 → `31c77d9a` |
| Light premium palette Batch 33 | On main | `21bb1311` — soft pastel blue, light sidebar, white surfaces |
| Soft interactions + money/journals Batch 34 | Merged | PR #280 → `2e268fb8` |
| Soft controls Batch 35 | Merged | PR #281 → soft alerts/badges/tooltips; HR enable PersistedSwitch |
| Excel-like line grids Batch 36 | Merged | PR #282 → `1cc8a3bb` |
| Full-page Create + compact density Batch 37 | Merged | PR #283 → `fd080f6a` |
| Remove redundant line move arrows | Merged | PR #284 → `fc605a7c` |
| Remaining New screens + money/journal routes Batch 39 | Merged | PR #285 → `f20967ac` |
| Density acceptance Batch 40 | Merged | PR #286 → `b106f471` |
| Grouped module nav Batch 41 | Merged | PR #287 → `8280a5b7` — HR eight-group IA + shared GroupedModuleSubnav; CRM/PM/Expenses |
| Full-width fluid line grids Batch 42 | Merged | PR #288 → `66359d79` — fluid Description/Item columns, compact price-list chrome, density fill assert ≤24px |
| HR five-group nav + Payroll grouped Batch 43 | Merged | PR #290 → `b0e824e5` — 5-group HR IA, Workforce Insights, ListWorkspace `subnav`, Payroll GroupedModuleSubnav |
| Money routing ownership Batch 44 | Merged | PR #291 → `8fef011c` — Banking Spend/Receive Money canonical routes + entry-point audit |
| Money editor + CRM/PM subnav Batch 45 | Merged | PR #292 → `e186afd5` — Spend Money spreadsheet roll-up; Receive Save & add another; CRM/PM ListWorkspace subnav |
| Create workflows Batch 46 | Merged | PR #293 → `9a9e6b6f` — journal/recurring/transfer full-page creates; product/claim Create deep-links; local gates PASS; CI blocked by org billing |
| Create edit hardening Batch 47 | Merged | PR #294 → `32b2c6db` — recurring edit URLs; bank documents New CTA; CHECKLIST sync; merge-without-CI-billing standing rule |
| Create hardening Batch 48 | Merged | PR #296 → `0efe21fb` — transfer Vitest fix; Banking hub New; EM create ownership; Sheets deleted; see CI_BILLING_AND_CREATE_WHY.md |
| Create surfaces Batch 49 | Merged | PR #297 → `de6913c6` — transactions New CTAs; createNavTarget; EM claim TransactionWorkspace |
| Create hardening Batch 50 | Merged | PR #298 → `e0f0d8c0` — EM list-only; palette intent; empty CTAs; SO workspace |
| Create intents Batch 51 | Merged | PR #299 → `0be7b88f` — sales_order CREATE; FA/SO `?create=true` |
| Create honesty Batch 52 | Merged | PR #301 → `fe0ed927` — requisitions workspace; product/contacts/projects/palette |
| Create routes Batch 53 | Merged | PR #303 → `7f098686` — SO /new; requisition CREATE; customers/suppliers/budgets/CRM |
| Create workspaces Batch 54 | Merged | PR #305 → `cf20b0a0` — product/FA/payroll workspaces; CRM CTAs |
| Directive gap consolidation Batch 55 | Merged | PR #307 → `28933021` — New Account; product `/new`; sticky create URLs; gap matrix; payroll import fix |
| Production typecheck + FA /new Batch 56 | Merged | PR #309 → `8e990f85` — typecheck green; FA /new; sticky project create |
| Sticky create honesty Batch 57 | Merged | main `5684bd7a` — budgets/payroll/requisitions sticky create; EM cancel |
| Empty CTA honesty Batch 58 | Merged | PR #313 → `3060d166` — HR/CRM/PM empty New CTAs |
| Empty CTA wave 2 Batch 59 | Merged | PR #315 → `5847e317` — remaining HR/PM/CRM empty New CTAs |
| Empty CTA wave 3 Batch 60 | Done | [PR #317](https://github.com/linkbusinessadvisory/LinkBooks/pull/317) → `b52e1c88` |
| Empty CTA wave 4 Batch 61 | Done | [PR #319](https://github.com/linkbusinessadvisory/LinkBooks/pull/319) → `b03a9fab` |
| Empty CTA wave 5 Batch 62 | Done | [PR #321](https://github.com/linkbusinessadvisory/LinkBooks/pull/321) → `6ab92ab6` |
| Empty CTA wave 6 Batch 63 | Done | [PR #324](https://github.com/linkbusinessadvisory/LinkBooks/pull/324) → `41468621` |
| Empty CTA wave 7 Batch 64 | Done | [PR #328](https://github.com/linkbusinessadvisory/LinkBooks/pull/328) → `10876d52` |
| Claims spreadsheet Batch 65 | Done | [PR #332](https://github.com/linkbusinessadvisory/LinkBooks/pull/332) → `e3a691de` |
| Claims totals + workspace Batch 66 | In progress | TotalsSummary on claim create; check:workspace spend/claims |
| Claim keyboard + receive-money Batch 67 | Superseded by Batch 68 | Keyboard/paste on claims; receive-money check:workspace |
| Spend/PO/CN keyboard Batch 68 | Superseded by Batch 69 | Keyboard/paste on spend money, PO, purchase CN; workspace gates |
| Allocate/transfer TotalsSummary Batch 69 | Superseded by Batch 70 | Receipt/payment totals; payment allocate table; transfer totals |
| Recurring/SO/batch-pay Batch 70 | Superseded by Batch 71 | Recurring + sales order totals; batch payment TransactionWorkspace |
| Requisitions chrome Batch 71 | In progress | Requisitions FormGrid/TotalsSummary; claims FormGrid; journal/sales locks |
| Staging / Section 18 go-live | Blocked | No E2E staging credentials on workstation |
| Production DoD claim | Not ready | `npm run check:section18` |

## Accounting and financial workspace release

[PR #311](https://github.com/linkbusinessadvisory/LinkBooks/pull/311) combines the
compact Accounting workspace with the shared Create navigation and release-gate
repairs. The release retains the newer creation workflows from main.

- Accounting has native single-row tabs, URL-backed chart filters, sticky column
  headers and contextual actions. Journal editors and Bank Documents now render
  through their parent outlets. Legacy journal and bill edit links redirect before
  rendering.
- Property Management uses searchable record lookups. POS supports selecting between
  open register sessions. The isolated POS suites exercise sale, refund, and
  register concurrency. The POS and Platform gate repairs preserve production SQL
  and grants.
- A signed-in browser posted a balanced manual journal, Spend Money, and Receive
  Money in disposable Supabase organisations. Each posting had two expected
  minor-unit lines and denied reads by a second organisation. The browser also
  saved a recurring journal template on mobile and read it back in the list.
- On the combined release tree, typecheck, zero-warning lint, production build,
  bundle budget, module and navigation contracts, lookup architecture, and all
  4,209 Vitest cases passed. The release batch also passed 137 browser fixture
  cases, 54 accounting invariant cases, and all four PostgreSQL fixture suites.
- GitHub Actions reported an organisation billing block before its jobs started.
  This release follows the repository's documented billing exception for locally
  verified changes.
- Hosted staging and production acceptance remain open. Section 18 still requires
  authenticated staging, hosted two-tenant permission and accounting evidence,
  manual accessibility review, and external integration sandbox validation.
  Exhaustive module acceptance remains open.

- Recurring journal schedules can be edited from the journal list by users with
  manual journal permission. Edits cover the name, repeat interval, end date and
  total posting limit. The editor preserves the existing posting history and next
  scheduled date, and detects concurrent changes before saving.

## DoD gates (every screen)

1. Visual consistency (LinkBooks tokens)
2. Functional workflows (real backends)
3. Browser-like navigation
4. Responsive behaviour
5. Accessibility
6. Security / accounting safety
7. Automated tests executed
8. Authenticated manual validation

## Module status (live registry)

| Module | Path | Premium status | Transaction editor | Browsing | Verdict |
| --- | --- | --- | --- | --- | --- |
| Dashboard | `/` | partial | N/A | partial | IN PROGRESS |
| Banking | `/banking` | in-progress | Money docs TransactionWorkspace + TotalsSummary | partial | IN PROGRESS |
| Point of Sale | `/pos` | in-progress | specialized | unverified | IN PROGRESS |
| Sales | `/sales` | in-progress | TransactionWorkspace + full-width fluid spreadsheet lines (2 default rows, hide/resize, bottom tax, compact price list) | partial | IN PROGRESS |
| Purchases | `/purchases` | in-progress | Sticky actions + full-width fluid bill lines (Columns, resize, vertical tax) | partial | IN PROGRESS |
| Expenses | `/expense-management` | in-progress | Enable toggle persists via PersistedSwitch | partial | IN PROGRESS |
| CRM | `/crm` | in-progress | N/A kanban | partial | IN PROGRESS |
| Property Management | `/property-management` | in-progress | later | partial | IN PROGRESS |
| HR | `/hr` | in-progress | Enable toggle persists via PersistedSwitch | partial | IN PROGRESS |
| Contacts | `/contacts` | in-progress | N/A | partial | IN PROGRESS |
| Products & Services | `/products-services` | in-progress | N/A | partial | IN PROGRESS |
| Files | `/files` | in-progress | N/A | partial | IN PROGRESS |
| Accounting | `/accounting` | partial | Journals TransactionWorkspace + debit/credit paste | partial | IN PROGRESS |
| Budgets | `/budgets` | in-progress | N/A | partial | IN PROGRESS |
| Projects | `/projects` | partial | N/A | unverified | IN PROGRESS |
| Fixed assets | `/fixed-assets` | partial | later | partial | IN PROGRESS |
| Payroll | `/payroll` | partial | later | partial | IN PROGRESS |
| Reports | `/reports` | partial | N/A | partial | IN PROGRESS |
| Tax | `/tax` | partial | later | unverified | IN PROGRESS |
| Accountant | `/accountant` | partial | later | partial | IN PROGRESS |
| Firm | `/firm` | partial | N/A | partial | IN PROGRESS |
| Advisors | `/advisors-admin` | partial | N/A | partial | IN PROGRESS |
| Advisors portal | `/advisors-portal` | partial | N/A | partial | IN PROGRESS |
| Action Center | `/notifications` | partial | N/A | partial | IN PROGRESS |
| App Store | `/app-store` | partial | N/A | unverified | IN PROGRESS |
| Developer | `/developer` | partial | N/A | unverified | IN PROGRESS |
| Messages | `/messages` | in-progress | Notification toggles persist via PersistedSwitch | partial | IN PROGRESS |
| AI Assistant | `/ai-assistant` | partial | N/A | partial | IN PROGRESS |
| Settings | `/settings` | partial | N/A | partial | IN PROGRESS |
| Help | `/help` | partial | N/A | partial | IN PROGRESS |
| Platform / Profile / Onboarding / Auth | various | partial | N/A | partial | IN PROGRESS |

**Verified completion percentage:** 0% modules COMPLETE (DoD). Foundation reuse ≈ chrome adoption across high-traffic surfaces (49 via `check:workspace`).

## Shared components

| Component | Status | Batch |
| --- | --- | --- |
| ListWorkspace / RecordWorkspace | existing | 1–22 |
| Design density tokens | Batch 25 | 25 |
| TransactionWorkspace | scaffolded | 25 |
| TotalsSummary | scaffolded | 25 |
| SplitButton | scaffolded | 25 |
| EditableLineItemGrid | chrome scaffold | 25 |
| FormGrid | added | 25 |
| Spreadsheet keyboard/paste | keyboard helpers + bill/journal/purchase numeric | 27–30 |
| MeasuredProgress / PersistedSwitch | added | 30 |

## Batch ledger pointer

See [IMPLEMENTATION_BATCH_LEDGER.md](./IMPLEMENTATION_BATCH_LEDGER.md). Batches 1–22 merged; 23 migrations / 24 staging reserved; **25+** active transformation.

Update this file after every merged batch with PR URL, commit SHA, and executed test evidence only.
