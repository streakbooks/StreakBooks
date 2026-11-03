# Advanced reporting scope audit — 3 November 2026

Authoritative repository: `linkbusinessadvisory/LinkBooks`. This is a source-level functional audit with unit/component-browser evidence and bounded read-only database checks. It does not certify signed-in acceptance, all report runners, legal/tax compliance, or completion of the master brief. Earlier documents referencing `rohitmehra86/LinkBooks` are historical evidence, not the target repository.

## Implemented in this branch

- Inclusive date/amount Between filters preserve both endpoints and reject malformed surplus values.
- Catalogue discovery persists query/category/date state, supports multiword matching, maintains category selection through no-results cases, and provides accessible counts/reset.
- Repository formatting errors in three document-posting files are fixed without changing their behavior.
- Mixed text/amount exports preserve dates, references and leading-zero codes; monetary Excel cells stay numeric when safe, while large exact amounts remain text.
- Loaded-screen exports validate real dates and require reports.view plus reports.export. Standard statements reject company/date capture mismatches.
- Forecast comparisons now include actual expenses/profit and all signed amount/percentage variances, including projected losses and absent denominators. No-completed-month actuals remain unavailable.
- New server-calculated forecast PDF/Excel/CSV downloads share the preview's posted-ledger capture, retain assumptions/baseline/scenarios, enforce permissions and audit export. Caller-supplied balances are ignored. Projections remain explicitly separate from ledger actuals and cash forecasts.
- Management dates and Reports Centre dates now share URL state without replacing dashboard widget/name state.
- Integer FX rates no longer accidentally gain a factor of ten in the existing shared conversion helpers. Integer and decimal representations reconcile across zero-/two-/three-decimal currencies and large amounts.
- Receivables reporting requires reports.view and rejects impossible dates before querying accounting data.
- Aged Payables refuses unsupported historical/future snapshots and foreign balances without a posted FX rate. Current snapshots remain labelled as current, with control-account variance diagnostics.
- Indirect cash flow no longer truncates depreciation expense account discovery at 1,000 assets or silently suppresses database errors.
- Added real authenticated staging test definitions for report discovery, filter capture, financial CSV downloads and period synchronization; execution still requires authorized staging credentials.

## Existing catalogue: runner and source verification

Every catalogue entry below resolves to an existing report runner or explicitly documented existing module. “Implemented” describes source wiring, not a live financial sign-off. Standard screen downloads contain loaded rows and may be paginated; their notes explicitly describe this scope. Authoritative standard-statement and forecast downloads capture their data on the server.

| Report | Runner | Source-level status / limitation |
|---|---|---|
| Profit and Loss (`profit-and-loss`) | `profit_loss` | Advanced posted-ledger statement and legacy fallback; capture company/date provenance checked. Cash basis unsupported. |
| Balance Sheet (`balance-sheet`) | `balance_sheet` | Advanced posted-ledger statement and legacy fallback; equation checks and capture provenance. Cash basis unsupported. |
| Trial Balance (`trial-balance`) | `trial_balance` | Implemented existing permission-scoped accounting/report service; authenticated live reconciliation remains pending. |
| Cash Flow (bank movements) (`cash-flow`) | `cash_flow` | Implemented bank-movement proxy, not a certified cash-flow statement for every source classification. |
| Statement of Changes in Equity (`statement-of-changes-in-equity`) | `equity` | Implemented existing permission-scoped accounting/report service; authenticated live reconciliation remains pending. |
| Cash Flow (indirect) (`cash-flow-indirect`) | `cash_flow_indirect` | Implemented posted-ledger indirect analysis; depreciation accounts now page beyond 1,000 assets and read errors fail explicitly. |
| Account Transactions (`general-ledger`) | `general_ledger` | Implemented existing permission-scoped accounting/report service; authenticated live reconciliation remains pending. |
| General Ledger (all accounts) (`general-ledger-all`) | `general_ledger_all` | Existing posted-line engine; wide/large loaded-screen export limits remain visible. |
| Journal Report (`journal-report`) | `journals` | Implemented existing permission-scoped accounting/report service; authenticated live reconciliation remains pending. |
| Aged Receivables (`aged-receivables`) | `aged_receivables` | Implemented dated allocations and currency separation; reporting permission/date boundary tightened. Base-only presentation does not translate foreign receivables. |
| Aged Payables (`aged-payables`) | `aged_payables` | Current snapshot only. Historical/future requests now fail explicitly; missing foreign FX cannot be relabelled as base amounts. Dated retained allocations are a dependency. |
| Tax Summary (`tax-summary`) | `tax` | Implemented existing permission-scoped accounting/report service; authenticated live reconciliation remains pending. |
| Audit Trail (`audit-log`) | `audit` | Existing permission-scoped audit filters/paging; loaded-page export is not all-history capture. |
| Bank Reconciliation Report (`bank-reconciliation`) | `link` | Existing module navigation; no duplicate reporting engine added. |
| Budget versus Actual (`budget-vs-actual`) | `budget_vs_actual` | Existing budget/report engine; not replaced by operating forecast assumptions. |
| Fixed Asset Register (`fixed-asset-register`) | `fixed_asset_register` | Existing fixed-asset RPC/register; not a newly implemented disposal report. |
| Depreciation Schedule (`depreciation-schedule`) | `depreciation_schedule` | Existing fixed-asset depreciation RPC and calculations. |
| Executive Summary (`executive-summary`) | `executive_summary` | Implemented existing permission-scoped accounting/report service; authenticated live reconciliation remains pending. |
| Cash Summary (`cash-summary`) | `cash_summary` | Implemented existing permission-scoped accounting/report service; authenticated live reconciliation remains pending. |
| Bank Reconciliation Summary (`bank-reconciliation-summary`) | `bank_recon_summary` | Implemented existing permission-scoped accounting/report service; authenticated live reconciliation remains pending. |
| General Ledger Summary (`general-ledger-summary`) | `gl_summary` | Implemented existing permission-scoped accounting/report service; authenticated live reconciliation remains pending. |
| Sales by Contact (`sales-by-contact`) | `sales_by_contact` | Implemented existing permission-scoped accounting/report service; authenticated live reconciliation remains pending. |
| Sales by Item (`sales-by-item`) | `sales_by_item` | Implemented existing permission-scoped accounting/report service; authenticated live reconciliation remains pending. |
| Purchases by Supplier (`purchases-by-supplier`) | `purchases_by_supplier` | Implemented existing permission-scoped accounting/report service; authenticated live reconciliation remains pending. |
| Customer Statement (`customer-statement`) | `link` | Existing module navigation; no duplicate reporting engine added. |
| Supplier Statement (`supplier-statement`) | `link` | Existing module navigation; no duplicate reporting engine added. |
| Project Profitability (`project-profitability`) | `link` | Existing module navigation; no duplicate reporting engine added. |

