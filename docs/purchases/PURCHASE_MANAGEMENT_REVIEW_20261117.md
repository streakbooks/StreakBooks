# Purchase management review — 17 November 2026

Historical audit: subsequent implementation and remaining release gates are recorded
in `PURCHASE_ORDER_IMPLEMENTATION_20261118.md`. Findings below describe the earlier
review baseline, not the current implementation status.

Result: partially implemented; production readiness is not established. Reviewed local
checkout at 9026743f plus the matching fixes described below. This report supersedes
the older session's claims that goods receipts and atomic conversion are missing.

## Current coverage

| Capability | Source findings |
| --- | --- |
| Purchase requisitions | No purchase requisition schema, API or screen found. HR job requisitions are unrelated. |
| Purchase-order approvals | No order submit/approve/reject workflow found. `private.change_purchase_order_atomic` in `20261103154859_accounting_workflow_depth.sql` permits `purchases.draft` users to mark draft orders sent. Bill approval is a separate workflow. |
| Purchase orders | Draft save with version checking, tenant-scoped queries, server pagination, status changes and atomic conversion RPCs exist. |
| Receiving | Cumulative receipt quantities, over-receipt checks, locking and audit events exist in `20261117183000_po_goods_receipt.sql` and its replacement in `20261117190000_po_partial_bill_from_received.sql`. Live application unverified. |
| Partial billing | Received, unbilled quantities convert to draft bills in one database transaction. Conversion itself does not post journals. |
| Suppliers | Supplier directory and contacts exist. No supplier acknowledgement/date workflow found in the purchase-order sources examined. Marking an order sent records a manual status; it does not prove email delivery or supplier acceptance. |
| Three-way matching | Optional setting and bill-authorisation checks exist. Local matcher fixes are described below. This does not establish database-wide enforcement. |

## Fixed locally

`src/lib/purchases/po-three-way-match.ts` previously accepted a bill line solely because
its line number matched, even if its account or description differed. It also reused
an already matched order line, allowing two complete bill lines to consume the same
received quantity within one bill. Finally, a partial quantity carrying the entire
order-line net bypassed the proportional-price check when the two net amounts matched.

Matching now requires an unused line with the same account and normalized description,
prefers its line number, and falls back for renumbered partial bills. Partial quantities
always undergo the proportional-price check. Five regression cases cover duplicate
consumption, changed account, changed description, sparse/renumbered conversion, and
full-amount partial billing. Authorisation rejects a failed required match.

The bill detail screen also now declares the nullable `purchase_order_id` in its
local `BillPayload` type. Existing purchase-order navigation used this field but
failed TypeScript validation because the declaration omitted it. This is a type-only
change; the server already returns the linked identifier.

## Remaining findings and implementation priorities

1. **High: requisitions and order approvals are absent.** Implement tenant-scoped
   requisition headers/lines, versioned draft/submit/approve/reject/cancel transitions,
   maker/checker controls, configurable approval authority, audit history and atomic
   approved-requisition-to-order conversion. Add module registration, shared workspaces
   and role-based UI/backend checks under the new-module acceptance contract.
2. **High: converted-draft lifecycle does not reconcile operational counters.** The
   partial conversion migration increments `quantity_billed` on draft creation.
   `deleteDraftBill` in `purchases.functions.ts` deletes unposted bills without restoring
   these quantities. No counter-reconciliation trigger was found. Draft deletion,
   line edits and voiding need explicit transactional rules and stable source-line
   references. Reproduce in an isolated database before changing financial data.
3. **High: rounding is independent for each partial bill.** SQL uses
   `trunc(full_discount * bill_qty / ordered_quantity)` for every conversion. For an
   order of three units at 100 minor units with a one-unit discount, three separate
   one-unit receipts/bills produce 100 + 100 + 100 rather than the ordered net of 299.
   Reconcile cumulative net, discount and tax allocations, including final-bill
   residuals, and test SQL and application calculations together.
4. **High: matching is per bill, using inferred identity.** The matcher does not load
   quantities from other bills; independent edits or additional linked bills require
   cumulative reconciliation. Description/account matching is conservative but cannot
   distinguish identical order lines reliably. Persist source order-line IDs and
   enforce cumulative controls in the same transaction as authorisation.
5. **Medium: receiving is additive without a request identity.** Repeating a receipt
   after a lost response can record it twice if enough ordered quantity remains.
   Add receipt documents, stable idempotency keys, dates, references and reversal rules.
6. **Medium: supplier fulfilment tracking is incomplete.** Add acknowledgement date,
   promised delivery, late-order follow-up, durable communication outcomes and receipt
   history. Label manual status separately from actual external delivery.

## Verification

The final chat report records completed command outcomes. Purchase unit tests passed
179/179 in 27 files after the matcher fix. Matcher/test ESLint and `git diff --check`
passed. The bill detail screen has 609 Prettier errors and zero warnings; linting its
unchanged HEAD version confirmed the same 609 existing formatting errors. No full
repository lint pass is claimed.
No live SQL, tenant/RLS integration, authenticated staging or browser execution was
performed. Committed migrations are evidence of implementation, not application.
No PR, merge, deployment or production verification was performed in this session.
The production build passed with existing TanStack deprecation and bundler warnings.
Default-heap TypeScript validation exhausted memory; a 4 GiB retry exposed two
missing-field errors in `BillPayload`, corrected as above. The final full TypeScript
rerun with `NODE_OPTIONS=--max-old-space-size=4096` passed (exit 0). The build preceded
this erased type-only correction.

## Manual acceptance checklist

Use a dedicated test organisation at http://localhost:8080.

- Purchases → Orders: create an order, mark sent, receive a partial quantity, convert,
  inspect the draft bill, receive the remainder and convert again. Confirm conversion
  does not post a journal and ordered/received/billed amounts reconcile.
- Enable three-way matching. Verify unrelated items, duplicate consumption, excessive
  quantity and full-price partial quantities cannot be authorised. Verify a correctly
  renumbered partial bill can pass.
- Exercise draft deletion, bill editing and voiding against linked orders. Treat the
  unresolved counter and rounding findings as blockers until isolated database tests
  establish correct outcomes.
- Check view-only, draft and authorisation roles and two organisations. Direct requests
  must reject forbidden and cross-tenant actions.
- Review desktop, tablet and mobile layouts; keyboard navigation, focus and accessible
  action labels. These manual checks remain unexecuted.

## Safe Windows review

This cloud checkout does not modify `D:\MyApp\StreakBooks`. Changes are unpublished;
pulling main does not retrieve this fix. After the reviewed patch is transferred:

```powershell
cd D:\MyApp\StreakBooks
git status
git diff --check
git diff -- src/lib/purchases/po-three-way-match.ts src/lib/purchases/po-three-way-match.test.ts
npm.cmd test -- src/lib/purchases
if ($LASTEXITCODE -ne 0) { throw "Purchase tests failed." }
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw "TypeScript validation failed." }
npm.cmd run dev
```

Preserve local work before applying any patch. No branch switching, resetting or
production financial mutations are needed for this review.
