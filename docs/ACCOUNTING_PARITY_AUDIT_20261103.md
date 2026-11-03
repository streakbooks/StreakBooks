# LinkBooks accounting parity: implementation audit and backlog

Date: 3 November 2026. Repository: `linkbusinessadvisory/LinkBooks`.

## Scope and evidence

This is a source-level functionality assessment and two implementation tasks, not certification of full Xero/Odoo parity. The current routes, server functions, feature flags, existing migrations, reporting catalogue and previous audit records were inspected. Operational status requires more than a route or configuration switch. Historical audit files dated October describe earlier versions; they are not authoritative evidence that current fixed assets, portals, reports, notifications or platform modules are absent.

The supplied workspace started at `adef3a3`; current GitHub main was `96236b9` (reporting PR #12). Its 45-file reporting delta was applied locally before final integration checks. Those pre-existing reporting changes are preserved, not attributed to this task. No database migration, production financial data edit or deployment was performed.

References reviewed for workflow inspiration only:

- [Odoo organisation](https://github.com/odoo).
- [Odoo accounting documentation](https://www.odoo.com/documentation/18.0/applications/finance/accounting.html): invoicing, vendor bills, banking, asset management, analysis and reporting.
- [Odoo purchasing controls](https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/purchase/manage_deals/control_bills.html): distinguish ordering, receiving, billing and payment eligibility.
- [Odoo deferred revenue](https://www.odoo.com/documentation/18.0/applications/finance/accounting/customer_invoices/deferred_revenues.html).
- [Xero accounting features](https://www.xero.com/accounting-software/): invoicing, purchase orders, reconciliation, expenses, projects, assets and reporting.

Odoo 19 rendered accounting documentation timed out; official Odoo 18/17 search-indexed documentation informed the feature comparison. No competitor source code, assets, page layouts or documentation text was imported. All new implementation uses LinkBooks components and accounting calculations. This describes the implementation method, not a legal guarantee or a claim that every competitor plan has identical features.

## Cross-navigation assessment

“Present” below means an implemented source path exists. It does not mean authenticated database acceptance passed in this session.

| Navigation / workflow | Present in current code | Verified gap or remaining acceptance | Next implementation / evidence |
|---|---|---|---|
| Dashboard | Ledger-backed metrics and bookkeeping attention centre | Full totals-to-report tie-out under permissions and multiple currencies is not certified | Reuse golden ledger fixtures across metrics and reports |
| Purchasing / orders | Non-posting PO header/lines, draft-bill conversion, shared printable document | Before this task: single-line form, no detail route, hidden order number/currency, no status controls; conversion rounding and cancellation race defects | Task 1 addresses these. Draft editing, approvals, receipts, partial billing and matching remain |
| Purchasing / bills and credits | Bill workspace, line tax/discounts/dimensions, approvals, posting, credits, allocations | Full posted lifecycle/concurrency evidence; atomic PO creation/conversion; historical allocation event model | Transactional DB RPCs and tenant/role/lock-period scenarios |
| Purchasing / expenses and payments | Expenses, employee claims, supplier payments, payment batches and statements | Automated payout provider; receipt intake/OCR; production bank-file validation; timesheets | Provider sandbox and human-reviewed intake; time/expense allocation model |
| Sales / quotes and invoices | Quote conversion, invoice editing/posting, credits, receipts, customer statements, reminders and recurring documents | Sales orders, delivery tracking, retainers and price lists explicitly unavailable in feature catalogue | Independent sales-order lifecycle and invoice linkage; customer pricing and deposit accounting |
| Sales / collections | Existing allocations and email actions | Online payment gateway, signed settlement/refund webhooks and bank fee/FX reconciliation | Provider credentials and sandbox plus idempotent settlement ledger |
| Banking / accounts and imports | Accounts, CSV mappings/duplicates, review cards, cash coding, transfers | Actual bank-feed provider is absent; external consent/sync/retry lifecycle not implemented | Select and integrate supported provider, signed webhook tests and consent renewal |
| Banking / rules and reconciliation | Priority-sorted deterministic rule matching, split coding, matching, reconciliation sessions and reports | Do not recreate these as missing based on old October docs. Multi-source matching, concurrent completion and cross-ledger acceptance still need depth/proof | Exercise bank→document→journal→reconciliation end to end |
| Reports / statements and analysis | P&L, BS, TB, GL, aged balances, tax, catalogue, saved views, report packs, analysis and forecast exports | Current main deliberately blocks historical Aged Payables: mutable paid/credited counters cannot reconstruct the past. Cash-basis/tax and report lifecycle need complete acceptance | Dated allocation/reversal history, then historical AP and SQL/export tie-outs |
| Accounting / chart and journals | Account management, posting engine, locks, reversals, FX and recurring journals | No full authenticated race/role/lock-period proof in this run; deferral schedules and intercompany/consolidation absent from inspected implementation | Accounting reliability fixtures, then prepaid/deferred schedule engine |
| Tax | Country packs, tax codes, return calculations and adjustments | Country validation, government filing/MTD/PEPPOL and tax localization certification are separate work | Country-scoped implementations and accredited/provider acceptance |
| Contacts | Customer/supplier records, import, duplicate resolution, defaults and activity | Cross-company isolation and merge/lifecycle acceptance remain; no claim of universal migration fidelity | Two-identity fixtures and supplier/customer master-data controls |
| Products / inventory | Product/service catalogue and inventory marked beta | No certified perpetual inventory movement/valuation/COGS/returns chain | Movement ledger, valuation layers, receipts/deliveries and negative-stock policy |
| Projects / budgets | Project allocation/profitability and budgeting modules | Timesheets/billable rates unavailable; full project-to-GL budgets and actuals acceptance remains | Time entries, approvals, billing and dimension-distribution tie-outs |
| Fixed assets | Existing register, imports and depreciation module | Old settings registry still labels the fixed-assets category unavailable; register-to-GL reconciliation and asset lifecycle acceptance remain | Reconcile cost/depreciation/disposals to GL; correct configuration readiness with evidence |
| Files / documents / branding | Uploads, notes, printable/PDF views, themes, email transport and delivery history | Inbound mailbox, malware/OCR review and server-rendered attachments require implementation/provider work | Quarantined intake, duplicate detection and human approval before draft creation |
| Recurring / automation | Schedule and generation APIs, recurring invoices/bills/journals and reminders | Job installation, delivery, failures, retries and idempotent worker execution cannot be assumed from API presence | Prove deployed schedules, overdue-job monitoring and exception recovery |
| Notifications / communications | Preferences, inbox, provider status, test delivery and digest controls | Settings overview/integrations hard-coded email as unavailable despite transport configuration | Task 2 replaces inconsistent status; real provider delivery remains unverified |
| Portals | Existing customer/supplier portal routes and server functions | Role isolation, acknowledgement/submission/refund/payment lifecycle needs acceptance | Tenant/customer/supplier identity fixtures; payment integrations remain distinct |
| Firm / accountant / platform | Firm/client access and existing operations/billing/support/audit modules | Do not relabel as missing shells from old docs; financial reporting consolidation, isolation and operations acceptance are not universal | Exercise delegated access and audit/support boundaries; intercompany is a separate engine |
| Imports / migrations | CSV mappings, transactions, contacts, projects and asset import code | Some import types explicitly validate only; no universal vendor migration or resumable connector exists | Per-type writes, control totals, resumable batches and exception reports |
| Help / AI / voice / search | Search, help, voice navigation and permission-scoped AI paths | AI provider readiness, quality and costs vary; none replace accounting approval | Keep explicit review, permissions and measured provider outcomes |

## Settings: all 26 categories

Source: `src/lib/settings/categories.ts`, `registry.ts`, `feature-catalog.ts`, Settings route and panel implementations.

| Categories | Present / assessment | Outstanding work |
|---|---|---|
| overview, integrations | Summary and integration cards | Task 2 aligns real email configuration across both panels; delivery verification and missing providers remain separate |
| features | Five-state feature manager and persisted organisation flags | Sales orders, time tracking, retainers and price lists remain explicitly unavailable; inventory/AI/late fees are beta |
| organisation, accounting, currencies | Organisation and fiscal defaults, locks, conversion dates, manual FX | Validate changes against posted-data constraints and multi-role scenarios; automatic FX feed remains absent |
| sales, purchases, banking | Module defaults and workflow links | Do not enable configuration promises without corresponding consuming workflow; PO receipt/matching and bank providers remain pending |
| dimensions, products, expenses | Dimensions, product options, expense configuration | Analytic distributions, valued inventory and timesheets need end-to-end implementations |
| tax, reports | Tax/report configuration and module links | Jurisdiction certification and historical AP data history remain pending |
| documents, contacts | Numbering, themes, communication/contact defaults | Mailbox/OCR, template delivery and master-data lifecycle verification |
| automation, notifications | Existing recurring and communications controls | Deployed job execution, real transport delivery/retry evidence and monitoring |
| users, audit | Membership permissions and audit controls | Two-tenant/two-role live proof, invite delivery and audit completeness under failures |
| accountant, subscription | Existing firm/practice and entitlement/billing surfaces | Delegate/entitlement/provider lifecycle acceptance; do not infer active providers from switches |
| demo, portals | Demo operations and portal controls | Same posting engine in demo; external delivery restrictions remain allowed. Portal isolation acceptance pending |
| fixed_assets, import_migration | Asset/import modules exist | Reconcile registry labels with actual settings functionality and finish missing import writers |

## Prioritized pending delivery tasks

1. **P0 financial acceptance:** isolated PostgreSQL/Supabase fixture for invoice→receipt→AR/GL, bill→payment→AP/GL, bank→journal→reconciliation, credit/void/reversal/FX, period locks, two tenants, multiple roles and concurrent replay. Existing unit tests cannot substitute for this.
2. **Purchasing depth:** transactional creation/conversion RPC with audit in the same transaction; draft editing and version conflicts; approval policy; receiving/returns; ordered-vs-received billing; partial bills and 2-/3-way matching; full-list server search/pagination.
3. **Historical reporting:** dated AP payment/credit allocation and reversal events, then historical aged payables. Preserve existing refusal to fabricate past balances until that history exists.
4. **Sales depth:** sales orders and fulfilment; price lists/volume pricing; retainers/deposit liability and draw-down; collections/payment gateway lifecycle.
5. **Automation/integrations:** recurring worker deployment and retry visibility; bank provider consent/webhooks; inbound email/OCR; actual email sender verification; payout/collection providers. Configuration credentials are necessary but not sufficient implementations.
6. **Accounting depth:** deferred/prepaid schedules, analytic distributions, asset-to-GL reconciliation, complete cash-basis/tax acceptance, country filing/e-invoicing.
7. **Business expansion:** inventory valuation/COGS/returns, timesheets/project billing, intercompany/eliminations/consolidation, vendor/e-commerce migration connectors.
8. **Operations:** repeatable backups/restore drill, monitored worker/provider failures and financial incident procedures.

Owner/provider setup is needed for external accounts, financial-institution consent, verified sender domains, government mandates and a safe staging identity/project. Internal implementation work above remains pending independently of those dependencies. None of P0–P3 is marked complete by this document.