## Requested library additions and dependencies

| Requested area | Existing coverage | Remaining dependency/work |
|---|---|---|
| Core financial/audit | P&L, balance sheet, trial balance, GL/account transactions, journals, direct proxy/indirect cash flow, equity, executive summary, audit | Full authenticated reconciliation matrix, additional standard report customization breadth and independently reviewed accounting outcomes. |
| Receivables/payables | Dated AR, current AP, customer/supplier statements, sales/customer/item and purchases/supplier reports | Historical AP requires append-only dated payment/credit allocations and reversal history. Complete allocation/control reconciliation and foreign translation must precede certification. Dedicated collections/payment-history/credit-note reporting must reuse corresponding document APIs rather than duplicate balances. |
| Banking/cash | Cash Summary includes balances/movements; existing bank reconciliation screen/summary and bank-transaction workspace | Reliable cash forecasts require collection/payment dates, working-capital and financing assumptions; operating projections are not cash forecasts. |
| Management/profitability | Existing budget actuals, eight KPI types, posted sales/purchases analysis, project workspace link, operating scenarios with complete comparison/downloads | Department/cost-centre attribution, additional trends/analysis, dimension-aware report designer, and wider chart/analysis coverage. |
| Assets/inventory/liabilities | Existing asset register/depreciation and source disposal records; ledger cost-of-sales accounts | Standalone disposal reporting needs posted-disposal reconciliation. Inventory valuation/stock movements require a verified quantity/cost-layer subledger. Loans and deferrals require contractual/amortization/recognition schedules; general-ledger balances alone do not supply them. Unrealized FX needs a verified closing-rate snapshot and exposure reconciliation before a new report is certified. |
| Tax/compliance | Existing tax control movements and transaction-level detail | Country-specific rules, filing formats, reconciliations and review per supported jurisdiction. No new claim of tax compliance. |
| Packs/customization | Existing designer/formulas/filters/comparative columns, saved views, private/shared access, templates, comments/actions, versioned review/publication, five supported pack sections | Custom/ageing/budget/forecast/KPI pack sections need database capture, snapshot hashing, renderer/worker and permission parity. Do not add a UI-only section unsupported by SQL allowlists. Firm template/branding and other advanced scope remain. |
| Automation | Existing scheduling, queues, review lifecycle and worker contracts | Verified sender/provider secrets and real authorized delivery evidence; do not mark provider acceptance as delivered. No emails sent in this batch. |

## Security and database evidence

Read-only queries against the project matching the environment URL (`ipxflpzfcqwtenodbxwc`) found 38 posted journals, zero unbalanced journals, zero journals with fewer than two lines, and zero cross-company lines. All nine reporting tables have RLS enabled. There were zero currently posted foreign journals with a nonunit integer exchange rate; this bounded check does not prove the FX bug never affected historical or other calculations.

These are aggregate checks run through the authorized database connector. They do not impersonate a browser session, prove all RLS policies, or demonstrate subsidiary-control reconciliation. No schema migration, financial posting, production fixture insertion, email dispatch or deployment was performed. The Supabase changelog markdown was blocked by the network/content fetch tools; current RLS documentation was reviewed through the official documentation connector. No Supabase API/package/schema contract was changed.

## External and release gates

1. Authorized staging URL/account/session with report view/save/export and two independent review/sharing roles. Product credentials are distinct from GitHub and Supabase administrative connectors.
2. Run the complete signed-in financial/export/permission/lifecycle matrix and reconcile known posted-ledger fixtures, including subsidiary controls and year-end/currency cases.
3. Sender/provider/domain setup for actual automated delivery and attachment verification.
4. Resolve all exact-head GitHub checks, required approvals and mergeability. PR #12 is a draft for review; a green local build is not a live deployment or accounting certification.
5. Implement the remaining breadth above progressively where source data supports it. Unsupported report dependencies remain explicit; no fabricated report balances or no-op features were added.

The full master scope is **not complete**. Internal implementation gaps remain in addition to the external gates. Do not treat this audit or PR as completion of every original requirement.
