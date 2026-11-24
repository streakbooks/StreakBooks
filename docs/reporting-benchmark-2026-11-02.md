# StreakBooks reporting benchmark — 2 November 2026

This is a focused documentation discovery review, not hands-on product testing or an exhaustive capability certification. Official search excerpts and accessible documentation were reviewed. Features not described below remain **unverified**, including performance, precise subscription limits, formula safety and detailed permission semantics. These sources support architecture choices, not copied layouts or implementations.

| Platform | Documented capability reviewed | Official source |
|---|---|---|
| QuickBooks | Saved reports support customization, sharing, scheduling and export; advanced builder is plan-specific. | [Documentation](https://quickbooks.intuit.com/learn-support/en-us/help-article/customize-reports/customize-reports-quickbooks-online/L0gKmSawG_US_en_US?uid=le0dhbid) |
| Xero | Reusable custom layouts and published snapshots have distinct lifecycle semantics. | [Documentation](https://central.xero.com/0/article/Save-or-publish-a-report) |
| Zoho Books | Customized report settings can be saved; scheduling availability varies by report. | [Documentation](https://www.zoho.com/us/books/help/reports/manage-reports.html) |
| Sage | Sage Intelligence supports online reports and an Excel report designer; this does not establish parity across Sage products. | [Documentation](https://gb-kb.sage.com/portal/app/portlets/results/viewsolution.jsp?solutionid=222001000101155) |
| MYOB | Custom report configurations can be saved, reopened and deleted. | [Documentation](https://www.myob.com/nz/support/myob-business/reporting/customising-reports/saving-and-deleting-custom-reports) |
| FreshBooks | Reports support CSV, print/PDF and email; report execution is per currency. | [Documentation](https://support.freshbooks.com/hc/en-us/articles/227478548-How-do-I-export-my-reports) |
| Wave | Reports export to CSV/PDF after setting dates and filters. | [Documentation](https://support.waveapps.com/hc/en-us/articles/38600080764692-Export-a-report) |
| Akaunting | Official help separates report viewing, creation and income/expense reporting. | [Documentation](https://akaunting.com/hc/docs/reports/) |
| Odoo | An accounting reporting framework supports configurable reports. | [Documentation](https://www.odoo.com/documentation/master/applications/finance/accounting/reporting/customize.html) |
| NetSuite | Financial Report Builder access requires statement and customization permissions. | [Documentation](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N2105846.html) |
| Business Central | Row and column definitions organize period-specific G/L reporting. | [Documentation](https://learn.microsoft.com/en-us/dynamics365/business-central/reports/report-25) |
| Oracle Fusion | Financial Reporting Center provides access, design and presentation of financial analysis; source is legacy documentation. | [Documentation](https://docs.oracle.com/cd/E36909_01/fusionapps.1111/e22380/F1005467AN1379F.htm) |
| SAP Business One | Financial statement templates cover balance sheet, P&L, trial balance and cash flow. | [Documentation](https://help.sap.com/docs/sap_business_one/68a2e87fb29941b5bf959a184d9c6727/45114bb429fc4805e10000000a1553f6.html?locale=en-US) |
| FreeAgent | Financial reports can be downloaded individually through export or browser printing. | [Documentation](https://support.freeagent.com/hc/en-us/articles/115001218470-Data-security-and-backup) |
| Kashoo | Mobile reports include period-specific profit and loss; broader custom-builder support was not established. | [Documentation](https://help.kashoo.com/en/articles/6023107-kashoo-mobile-app-reports) |
| Fathom | Custom reporting components are available for consolidated groups. | [Documentation](https://support.fathomhq.com/en/articles/1405614-report-for-a-consolidated-group) |
| Spotlight | Report pages and reusable templates are configurable. | [Documentation](https://help.spotlightreporting.com/help-articles/build-report) |
| Syft | Report-pack email schedules include recipients, subject and message. | [Documentation](https://help.syftanalytics.com/en/articles/9117142-schedule-reports-to-send-via-email) |
| Jirav | Planning and reporting capabilities depend on subscription and enabled departments. | [Documentation](https://help.jirav.com/account-subscription-options) |
| LivePlan | Dashboard separates accounting actuals from forecast values and supports comparisons. | [Documentation](https://help.liveplan.com/understanding-the-numbers/performance-tracking-dashboard-and-industry-data/financial-statements-available-in-the-dashboard) |

## Decisions for StreakBooks

1. Reuse the posted-ledger reporting engine and the existing saved-view table. A reusable configuration is distinct from a completed financial snapshot.
2. Keep private report ownership and tenant membership checks until a separate sharing model has database-enforced authorization and revocation tests.
3. Bound library listings and use a deterministic sort. Preserve financial-year defaults for configurations without fixed dates.
4. Treat report publication, review/approval and actual delivery as separate persisted activities. Do not infer any of them from saving a view.
5. Consolidation requires currency translation, eliminations and explicit entity authorization; a portfolio dashboard or concatenated reports does not supply this.
6. Forecasts need versioned assumptions and clear separation from ledger actuals. Existing budget and financial summary services should be reused.
7. Email schedules require an authenticated server worker, per-run access checks, delivery provider credentials, retry/idempotency design and real delivery history.

## Supabase implementation references

Pagination and filtering API contracts were checked against [range](https://supabase.com/docs/reference/javascript/range), [filters](https://supabase.com/docs/reference/javascript/using-filters), and the [current changelog](https://supabase.com/changelog). Direct executor requests to supabase.com were denied by the network proxy; the web documentation tool supplied the reference material instead. No schema changes or dependency upgrades were made.

