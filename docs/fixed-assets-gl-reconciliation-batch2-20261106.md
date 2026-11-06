# LinkBooks Fixed Assets — Batch 2: General Ledger Reconciliation (2026-11-06)

## Change state

Source changes are committed to draft PR #111, **not merged into main and not tested or deployed**. This continues Batch 1 without introducing a separate competing PR.

## Implemented in source

- New **Fixed Assets → Reconcile to GL** tab.
- Authenticated, tenant-scoped, read-only server endpoint using existing `assertCompanyMember`.
- Read fixed assets and monthly depreciation entries using stable-ID pagination with tenant filters and an inclusive as-at date.
- Fetch posted, base-currency account balances with the canonical shared `fetchLedgerBalances` reporting function (SQL ledger aggregation with existing fallback).
- Compare each referenced account using signed **net debit less credit**:
  - Expected register net = active asset cost assigned to account − accumulated depreciation assigned to account.
  - Actual GL net = posted debits − posted credits as at the report date.
  - Difference = actual GL net − expected register net.
- Historic disposed assets remain in reconciliation account scope with a zero expected post-disposal balance, so uncleared GL amounts are visible.
- Correctly handle an account referenced as both cost and accumulated depreciation across different assets by **netting once per account**.
- No invented adjustments: differences indicate items needing accountant review.
- Show account-level costs, accumulated depreciation, net balances, variance status, linked asset count, and filtered spreadsheet-safe CSV export.
- One-click links to the existing Account Transactions report, scoped to the selected account and as-at date.
- Pure regression cases for signed balances, dates, disposal cutoffs, missing journal amounts, shared GL accounts, unsafe precision, orphans, over-depreciation and formula escaping.

## Material limitations / design choices

1. **A matched total is not a complete asset audit.** Only GL accounts referenced by registered assets are compared. Never-registered acquisitions in a new GL account cannot be discovered by this implementation.
2. **Not an atomic snapshot.** The register, depreciation entries and posted ledger are read in separate queries. Rerun the report if postings happen simultaneously.
3. The register reflects the **current saved account mapping**, not a historical versioned mapping. Effective as-of purchase/disposal dates are respected, but past edits before first depreciation can change historical comparisons.
4. Imported opening depreciation must already have corresponding general-ledger opening balances for account matching; this read-only check does not post them.
5. No tax-book depreciation reconciliation, historical account mapping, journal approval, or automated correction is introduced here.
6. The existing ledger aggregate RPC is reused for currency conversion and totals; independently verify its output against native GL reporting for multi-currency periods and large-value cases.
7. Separate test-tenant RLS and authenticated browser verification must be completed before release.

## Release verification (local only — do not trigger GitHub Actions)

```powershell
cd D:\MyApp\LinkBooks
git fetch origin
git switch feature/fixed-assets-register-safety-ux-20261106
git pull --ff-only origin feature/fixed-assets-register-safety-ux-20261106
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- src/lib/fixed-assets/reconciliation.test.ts src/lib/fixed-assets/register-view.test.ts src/lib/fixed-assets/depreciation.test.ts
npm.cmd run check:ui
npm.cmd run check:lookups
npm.cmd run build
npm.cmd run dev
```

Authenticated checks: open Fixed Assets → Reconcile to GL, choose a date, verify posted GL and register account balances, intentionally create a register-vs-GL mismatch in a test organisation, drill into the ledger, check CSV, verify missing-migration error handling and verify permissions for a different company. Do not create balancing journals automatically. Reconcile fixed asset accounts in the Trial Balance and Balance Sheet before making release claims.

## Subsequent batches

- Historical cost/account allocation trace and unregistered-capital-expenditure discovery.
- Asset attachments and audit timeline.
- Reconciliation exception ownership and sign-off workflows.
- Improvements, partial disposals, impairment, revaluation, tax books and location/custodian tracking (after accounting-policy specification and security tests).
