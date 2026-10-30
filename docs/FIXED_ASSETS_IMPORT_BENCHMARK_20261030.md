# LinkBooks Fixed Assets — Competitive Benchmark and Engineering Acceptance

Review date: **2026-10-30**. This is a scope/feature comparison of **16** relevant accounting products, not a claim that every feature has been verified in the latest edition of every product. Sources and limits are explicit.

## Benchmark: lessons for LinkBooks

| Platform | Evidence-based observation or review focus | LinkBooks implementation implication |
|---|---|---|
| Xero | Fixed asset CSV import creates draft assets, then bulk registration with user-role control. [Xero import](https://central.xero.com/0/article/Import-fixed-assets-UK), [Xero register](https://central.xero.com/0/article/Register-fixed-assets) | Validate then approve/register; protect posting roles. Current LinkBooks CSV creates active records; draft/approval remains a **gap**. |
| QuickBooks Online Advanced | Fixed Asset Manager supports importing assets and reviewing asset drafts. [Intuit](https://quickbooks.intuit.com/learn-support/en-ca/help-article/fixed-assets/add-manage-fixed-assets-quickbooks-online-advanced/L19788yU0_CA_en_CA) | Keep imported assets linked to supporting documents with review states. |
| Zoho Books | Import flow includes template, field mapping, field mapping reuse and preview; depreciation history/forecast. [Zoho](https://www.zoho.com/us/books/help/accountant/fixed-assets.html) | CSV mapping and validated preview in PR #31; saved mappings and forecast enhancements remain backlog. |
| Sage Intacct | Fixed asset workflow includes multi-entity controls, GL dimensions, depreciation schedules and asset life-cycle management. [Sage](https://www.sage.com/en-us/sage-business-cloud/intacct/product-capabilities/extended-capabilities/fixed-assets/) | Plan dimensional allocations, multiple entities/books, capital work in progress and full lifecycle audit. |
| Oracle NetSuite | Migrated asset records do **not** automatically post opening GL balances; depreciation history can be imported separately. [NetSuite](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_164689335971.html) | Correctly separate register CSV from opening balance journals; build separate history migration and GL reconciliation. |
| Odoo | Asset records support methods, cost, accumulated depreciation, mapped GL accounts and vendor bill connections. [Odoo](https://www.odoo.com/documentation/19.0/applications/finance/accounting/vendor_bills/assets.html) | Preserve bill capitalization and account mapping while extending asset policies. |
| ERPNext | Existing assets can carry forward accumulated depreciation without posting opening cost; separate finance books; scheduled journals. [ERPNext](https://docs.frappe.io/erpnext/asset), [ERPNext depreciation](https://docs.frappe.io/erpnext/asset-depreciation) | Cutover-aware opening depreciation, book-specific schedules and GL control reconciliation. |
| Dynamics 365 Business Central | Supports multiple depreciation books and localization-specific tax calculations. [Microsoft](https://learn.microsoft.com/en-us/training/modules/configure-depreciation-books/) | Multi-book accounting and country-specific tax depreciation are advanced backlog, not claimed implemented. |
| SAP Business One | Fiscal-year-targeted import of fixed asset master data from Excel with reusable field mappings. [SAP Help](https://help.sap.com/docs/sap_business_one/68a2e87fb29941b5bf959a184d9c6727/380dfb8b857841538a98593002d74493.html) | Preserve cutover fiscal dates and reusable mapping; current PR provides mapping but not persistent templates. |
| MYOB (Business/Practice) | MYOB Fixed Assets workpaper imports cost and accumulated depreciation with account-code mapping; product variations differ. [MYOB](https://www.myob.com/au/support/myob-practice/client-accounting/using-client-accounting/importing-assets-data-into-fixed-assets-workpaper) | Reconcile fixed assets to ledger and avoid assuming all MYOB tiers provide native FA CSV imports. |
| Sage Accounting | Depreciation can be posted via regular journals; capabilities differ from Sage Intacct and Sage 50. [Sage](https://gb-kb.sage.com/portal/app/portlets/results/viewsolution.jsp?solutionid=222001000100814) | Keep separate ledger posting engines and control account validation. |
| Wave | Depreciation documented through manual depreciation journals. [Wave](https://support.waveapps.com/hc/en-us/articles/208623506-Depreciation-in-Wave) | LinkBooks should offer scheduled depreciation and audit beyond basic journals. |
| FreshBooks | Manual journals for fixed assets and depreciation are available with the appropriate accounting access. [FreshBooks](https://support.freshbooks.com/hc/en-us/articles/360001212251-What-are-journal-entries) | A full asset register and controlled amortization should exceed journal-only workflows. |
| Manager.io | Batch Create/Update processes in many modules; asset records and depreciation journal options. [Manager batch](https://www2.manager.io/guides/9572) | Bulk data import, idempotent updates and correction controls. |
| Akaunting | General-purpose open-source modular accounting platform; **a native full fixed asset CSV import is not verified from a primary source in this review**. | Benchmark modular extensibility but do not assume feature parity. |
| Acumatica / MYOB Acumatica | Partner documentation describes migration of partially depreciated assets with book/department fields. [MYOB Acumatica](https://enterprisesupport.myob.com/knowledge/import-scenario-partially-depreciated-fixed-assets) | Multiple depreciation books and historical carry-forward details should be a distinct future workstream. |

## PR #31 — feature implementation

- Fixed Assets **Register** toolbar → **Import fixed assets**. Navigation is module-scoped, not an unrelated whole-company picker.
- Template and field guide; custom source CSV column mapping; preview 25 rows plus validated whole-file check and exact aggregate cost/accumulated depreciation/net book value totals.
- Full-file validation: CSV quoting, required fields, immutable external references, actual calendar dates, minor-unit precision, 100-row / 5 MB limits, method-specific useful life / rates, account-code syntax, reserve/residual limits.
- Opening depreciation migration cutover explicitly marked; future depreciation start must be after opening accumulated depreciation cutoff.
- Authenticated writer, `accounts.manage` permission, per-organisation account/asset-type lookups, existing trusted `save_fixed_asset` SQL RPC.
- Proposed PostgreSQL migration: company-scoped external reference table with RLS; all-or-nothing import, case-insensitive retry uniqueness, on-conflict rejection, audit log and advisory locks.
- PostgreSQL 17 isolated CI tests: permissions, transaction rollback, retry, RLS, cross-company reads and writes, duplicate batch IDs, concurrent imports.
- **Register-only**: no automatic opening balance journal, depreciation journal, or acquisition posting; avoids double counting. Import results link back to the register.
- Database migration readiness checked before enabling the confirmation button; no fake success if migration is unavailable.

## Outstanding release gates

| Acceptance item | Evidence status |
|---|---|
| TypeScript, unit/regression and build CI | Verify latest PR #31 GitHub `verify` check |
| Isolated PostgreSQL RPC behavior with simplified domain stub | Verify latest PR #31 `fixed-assets-postgres` check |
| Full Supabase schema (real `save_fixed_asset`, permissions, journal locks, RLS, audit) integration | **NOT RUN** — requires isolated staging |
| Production database migration | **NOT APPLIED** — `import_fixed_asset_register` absent |
| Reconcile trial balance vs asset register and accumulated depreciation by account | **NOT VERIFIED** |
| Multi-book depreciation, tax depreciation and transfers, revaluation, impairment, component assets | **NOT IMPLEMENTED** |
| Draft/approve lifecycle, saved field mappings, history import | **NOT IMPLEMENTED** |
| Global performance and user concurrency testing at scale | **NOT VERIFIED** |
| Security audit of public privileged functions and supply chain | **NOT CLEARED** |

**Status:** PR #31 intentionally remains **unmerged** until its migration and the real Supabase-domain financial checks pass. Passing the stub-based SQL CI is not production signoff. Never test financial postings on a live organisation.
