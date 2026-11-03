# Cash Balance Sheet, durable allocations and cash report delivery

This extends the cash P&L implementation in PR #14. The repository is `linkbusinessadvisory/LinkBooks`.

## Implemented

- Accounting method selector on P&L and Balance Sheet, retained in report URLs and saved views.
- A balanced cash ledger: settled source net, tax and capital components use actual posted cash amounts. Bank movements, loans, transfers, opening positions and pure balance-sheet movements remain balanced. Unpaid source journals are excluded.
- Cash Balance Sheet equity includes prior-year cash earnings and a separate current-year earnings calculation for each comparison column.
- Cash account drill-down for both statements; cash figures never link to an accrual GL total.
- PDF, Excel and CSV use the same statement document as preview.
- Invoker/RLS cash-source snapshot RPC. Scheduled and immediate saved-report deliveries freeze exact source rows when enqueued, including comparison periods. The existing worker renders these snapshots through the same engine and PDF renderer; subsequent accounting edits cannot change an already queued attachment.
- Legacy cash views containing only `basis=cash` are normalised in delivery definitions without modifying saved records.
- Append-only allocation archive for supplier-payment allocations and refund credit uses. Existing void workflows can delete active allocations without destroying the exact original splits. Archive writes occur atomically in source-row triggers; clients have company-scoped SELECT access only.
- Exact bigint strings in database snapshots, including archived amounts. No financial journal or paid-counter backfill.

## Accounting policy and scope

This is management cash reporting, not a jurisdiction-specific tax return. Directly expensed cash payroll is included. Loans and capital purchases are balance-sheet movements, not operating cash expense. Posted opening positions and pure balance-sheet movements are carried forward; noncash income/expense adjustments, depreciation and unrealised FX are excluded from both cash earnings and the corresponding cash-ledger movements.

The accounting equation is checked before Balance Sheet rendering/export. Each settlement is validated against its actual posted bank movement. Split-period voids require exact historical allocation details; wholly cancelling exact reversal pairs need no invented allocation split.

**This does not complete every cash-accounting policy across the application.** Inventory/stock, prepayment, deferred-income/accrual bridges, advances, mixed-sign source components, non-proportional credits and historical reallocations still require explicit recognition policy/source detail. Cash trial balance, the general-ledger report, custom-report calculations and published report packs have not been converted to a shared cash ledger in this change. Their existing reporting basis must not be interpreted as cash merely because the standard statements now support it.

The archive starts when its migration is installed. It cannot recover allocations deleted before that time. An administrator must obtain verified original invoice/bill/credit split records before historical recovery can be implemented; current balances or audit events listing bill IDs are insufficient evidence for amounts.

## Validation

- Unit tests cover cash recognition, Cash Balance Sheet equation, prior-year earnings, opening equity, loans, capital purchases, exact reversals, frozen P&L/Balance Sheet previews and PDF attachment generation.
- `python3 scripts/test-cash-history-postgres.py` creates an isolated PostgreSQL 17 container with no network or published ports. It executes both new migrations and checks exact bigint preservation, source-row UPDATE/DELETE archives, atomic rollback, tenant isolation, denied archive mutations/function execution, date/company-scoped source capture, legacy saved-view queueing and immutable queued facts. Its baseline is a focused schema fixture, not a full production database clone.
- Reporting Playwright fixtures verify the cash selector, persistence, calculations and Balance Sheet drill callbacks. These fixtures contain synthetic accounting data.
- `e2e/staging-smoke.spec.ts` includes authenticated cash P&L and Balance Sheet selection/reload/export checks. Discovery is checked in CI. Actual execution requires the isolated staging URL and test account in repository secrets.
- No emails are sent by the isolated tests. Actual provider delivery/receipt remains a separate acceptance check.

## Review on main

Preserve local edits, then run in Cursor PowerShell:

```powershell
cd D:\MyApp\LinkBooks
git status
git switch main
git pull origin main
npm.cmd ci
npm.cmd run dev
```

Open the port printed by Vite, normally `http://localhost:8080`.

1. Open Reports → Profit and Loss; compare Accrual and Cash for a period containing receipts/payments.
2. Open Balance Sheet and select Cash. Compare total assets with liabilities plus equity.
3. Compare a prior year/month and check its own retained/current-year earnings split.
4. Click bank, tax, income or expense cash amounts and inspect original source and settlement journals.
5. Reload, reopen a saved cash report and export PDF/Excel/CSV; confirm the accounting basis and dates.
6. On isolated staging only, configure the verified sender/provider, queue a saved cash report to an authorised test recipient, then check the cash PDF and delivery event. Repeat for a scheduled report. Do not treat provider acceptance as confirmed receipt.
7. In isolated staging, void a supplier payment/refund after reporting its original period; rerun the historical report and verify the archived split and later reversal.

## Deployment order

Deploy the compatible reporting-worker bundle first, apply the two reviewed/tested migrations in order, then release the application. The source snapshots are calculated by application/worker code, so migrating the database alone does not upgrade an already deployed worker. Use the migration IDs recorded in Supabase and keep local filenames consistent. Do not send live test emails or invent historical allocations during deployment.

## Reference behaviour

- [Xero cash journal retrieval (`paymentsOnly`)](https://developer.xero.com/documentation/api/accounting/journals/)
- [Xero manual journals and cash-report inclusion](https://central.xero.com/0/article/Add-import-and-post-manual-journals-UK)
- [Odoo accounting reports and basis filters](https://www.odoo.com/documentation/master/applications/finance/accounting/reporting.html)

These references informed report consistency and source traceability. No competitor source code or assets were copied.
