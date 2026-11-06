# LinkBooks Fixed Assets — Batch 3: Posted Bill Capitalisation Review
Date: 2026-11-06. Source branch: `feature/fixed-assets-register-safety-ux-20261106`. PR #111 is a draft.

## User workflow implemented (source only)

1. Navigate **Fixed Assets → Review bill purchases**.
2. Choose a bill-date cutoff, search supplier/bill/description/GL account, choose a review status and use the shared GL-account lookup.
3. Read counts of asset-coded posted supplier-bill lines, unlinked lines, partially linked lines, and other review flags.
4. Review source bill details, current registered cost, bill net currency, and review classification.
5. Open the source purchase-bill workspace via a real link or choose **Review / add asset** where `accounts.manage` permits it.
6. Verify cost, tax treatment, depreciation terms and account mappings in the existing asset entry form. Save registers the asset **only**; it does not post another purchase bill or journal.
7. Export **filtered CSV**, including bill IDs and line IDs for audit; CSV escapes potentially executable spreadsheet text, preserves numeric minor units, and labels both currencies.

The original **Capitalise from a bill** dialog now searches and paginates candidates (25 rows/page). Posted bill retrieval no longer stops at 300; a stable-ID pager retrieves all eligible lines in account-ID batches (50 accounts/chunk). Linked asset costs are tenant-filtered, paged and summed in exact integer minor units. The server rejects unsafe numeric conversion instead of silently changing balances.

## Classification (review only, not posting rules)

- **No asset linked**: no current fixed-asset registration references this posted bill line.
- **Partial link**: a base-currency line has linked cost lower than its net price. This is only a candidate for further review.
- **Asset linked**: linked cost covers the net amount. **This is not proof that the transaction is PPE, that all costs are capitalised, or that VAT/GST handling is correct.**
- **FX review**: foreign-currency bill line has a linked asset, so comparing the bill amount to base-currency registered cost without historical FX is invalid.
- **Overlinked**: base-currency linked cost exceeds bill gross, indicating an anomaly to investigate.
- **Non-purchase amount**: zero/credit bill amount should not create a positive asset.

No automatic journal, depreciation, tax, reclassification, reversal, audit approval or database migration is introduced.

## Material limitations

- This view discovers **posted supplier-bill lines coded to non-control asset accounts**, not all fixed-asset acquisitions: direct bank payments, manual journals, supplier credits and unregistered acquisition accounts outside this selection are not comprehensively covered. Inventory, prepayments and deposits can be legitimate asset-account bill lines.
- The bill date cutoff is historical; the linked-asset coverage is the **current register state**, not historically versioned ownership or cost mapping.
- For mixed-currency cases, the form requires a verified base-currency amount and does not infer historic FX.
- Indicative amount differences are **not reconciled book balances**, not tax advice and not instructions to create balancing journals.
- Full company history is paged and collected before browser-side status filtering. For exceptionally large tenants, server-side date-range, cursor paging and aggregate-count endpoints remain a necessary scaling optimisation.
- Opened source bills, register writes and permissions must be validated in two separate authenticated organisations.
- The implementation is source-only until local tests, typecheck, build, lint, browser and RLS checks are run. GitHub Actions/CI are intentionally not triggered.

## Local verification — no GitHub Actions

```powershell
cd D:\MyApp\LinkBooks
git status
git fetch origin
git switch feature/fixed-assets-register-safety-ux-20261106
git pull --ff-only origin feature/fixed-assets-register-safety-ux-20261106
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- src/lib/fixed-assets/capitalisation-review.test.ts src/lib/fixed-assets/reconciliation.test.ts src/lib/fixed-assets/reconciliation-ledger.test.ts src/lib/fixed-assets/register-view.test.ts src/lib/fixed-assets/depreciation.test.ts
npm.cmd run check:ui
npm.cmd run check:lookups
npm.cmd run build
npm.cmd run dev
```

Manual acceptance cases: (1) more than 300 posted bill lines, (2) >50 eligible asset accounts, (3) 1000+ bill rows across pages, (4) linked cost from >1000 fixed assets and correct company filtering, (5) supplier bill in different currency, (6) zero/negative bill amounts, (7) multiple assets linked to one bill line, (8) changing the cutoff, search and filters, (9) CSV hostile formula text and numeric negative amounts, (10) permission to view vs create, (11) show linked and older bills in the capitalisation dialog, and (12) navigation back from the source bill.

## Next recommended batch

Test-suite execution and source build repair; then reconcile candidate results to the **actual acquisition GL journal lines** with historical account allocation and explicit review/disposition workflow for recurring exceptions, including non-bill acquisitions.
