# Cash-basis reporting: verified settlement core, NOT an enabled reporting basis

Date: 2026-11-02. Scope: an incremental reporting safety/recognition PR following merged #72.

## What this PR implements

- `src/lib/reports/cash-settlement.ts` recognises *posted* cash receipts and payments on their actual settlement dates, including partial allocations, signed refunds/reversals, separate tax/net components, applied noncash credit limits, deterministic cumulative minor-unit apportionment, and the original settlement FX rate. A base-currency rounding residual is returned explicitly for reconciliation, never silently discarded.
- The core rejects cross-organisation/source mismatches, duplicate settlement identities, invalid/voided records without verified reversal history, impossible cash/credit totals, missing/invalid FX, and unsupported rounding cases. It is a pure, side-effect-free calculation: no database access, writes or production accounting transactions.
- `standardSettingsSchema` explicitly allows only `basis: "accrual"` for live statements. Supplying `cash` fails validation before the reporting RPC; it cannot silently display accrual balances as cash. The default report is unchanged.
- Vitest coverage includes partial and full receipts, tax pennies, credit notes, refunds, FX with currency precision and rounding, as-of dates, duplicate/tenant guards and fail-closed cases.

## Release blockers: cash P&L / cash Balance Sheet must remain unavailable

This PR does **not** wire the calculation into `capture_standard_report_facts`, enable a cash selector, or claim cash-basis report correctness. A cash-basis Balance Sheet cannot be obtained by merely changing P&L timing or relabelling an accrual statement.

Before enabling cash reporting, implement and verify all of the following against an isolated, authenticated PostgreSQL fixture (not production):

1. A versioned read-only reporting RPC with tenant RLS and `reports.view` permissions, capturing posted invoices, bills, allocations, credit notes, cash refunds, bank settlements, FX rates and reversal chains **as of each requested date**. Ensure historical statuses and allocation changes do not rewrite earlier reports.
2. Signed and dated cash source movements for direct income/expenses, prepayments, unallocated receipts, inventory/COGS, tax remittances, payroll and noncash journals; explicit handling of opening balances, closing adjustments and period locks.
3. Account-level posting and tax liability rules per jurisdiction. Tie cash allocation sums, cash ledger and AR/AP controls to posted GL lines; assign/reconcile every FX rounding residual and realised gain/loss. Reject unsupported transactions rather than omit them.
4. An actual cash-basis Balance Sheet model with consistent assets, liabilities, equity and earnings across periods, plus fiscal-year comparisons and report drilldowns.
5. PostgreSQL RLS/authenticated permission, cross-tenant isolation, credit/refund, partial payment, FX, idempotency, concurrent retry and GL/subledger integration tests; browser and PDF/XLSX/CSV parity tests.
6. Safe, reviewed Supabase migrations staged in source control; deployment approval before production changes. No paid staging branches or test accounting writes to production.

Other reporting-parity items (inventory valuation/movement, receivable/payable detail, bank reconciliation detail, tax liability, favourites, scheduling and export templates) remain separate work and must be verified individually.

## Verification

This PR requires GitHub Actions `verify` (typecheck, unit tests, build) and existing browser jobs to pass. Pure unit tests **are not** authenticated integration evidence. Do not merge on pending/failed CI.
