# Cash-basis reporting and verified classification

## Accounting model and root causes

Accrual journals remain the source of truth. Cash reports transform existing posted sources and dated allocations; they do not post another ledger.

The reported P&L failure included valid documents whose `posted_journal_id` referenced their posted journals while the older journal `source_id` was empty. Using only `source_id` made those valid payment allocations appear orphaned. The shared loader now uses authoritative document foreign keys. Imported opening documents are a separate case: an opening control balance does not prove its original income, expense or tax split. These need reviewed source evidence rather than a fallback account.

Other corrected gaps included report-level basis propagation, company defaults, partial allocations, allocation changes and reversals, dated credit applications, snapshot/export parity, and cross-module use of the shared cash engine.

## Implemented architecture

- `cash-source.ts` normalizes current and archived allocations, authoritative document links and approved classifications. Interactive reports and frozen deliveries use the same source format.
- `cash-profit-loss.ts` recognizes allocated cash on posted receipt/payment dates, including partial payments, refunds, credits, unapplied advances and precise base-currency allocations.
- `cash-ledger.ts` supplies balanced cash trial balance, balance sheet, general ledger and drill-down facts. Opening documents have explicit historical recognition modes; verified tax/control/equity components reconcile independently.
- `cash-classification.ts` validates approved company/account policies against immutable snapshots of actual posted supporting journals. Prepaid payments and deferred receipts recognize expense/income once; noncash amortization and liability releases do not repeat it. Payroll components need independently supported accrual/payment history.
- `cash-inventory.ts` traces paid purchase cost to approved sale/return cost slices. Purchase payment remains the cash expense. The trace does not substitute accrual COGS or post another expense.
- Standard, custom, comparative, management, contact, sales/purchase, budget, project and dashboard reports reuse the existing cash transformation. Statutory tax basis remains separately configured.

## Review workflow

Open Accounting → Cash classification. Review requires existing reporting/accounting view permission; approvals require `accounting.post`. Report reads never approve policies or write exception records.

A report with insufficient evidence shows the transaction/account, amount/currency, source date, reporting period and missing evidence. Select **Review and record exception**, then **Record for review** on the accounting review page to persist the exception. Approve the actual source policy or opening document split with posted journal evidence, supporting reference, policy explanation and affirmative confirmation. Select the matching approval to resolve the exception and refresh the report. Resolution records do not bypass revalidation.

Approved records are immutable. Revisions append versions and preserve audit history. Opening documents separately specify future-settlement recognition or already-recognized historical activity. Optional verified original tax-code lines must reconcile to document gross before imported cash tax can be calculated. Reverse-charge lines require a verified original rate, independent of today’s tax-code rate. The inventory trace displays paid cost sold, held cost, returned cost awaiting refund and refund FX differences; its CSV uses the loaded trace.

## Database changes

1. `20261104081033_cash_source_links_and_report_snapshots.sql`: source links, dated allocation history/sequence, frozen cash source and basis propagation. No duplicate accounting entries.
2. `20261105070334_verified_cash_classification.sql`: policies, opening evidence, inventory evidence, exceptions and append-only audit; authorized approval/revision functions, RLS and captured classification snapshots.

These files are migrations for review. Local isolated PostgreSQL verification does not apply them to a hosted database. Deploy compatible application code and migrations together through the existing release process.

## Limits requiring source evidence

No production classifications have been fabricated or approved. Actual unresolved balances continue to raise explicit exceptions until reviewed. Inventory cost tracing currently accepts verified posted purchase-bill sources; direct cash acquisitions, imported opening inventory and complex returned-stock payment reallocation need exact source-cost history and remain explicit exceptions when unavailable. Noncash balance adjustments cannot be converted to cash expenses merely by selecting an expense account. Multi-currency payroll history with incompatible component currencies also remains an exception rather than an inferred split.

Automated isolated fixtures verify supported paths, not all historical company records. Authenticated staging, responsive/keyboard review, hosted migrations and production reconciliation remain release checks.

## Verification commands

```sh
npm run typecheck
npx eslint <changed TypeScript files>
npx vitest run --maxWorkers=2 --testTimeout=20000
python3 scripts/test-cash-history-postgres.py
python3 scripts/test-cash-classification-postgres.py
npm run build
npm run check:repository
npm run test:reporting -- --grep 'cash basis selector|cash Balance Sheet' --timeout=90000 --workers=1
```

Both PostgreSQL scripts create disposable PostgreSQL containers with network disabled. They do not access a hosted database.
