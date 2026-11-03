# Financial reporting development batch — 3 November 2026

## 1. Completed

Implemented the fixes and forecast functionality described in [the scope audit](reporting-scope-audit-2026-11-03.md). This includes repository lint formatting, mixed-cell exports, server capture provenance, view/export permissions, synchronized management dates, complete forecast comparisons/downloads, integer FX correction, historical-AP safeguards, strict receivables access/dates, and complete depreciation-account discovery. Previous catalogue/range fixes remain on the same branch. [Fresh official-product research](reporting-benchmark-2026-11-03.md) informs the independent implementation.

This is a tested incremental batch, not completion or production certification of the full original brief.

## 2. Already existing

Preserved the catalogue and all existing runners, statement engines, saved reports, favourites/recent activity, custom builder/formulas, permission/RLS/entitlement boundaries, asset/budget modules, lifecycle/pack/scheduler APIs and loaded-screen export scope. The newest Dashboard/Bookkeeping Attention Centre work on main was merged into this branch without changing it. No accounting source data was edited and no Supabase schema migration was applied.

## 3. Pending

See the report-by-report inventory and dependency matrix in the scope audit. In particular: full authenticated ledger/export/role/lifecycle acceptance; historical AP event history; wider reporting UI/customization/analysis coverage; source-supported additional reports and pack sections; country-specific tax validation; real delivery provider/domain/secret verification; independent accounting/security review; and final required GitHub checks/approvals before merge. These are internal implementation gaps and external verification gates, not merely a credential issue.

The shared FX fix affects calculations using the existing TypeScript converter. The observed database has zero currently posted foreign journals using a nonunit integer rate, but that does not certify all historical use. Do not rewrite posted data automatically. The database ledger RPC conversion already uses numeric multiplication, rather than the erroneous string concatenation fixed in TypeScript.

Aged Payables deliberately rejects past/future as-at requests that the current allocation counters cannot reconstruct. The current company-local date snapshot remains available, with explicit snapshot basis and control diagnostics. Dated allocation/reversal history is required to safely restore historical support. Missing foreign FX rates fail explicitly instead of mislabelling foreign minor units as base currency.

## 4. Testing

Final code checkpoint: `63543da31a3a2689adebf34c0839377761bf3099`.

| Check | Result |
|---|---|
| Full unit suite | **1,654 passed** |
| Reporting browser component suite | **21 passed** |
| Native-navigation browser suite | **5 passed** |
| TypeScript | **Passed** |
| Whole-repository ESLint | **Passed: 0 errors; 20 existing warnings** |
| Production build | **Passed**, with framework/configuration warnings |
| Native navigation source audit | **Passed**, 23 files and 11 reporting tabs |
| Lookup architecture audit | **Passed**, 132 declarations and zero violations |
| Diff whitespace | **Passed** |
| Authenticated staging test discovery | **11 tests discovered**, including four newly added reporting flows |
| Authenticated staging execution | **Not executed**: staging URL/authorized account/session unavailable |
| Actual email delivery | **Not executed**: provider/sender verification unavailable; no email sent |
| Live financial certification | **Not claimed** |

New export regressions reproduced nine failures before their fix; four new integer-FX cases also failed before their fix. The final complete suite passes. Server-function tests use isolated authority mocks and actual generated PDF/XLSX/CSV bytes; they are not authenticated browser proof. Forecast arithmetic covers exact large amounts, projected losses, zero denominators and absent completed-month actuals.

Read-only database evidence: 38 posted journals; zero unbalanced, zero fewer-than-two-line journals, zero cross-company lines; all nine reporting tables have RLS enabled. These aggregate checks do not prove every policy or subsidiary control reconciliation. No database writes were made.

## 5. GitHub

Repository: https://github.com/linkbusinessadvisory/LinkBooks . Branch: `feature/reporting-inclusive-ranges`. [Draft PR #12](https://github.com/linkbusinessadvisory/LinkBooks/pull/12).

Relevant commits: `3f3e26e` range correctness; `c8bcf5c` catalogue discovery; `d2f4ce3` lint formatting; `57de205` integration of the current authoritative main; `6c83ff4` FX/ageing/cash-flow integrity; `2e842ce` export/provenance security; `63543da` forecast comparisons/downloads. Follow-up documentation commits may advance the branch. No published history was rewritten.

At the time this record was written, GitHub quality-gates run 41653260666 for the code checkpoint was in progress; no CI success is inferred. Documentation pushes trigger checks for their own head. PR remains draft, **not merged**. No live deployment or production migration was performed.

## 6. User testing at localhost

1. Run `npm run dev` in the repository, visit http://localhost:8080, sign in with an authorized account, and select a test company with posted sample data.
2. **Catalogue:** Reports → All reports. Set dates, search `profit loss`, select Financial Statements and refresh. Filters should remain. Search `aged` while keeping Financial Statements: zero results should retain the chosen category. Clear filters should restore reports without clearing dates.
3. **Inclusive filters:** Open Profit and Loss → Customize report → Filters. Add Journal date → Between and use the same date twice. Apply, save through the existing saved-view controls, then reopen: both endpoints must remain. Exported filter notes must retain them.
4. **Screen export fidelity:** Open Account Transactions or General Ledger with posted rows containing journal/source/reference text, then Download report → Excel workbook. Text must remain text; leading-zero codes must not lose zeros, genuine monetary amounts must be numeric when within Excel precision, and large exact values must not be rounded. Repeat PDF and CSV and verify the loaded-row/page scope note. A user without export permission must not download; a revoked/no-view request must fail server-side.
5. **Synchronized dates:** Reports → Management. Edit the management dashboard name without saving, change the Reports Centre dates, and verify the local From/To controls follow them without losing the name. Changing management From/To should update the top controls and URL. This does not automatically rewrite saved forecast assumptions.
6. **Forecast comparisons:** In Management → Forecasts & scenarios, choose complete historical baseline months, a forecast start after that baseline, and explicit scenario assumptions. Calculate forecast. Inspect projected/actual revenue, expenses and profit plus amount/percentage variances. Future/incomplete months must not show invented actuals; zero projection denominators must say Unavailable. Negative profit denominators use their absolute value for percentages. The wide table scrolls within its keyboard-focusable region on mobile.
7. **Forecast downloads:** After a successful calculation, choose Download forecast → PDF / Excel workbook / CSV. Check the selected forecast period, baseline, scenario assumptions and comparisons. Exports recapture authorized ledger facts on the server; a later posting may legitimately change the export versus an earlier preview. Projections must be labelled as operating forecasts, not posted balances or cash forecasts. No email is sent.
8. **Payables integrity:** Reports → Aged Payables at the company's current local date. Current outstanding bills should load with snapshot basis and control-account diagnostics. A past/future date should explain the missing dated allocation history rather than show today's payments as historical. A foreign bill missing its posted exchange rate should fail explicitly.
9. **Receivables:** A user with company membership but no reports.view permission must be denied. Normal dated receivables retain currency separation. A nonexistent date such as 30 February must be rejected before querying accounting data.
10. **Indirect cash flow:** On a test company with more than 1,000 fixed assets, ensure depreciation expense accounts introduced after the first page are included. A failed asset query must display an error rather than silently remove the noncash adjustment.

## 7. Next development

Complete the authenticated staging financial/export/lifecycle matrix and required review. Then implement append-only AP payment/credit/reversal history in a reviewed, tested database change before historical ageing is enabled; broaden report customization and pack sections only where reliable source capture exists. The remaining full brief must not be described as complete or merged on the basis of this batch.
