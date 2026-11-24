# Purchase requisitions

Original StreakBooks implementation. This adds `/purchases/requisitions` beneath the
existing Purchases module and uses its view/draft/authorise permission namespace.
No journal is posted by requisitions or conversion to a draft purchase order.

## Workflow

A requisition contains a supplier, request/required dates, currency, business
justification and proposed quantities/prices/accounts/tax rates. Save is atomic,
versioned and idempotent for new requests. Submitting fixes the proposal until it
is revised; approval or rejection requires a different authorised person from both
the creator and submitter. Rejection requires a reason. Resetting an approved or
rejected requisition clears approval and requires resubmission. Approved proposals
convert once to a draft PO, which follows the separate PO approval workflow.

The screen includes literal title/number search, status filters, bounded server
pagination, company-scoped suppliers/accounts, totals by document currency and
role-gated actions. Database checks remain authoritative. Audit events record each
mutation in the same transaction. New data tables grant authenticated users only
SELECT with RLS; mutation RPCs check explicit company permissions.

## Migration and recovery

`20261118013950_po_requisitions.sql` creates the table and RPCs and extends the existing
guarded demo reset to purge requisitions before linked orders. No reset runs during
migration. Apply only in reviewed migration order. Before rolling back, export
requisition records and detach their linked order references; dropping this new
table removes its approval/audit relationship and should not be used as a financial
reversal. Existing purchase orders and posted journals are not changed by migration.

## New-surface acceptance checklist

| Gate | Result |
| --- | --- |
| Route / registry / inventory | Route wrapper and real screen; Purchases module subnav derives from `PURCHASES_SECTIONS`; inventory updated |
| Shared visual shell | `ListWorkspace`, shared inputs/lookup, semantic table, accessible Radix dialogs and token classes |
| Loading / empty / error / forbidden | Implemented, including retry and nonempty filter empty states |
| Real actions | Atomic save and lifecycle RPCs; no dummy posting or delivery actions |
| RBAC / RLS | Existing purchases.view/draft/authorise; no new keys or permission catalogue seed needed |
| Scaffold | Executed `npm run scaffold:module -- --id purchases --label Purchases --nested requisitions`, then replaced disabled stub with authorised implementation |
| Permission namespace / role seed | N/A: reuses registered Purchases permission keys |
| Migration / rollback | Described above; production application is not inferred from SQL files |
| Honesty | No browser, live tenant or production verification implied |
| Responsive / accessibility | Responsive form/table/dialog, labels and keyboard controls implemented; manual screen-reader, contrast and device acceptance pending |
| Tests | API regression tests and isolated PostgreSQL scenarios; final run results reported by coordinating agent |
| Assets / originality | No assets or copied third-party source added |
| Merge / production | Pending; coordinating agent reports actual delivery evidence |

## Manual acceptance

Use a dedicated test organisation. Create a two-line request, submit, reject as a
second approver, reset/edit/resubmit, approve and convert. Check the created draft
PO retains the approved supplier, currency and totals. Replay conversion and
confirm it opens the same order. As requester, attempt self-approval; as view-only
and another-organisation user, attempt mutations and confirm denial. Open two
sessions and verify stale versions fail. Review desktop/tablet/mobile overflow,
keyboard focus and dialog close/restore behavior. These manual checks are not
claimed complete by this document.
