# LinkBooks accounting product gap analysis
**Date:** 3 November 2026 · **Baseline:** main `ef53489f` · **Method:** official-product behavior + repository routes/functions/schema inventory, not copied competitor source.

## Evidence and labels
Odoo and Xero columns describe **publicly documented capabilities**, not an assertion that every capability is in Odoo Community or every Xero subscription. Odoo bank synchronization, for example, explicitly requires Enterprise. LinkBooks: **Done** = evidenced implementation/entry points, **Partial** = implemented pieces but important behavior, accuracy, integration, live validation or localization remains, **Missing** = no verified complete mechanism in this targeted audit. None of these statuses is an external accounting or tax certification. Effort is a relative estimate: S (days), M (weeks), L (multi-week workstream).

| Feature | Odoo public capability | Xero public capability | LinkBooks status and code evidence | Priority | Effort |
|---|---|---|---|---|---|
| Chart of accounts | Hierarchies, account grouping | Chart of accounts | **Done** — `accounts`, COA settings and account picker; country defaults need review | P0 | M |
| Double-entry journal posting | Balanced posted entries | Double-entry ledger | **Done** — `journals` / `journal_lines` and posting services; independent matrix pending | P0 | M |
| Manual and recurring journals | Manual / repeated journals | Manual journals | **Done** — posting and recurring-journal files; replay/idempotency acceptance pending | P0 | M |
| Period locks and year end | Lock dates, close workflows | Lock dates, financial years | **Partial** — `accounting_periods` and period-close functions; test all workflows | P0 | M |
| Auditable reversals/corrections | Audit and reversing entries | Audit trails / history | **Partial** — audit log and correction batches; verify immutability under all paths | P0 | M |
| Document attachments | Attachments | Files and document storage | **Done** — `document_attachments`; test retention/permissions | P1 | M |
| Quotes to invoices | Quotes, customer invoicing | Quotes and invoices | **Done** — sales routes and documents | P1 | S |
| Credit notes / allocations | Customer credit notes | Credit notes | **Done** — sales credits + allocation tables; reconcile | P0 | M |
| Recurring sales invoices | Recurrences | Repeating invoices | **Partial** — recurring engines; live failure/retry acceptance | P1 | M |
| Customer statements | Partner/customer ledger | Customer statements | **Done** — statement modules | P1 | S |
| Payment links and reminders | Online payment / follow-up | Payment buttons and reminders | **Partial** — share links and reminders; provider and delivery proof pending | P1 | M |
| Bills and vendor credits | AP bills and refunds | Bills and credits | **Done** — bills/credits/payments and allocations; dated control checks pending | P0 | M |
| Purchase orders and conversions | Purchase orders | Purchase orders | **Partial** — purchase order modules, end-to-end acceptance pending | P1 | M |
| Recurring bills | Recurring bills | Bill automation | **Partial** — `recurring_bills`, retries and UI acceptance pending | P1 | M |
| Employee expense claims | Expenses | Expenses/claims | **Partial** — `employee_expense_claims`; payouts, approval, roles to verify | P1 | M |
| Bank CSV and OFX imports | Import CSV/OFX/QIF etc | Import bank statements | **Partial** — CSV/OFX code present; QIF not evidenced, duplicate tests needed | P0 | M |
| Bank-feed connection | Third-party bank sync (Enterprise) | Feed connections | **Partial** — `bank_feed_connections`; provider lifecycle not certified | P1 | L |
| Reconciliation and rules | Matching / reconciliation models | Bank rules and matching | **Partial** — bank matching/reconciliation/rules code, large fixtures and review needed | P0 | L |
| Money transfers | Internal bank transfers | Bank transfers | **Done** — `bank_transfers`; currency and control acceptance pending | P1 | M |
| Multiple / inclusive taxes | Tax configuration | Tax rates | **Partial** — tax math, tax codes/rates and returns; jurisdiction edge cases unverified | P0 | L |
| US sales tax | US localization features | US sales-tax features | **Partial** — generic tax layer; no certified jurisdiction-by-jurisdiction filing | P0 | L |
| UK VAT and MTD | Country localization/returns | VAT/MTD | **Partial** — tax return records; HMRC authorization/submission proof not evidenced | P0 | L |
| AU GST/BAS | Country localization | AU GST/BAS | **Partial** — tax packs; ATO-aligned return and submission acceptance pending | P0 | L |
| NZ GST | Country localization | NZ GST | **Partial** — tax packs; IRD-facing e-filing not proven | P0 | L |
| Multi-currency documents | Multi-currency amounts, rates | Multi-currency | **Done** — company currencies, exchange rates, FX helpers | P0 | M |
| FX realized / revaluation | FX gain/loss workflows | Currency adjustments | **Partial** — `fx_realised_postings` and `fx_revaluation_runs`; finance sign-off pending | P0 | L |
| Asset register and depreciation | Asset schedules | Fixed assets | **Partial** — register, depreciation, disposal and import pathways; reconciliation pending | P1 | L |
| Inventory / COGS | Stock valuation | Inventory | **Partial** — products and GL COGS; verified stock cost layers not established | P1 | L |
| Budgets and variance | Analytic budgets | Budgeting | **Done** — `budgets`, budget-v-actual runners; fixture checks pending | P1 | M |
| Tracking and project dimensions | Analytic accounts/plans | Tracking categories | **Partial** — tracking category/option/assignments; full reporting attribution pending | P1 | L |
| Multi-company / access | Multi-company | Multiple organizations | **Done** — company members, firm links and role permissions; isolation audit pending | P0 | L |
| Consolidation / intercompany | Multi-company/reporting | Entity reporting | **Missing** — no verified consolidation and elimination engine in examined code | P1 | L |
| Projects and time | Analytic project costing | Project/time analysis | **Partial** — projects routes and profitability links; time entry/payroll integration unclear | P1 | L |
| Payroll journals/hooks | Payroll integration | Payroll/integrations | **Partial** — Basic Global Payroll accrual posting and net-pay payments (manual statutory); jurisdiction filing engines absent | P2 | L |
| API / integrations / webhooks | External APIs | App integrations / APIs | **Partial** — some billing/provider webhooks; generic public accounting API absent in audit | P1 | L |
| Data migration and import | Import mappings | Import/export ecosystem | **Partial** — imports and mapping modules, broad Tally/QBO migration QA absent | P1 | L |
| Roles, tenant security, 2FA | Roles / access | Advisor roles, 2FA | **Partial** — auth, roles and MFA-related migrations; full matrix/definer audit pending | P0 | L |
| Practice and client task centre | Accountant workflows | Practice tools | **Partial** — firms, client links, `practice_tasks`; multi-client acceptance pending | P1 | L |
| Report catalogue and saved views | Dynamic reporting | Custom reports | **Done** — 25+ catalogue entries, saved views, builder, PR #18 customization | P1 | M |
| Report source drill-down | Journal/item drill-down | Report drill-down | **Partial** — Account Transactions/source links; numeric drill-down parity incomplete | P1 | L |
| Full-history export / large ledgers | Detailed filtering and export | Detailed reports/export | **Partial** — screen export may be loaded page only; performance/index proof pending | P0 | L |
| Scheduled reports and branded packs | Report personalization | Branded/customized reports | **Partial** — queues/packs/schedules exist; deliverability & permissions unverified | P1 | L |
| Dashboard and cash forecasts | Executive reporting | Dashboards / forecasting | **Partial** — management workspace and forecasts; complete cash position forecast needs source | P1 | L |
| Audit-ready regional tax filing | Localized returns | Jurisdiction software support | **Missing** — third-party submission certification, permissions and receipts not evidenced | P0 | L |

