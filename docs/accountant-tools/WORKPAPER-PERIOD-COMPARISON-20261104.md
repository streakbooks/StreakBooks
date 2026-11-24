# Accountant workpapers — prior-period comparison increment

**Date:** 4 November 2026  
**Repository:** streakbooks/StreakBooks  
**Scope:** Nonposting balance-sheet workpaper period-over-period review; no new database schema.

## Delivered

- Adds a prior-period comparison inside the existing balance-sheet workpaper tab.
- Fetches **actual posted GL balances** and independent workpaper records for a user-selected earlier date, through the same authenticated, company-authorized server functions already used by the workpaper register.
- Compares assets, liabilities and equity using signed base-currency minor units: debit positive, credit negative.
- Presents prior/current posted balances, movement, and **separate prior/current workpaper review states**.
- Detects stale historical sign-offs when historical posted balances no longer match their saved evidence snapshot.
- Ranks movements by absolute magnitude without floating-point approximations; shows unavailable rather than pretending unsafe or missing history is zero.
- Exports the comparison, review states and both dates' evidence *references* to existing spreadsheet-formula-neutralizing CSV.
- Uses a default-off earlier-date query so the tab does not load historical data until requested.

## Non-negotiable integrity rules

- A prior reviewed state **must never** become a current-period review or carry-forward approval. This feature does not create, edit, prepare, reopen or sign off any workpaper.
- A change in GL balance is not automatically an accounting error. It is an investigation candidate that must be explained in the period close.
- An absent historical account is not a zero ledger movement. The UI marks movement unavailable.
- No bank reconciliation, accounting journal, source document, period lock, tax return or production data is changed by this comparison.

## Acceptance tests

1. Choose two dates for the same tenant and verify a debit-positive asset and credit-negative liability show correct signed movements.
2. Verify existing prior and current workpaper reviews retain independent statuses.
3. Test a prior reviewed balance later altered by backdated posting; its saved review must appear stale.
4. Test an account absent on the selected prior date; do not show made-up zero movement.
5. Test very large/unsafe balances; suppress monetary movement rather than silently rounding.
6. Export CSV, then check displayed amounts and evidence references. The export is an analysis schedule, not proof of review.
7. Verify a read-only accountant can access the comparison but cannot mutate workpapers.
8. Verify unrelated tenant identifiers are denied at the server and RLS boundaries.
9. Manually test empty comparison, invalid date, API failure, keyboard navigation and mobile layout.

## Remaining advanced Accountant Tools scope

- Full reconciling-item subsidiary schedules and file attachments in workpapers.
- Signed-off comparative lead schedule packages and controlled carry-forward preparation.
- Persisted exception dispositions, review notes and approval/audit history for anomaly suggestions.
- Multi-journal bulk-import staging and approval workflows; current CSV supports one manual journal draft only.
- Expanded document requests, reconciliation candidate recommendations and accountant close automation.
- Multi-role staging E2E, performance and security acceptance before declaring the entire module production-certified.

This is an incremental, safe enhancement, not completion of the full advanced-accountant brief.
