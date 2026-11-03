# Cash-basis Profit and Loss — 3 November 2026

## Completed implementation

Profit and Loss now offers **Accounting method → Accrual / Cash**. Cash is a distinct server-side recognition engine; selecting it does not relabel accrual balances. Existing accrual behavior remains the default. No posted journal, invoice, bill, receipt or payment is edited by a report request. No database migration is required.

The implementation reuses the exact settlement-allocation core and the standard statement renderer. It supports the existing grouped/comparative columns, financial formatting, saved/default configurations, direct PDF/Excel/CSV downloads and cash-specific transaction drill-down. Saved-library preview/download also uses the cash engine, including older views with only `basis: cash`.

Cash account drills list the recognized amount, cash date, settlement journal and original source journal. They do not silently open an accrual GL figure as if it reconciled with cash P&L. Read-only shared/standalone previews without a drill handler show cash amounts without an incorrect accrual link.

## Recognition policy and source of truth

- Reads only company-scoped posted journal lines and authorized allocation/document metadata through the existing authenticated client/RLS. Checks reports.view before loading financial data and reports.export before downloads.
- Uses registered bank accounts (including inactive historical records) and chart-identified cash/bank/undeposited accounts. Does not sum different transaction currencies without the settlement's posted conversion rate.
- Recognizes allocated customer receipts and supplier payments on their posted cash dates. Partial settlements are apportioned cumulatively across the original posted document's components, preserving integer minor units and tax/account attribution.
- Recognizes directly paid income/expense journal lines involving a cash account. Transfers and loan principal are not P&L. Unpaid invoices/bills and noncash credit notes are not cash receipts/payments. Capital-account components stay outside P&L. Noncash depreciation, opening balances and unrealized FX are excluded.
- Cash refunds consuming posted sales/purchase credit notes reverse the appropriate income/expense on the actual refund date. Verified receipt/payment reversals retain the original recognition and reverse it on the actual void date.
- Exact posted reversal pairs wholly within or before the reporting period cancel per account. This permits a truly cancelled transaction to net to zero without inventing deleted AP/refund allocations. A period splitting such a pair still requires the source allocation history.
- Uses the receipt/payment FX snapshot, reconciles the gross against the actual posted bank movement and apportions base-currency pennies once across documents and then components. It does not count accrual realized-FX adjustment lines a second time. Source documents, posted bank totals and reversals must reconcile.
- Noncash credits are not treated as payments. Linked credits whose account/tax proportions differ from the original document require review rather than an estimated account split.
- Checks balanced journals, account identity, company identity, real dates, duplicate events, allocation totals, currency consistency and source provenance. Unsafe numeric API amounts fail explicitly rather than silently lose integer precision.

This is a defined management cash-recognition policy. It does not assert eligibility for any country's cash tax scheme or replace statutory cash-flow statements.

## Example to verify

Use an isolated test company, not production postings:

1. Post an October invoice: net revenue 100.00 plus tax 20.00, gross 120.00.
2. Post an October bill: net expense 80.00 plus tax 16.00, gross 96.00.
3. In November, receive/allocate 60.00 against the invoice and pay/allocate 48.00 against the bill.
4. October accrual P&L shows revenue 100.00, expense 80.00 and profit 20.00. October cash P&L shows no recognition for these unpaid documents.
5. November cash P&L shows revenue 50.00, expense 40.00 and profit 10.00. November accrual P&L does not recognize those October document amounts again.
6. The revenue cash drill shows the November receipt and 50.00 recognized revenue; the tax portion is not income. The expense drill shows 40.00 recognized expense from the payment.

These figures are synthetic automated-test examples, not demo balances inserted into the application.

## Explicit limitations and recovery

- Cash basis is enabled for **P&L only**. Balance Sheet remains accrual; cash BS requests fail explicitly.
- Posted-line filter predicates describe accrual journals. Clear them before switching to Cash. Cash reports still support account-level settlement drills, date/group/comparison/display controls. Applying accrual predicates to cash recognition would give the wrong scope, so it is refused.
- Unapplied advances, payments received before the corresponding source document, reallocated receipts, missing/deleted historical allocation splits, mixed-sign/inventory/COGS document components, non-proportional credit allocation or inconsistent FX/bank data require classification/reconciliation. The report explains the dependency instead of displaying incomplete or invented totals. Do not create balancing journals merely to suppress the message.
- Existing AP/payment/refund void workflows can delete allocation splits. Exact pairs cancel when both sides fall inside the period; split-period historical reporting needs retained allocation history. No history was reconstructed by guessing from current paid totals.
- Cash email delivery and schedules are deliberately blocked until the worker's persisted cash snapshot capture is integrated. Direct downloads work. Both the request boundary and document provenance guard prevent a queued accrual snapshot from being labelled Cash. Existing accrual deliveries are preserved.
- Large source reads use the existing bounded, stable pager; account drills cap at 2,000 recognition rows and request a narrower period when exceeded. Whole-deployment performance and authenticated acceptance remain separate checks.

## Local review on the implementation branch or merged main

In PowerShell, preserve uncommitted changes before changing branches:

```powershell
cd D:\MyApp\LinkBooks
git status
git fetch origin
# Before merge:
git checkout feature/cash-basis-profit-loss
git pull --ff-only origin feature/cash-basis-profit-loss
# After a verified merge, use git checkout main and git pull --ff-only origin main instead.
npm.cmd run dev
```

Open http://localhost:8080, sign in and select the intended test company.

1. Reports → All reports → Profit and Loss.
2. Set From/To and choose **Accounting method → Cash**. Check the visible cash-basis note and recognized totals against dated receipts/payments.
3. Switch back to Accrual and verify invoice/bill posting-date totals. Refresh Cash and confirm the selected basis survives the URL reload.
4. Compare prior period/year or group by month. Each column uses its own cash dates. A monthly column may require historical allocation detail even when an annual cancelled pair nets to zero.
5. Click an account amount to inspect recognized cash transactions and follow the two journal links. Cash drills must reconcile to the selected account/column period, not the full original invoice amount.
6. Download PDF, Excel and CSV. Check the cash-basis note, dates, comparisons, exact amounts and recognition-policy notes. An export recaptures posted data, so a later posting may change a previously viewed result.
7. Save the report through Saved views; reopen it directly and from Saved & custom. Preview/export must retain Cash. A legacy accrual snapshot must never be shown under a Cash label.
8. Confirm past void/refund cases, zero activity, zero denominators, mobile table scrolling and permission denial using authorized isolated fixtures.

## Verification record

Automated coverage includes settlement timing, partial payments, unpaid balances, tax exclusion, direct cash transactions, loan/noncash exclusions, refunds, cross-period voids, exact cancellation, settlement FX, cross-document rounding, large integer amounts, credits, company isolation, paged adapters, unsafe API numeric rejection, standard comparisons, PDF/XLSX/CSV files, saved views, delivery guards and cash drill totals.

The isolated browser fixture uses the real selector, recognition engine, standard document builder and preview; it does not substitute mocked live accounting results. An authenticated staging smoke scenario was added for cash switching, refresh and CSV download. It is discovered but cannot execute without the authorized staging URL/account configuration; no live signed-in pass is claimed.

A read-only source diagnostic found two active posted customer receipts and three active posted supplier payments, with no unclassified allocation remainder among them. This aggregate observation is not an authenticated P&L acceptance test or a certification of every company's history. No production financial data or schema was changed.