## Specific gaps discovered
1. **Baseline security hygiene (P0):** tracked `.env` and missing ignores. The inspected file contained publishable Supabase configuration, not a service-role secret. Fix without rewriting Git history; scan prior commits separately if a secret is later discovered.
2. **Database privileged functions (P0):** advisors flagged 3 anonymous-executable SECURITY DEFINER functions (public sharing/prices may be intentional), 246 authenticated-executable SECURITY DEFINER functions, and 6 RLS-enabled tables without policies. These are triage signals, not 255 confirmed vulnerabilities. Validate grants, business intention, tenant predicates and tests before changing permissions.
3. **Regional tax (P0):** a tax engine is not the same thing as regulator-approved electronic filing. Review HMRC MTD digital links, ATO BAS obligations, IRD GST methods and US state tax-by-jurisdiction requirements with local practitioners.
4. **Reports (P0/P1):** PR #17 and #18 enhance report presentation; loaded-row filters/export must not be described as full source-dataset query/exports.
5. **Integrity (P0):** independently test ledger balance, cutoff dates, reversal flows, AR/AP allocations, FX rate precision, tax rounding and cross-tenant isolation with signed-in roles.
6. **Inventory/consolidation (P1):** do not generate balance-based valuations or elimination figures without source-supported quantity/cost lots, entity FX, intercompany matching, and elimination journals.

## Public product documentation used for conceptual comparison
- Odoo 19 accounting overview: https://www.odoo.com/documentation/19.0/applications/finance/accounting.html
- Odoo 19 financial reporting: https://www.odoo.com/documentation/19.0/applications/finance/accounting/reporting.html
- Odoo 19 analytic accounting: https://www.odoo.com/documentation/19.0/applications/finance/accounting/reporting/analytic_accounting.html
- Odoo 19 bank import: https://www.odoo.com/documentation/19.0/applications/finance/accounting/bank/transactions.html
- Odoo 19 bank sync (Enterprise): https://www.odoo.com/documentation/19.0/applications/finance/accounting/bank/bank_synchronization.html
- Xero current public feature overview: https://www.xero.com/us/accounting-software/all-features/
- HMRC MTD VAT: https://www.gov.uk/government/collections/making-tax-digital-for-vat
- NZ IRD GST software: https://www.ird.govt.nz/gst/filing-and-paying-gst-and-refunds/filing-gst
- Supabase RLS security guide: https://supabase.com/docs/guides/database/postgres/row-level-security

This audit uses public feature documentation only; no third-party implementation code, templates, layouts, icons or branding were incorporated.

