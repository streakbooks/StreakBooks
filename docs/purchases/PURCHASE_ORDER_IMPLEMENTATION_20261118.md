# Purchase order implementation — 18 November 2026

Status: implemented locally, pending release verification. This is an original
StreakBooks implementation. It uses the existing accounting engine, access model and
document services; no third-party purchasing source or assets were copied.

## Delivered workflow

| Capability | Behaviour |
| --- | --- |
| Requisitions | Supplier, justification, required date, currency, proposed lines; versioned draft, submit, independent approval/rejection, cancellation and one-time conversion to a draft PO. |
| Order approval | Separate draft/pending/approved/rejected approval state; creator and submitter cannot approve. Approval clears when commercial data changes. Sending requires approval. |
| Order workspace | Server search/pagination, lifecycle and late-delivery filters, original ordered quantities, received/billed/outstanding quantities and duplication into a fresh draft. |
| Supplier fulfilment | Supplier reference, expected delivery, acknowledgement date, delivery address and commercial terms. Print/email data includes these details. |
| Receipts | Dated receipt documents, delivery references, stable retry identities, immutable history, over-receipt protection and audited full-receipt reversal when quantities are unbilled. |
| Partial bills | Stable order-line references; received quantities reserve only once; cumulative net/tax allocations reconcile the final bill to the original order. |
| Invoice details | Separate version-checked supplier invoice/date/due-date/memo/FX edits preserve source quantities, prices and tax allocations. |
| Posting and void | PO-linked authorisation and voiding call the shared journal engine inside the same database transaction as bill status, audit and quantity changes. Payment/credit allocations must be resolved before voiding. |
| Integrity | Database guards reject direct commercial edits, excess cumulative billing, orphan source journals and direct reversal bypasses. Draft deletion/void restores reserved quantities. |
| Documents | Existing print/PDF/email, attachments, notes and discussions remain integrated. Manual sent status is distinct from external email delivery. |

Orders, requisitions and receipts are operational documents. Only bill authorisation
posts accounting entries. PO billing is based on received goods and exclusive tax
rates. Currency-specific display and document amounts are preserved.

## Compatibility and data recovery

Apply these migrations in this order after reviewing the existing migration history:

1. `20261118013918_po_lifecycle_controls.sql`
2. `20261118013950_po_requisitions.sql`
3. `20261118013953_po_billing_integrity.sql`

They depend on the existing accounting workflow, goods receipt and partial billing
migrations. They have been exercised in an isolated Postgres fixture; they have not
been applied to a live project in this session. A complete production migration
history replay is a separate release gate.

Previously sent/received/billed orders retain an approved operational state without
inventing historical approver identities. Historical bill source references are
backfilled only where the match is unique. Ambiguous historical bills remain blocked
from conversion/posting until their source allocation is reconciled; posted money is
not silently rewritten. Legacy send/receipt RPCs fail with a refresh instruction;
updated clients must use the versioned approval and idempotent receipt endpoints.

The demo reset wraps the existing latest reset implementation instead of replacing
its other-module cleanup. An inaccessible, transaction-scoped private marker permits
only its authorised destructive cleanup. No demo flag bypasses posting or validation.

Use forward corrective migrations for recovery. Do not drop the new source columns,
guards or requisition records once financial documents depend on them. Capture a
staging backup and review ambiguous historical source rows before live application.

## Verification and practical limits

Final result: pending release verification. The core workflow is implemented locally;
the broader procurement features listed below remain outside this delivery.

| Item | Verified result |
| --- | --- |
| Task implementation | Core requisition/PO/receipt/billing workflow complete locally; overall release pending |
| Pull request | Not created |
| Merge into main | Not performed |
| Verified GitHub main commit | Not verified; changes are unpublished |
| Pre-merge GitHub CI | Not run |
| Unit/API tests | 231 passed, 0 failed in 32 files against the working tree |
| Integration tests | 106 isolated Postgres assertions passed, including 5 races with 3 concurrent transactions each |
| Browser/E2E | 4 screen-fixture Chromium tests passed; desktop/mobile screenshots reviewed |
| TypeScript | Passed with 6 GiB Node heap |
| Production build | Passed; TanStack deprecation and bundler warnings remain |
| ESLint | 37 changed/new source files: 0 errors, 0 warnings; full-repository lint not claimed |
| Module/UI/navigation contracts | Passed |
| Diff whitespace check | Passed |
| Supabase migrations | Applied/tested only in isolated fixture; live application pending |
| Vercel deployment | Not deployed; generated local build output is not a deployment |
| Authenticated staging tests | Not executed; URL and test credentials not configured |
| Production verification | Not verified |

Unit/API tests, fixture browser tests and isolated Postgres integration tests cover different boundaries.
The browser fixture uses mock server responses and omits external document/discussion
services; it does not establish authentication, RLS or delivery. SQL tests execute
real transaction functions and the shared posting/reversal engine against a scoped
fixture, rather than the entire application migration history.

Authenticated staging credentials/URL were not configured. No PR, GitHub merge,
live migration, deployment, live supplier message or production verification is
implied by this implementation. Windows `D:\MyApp\StreakBooks` remains separate from
this cloud checkout.

The current scope does not add vendor quote comparison/RFQ bidding, blanket purchase
agreements, supplier price lists, replenishment automation, inventory valuation,
warehouse/lot/serial movements, units-of-measure conversion, landed costs or localized
inclusive/reverse-charge PO taxes. Those require their own domain workflows and
acceptance checks. Zero-value partial allocations fail before reserving quantities;
receive more goods and retry when rounding would otherwise create an unpostable zero
invoice. Fully free procurement needs a separate nonfinancial close workflow.

## Manual release acceptance

Use a dedicated test organisation at `http://localhost:8080` or configured staging.

- Purchases → Requisitions: create, submit, reject as a second person, revise,
  resubmit, approve and convert. A repeated conversion must open the same draft PO.
- Purchases → Orders: enter terms/delivery details, submit, independently approve,
  mark sent and inspect printable supplier instructions and currency totals.
- Receive partial quantities with a delivery reference; replay a request and confirm
  one receipt. Verify over-receipt and reversal below billed quantity are denied.
- Bill received goods in multiple parts, including fractional quantities and small
  discounts/tax. Sum the bills and reconcile to the original order; delete a draft,
  regenerate, authorise and void with a reason and date.
- Test stale tabs and concurrent actions; view-only and cross-company requests must
  fail. Check inactive suppliers/accounts and disabled/missing FX or tax accounts.
- Verify email/PDF/files with actual services and inspect delivery outcomes. Sending
  a financial document to a real supplier requires an explicit delivery instruction.
- Review desktop/tablet/mobile and keyboard focus, screen-reader labels, dialogs and
  table scrolling. The fixture browser checks do not replace assistive-device review.
- Back up staging, apply the reviewed migrations, run advisors, perform the workflow
  with two real accounts, then approve release separately. Production sign-off remains
  pending until those checks and CI/deployment evidence are available.

## Local Windows verification

These changes are unpublished; pulling main does not retrieve them. Preserve local
work before transferring a reviewed patch or feature branch. After transfer:

```powershell
cd D:\MyApp\StreakBooks
git status
git diff --check
npm.cmd test -- src/lib/purchases src/lib/documents/purchase-order-mapper.test.ts
if ($LASTEXITCODE -ne 0) { throw "Purchase tests failed." }
$env:NODE_OPTIONS="--max-old-space-size=6144"
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw "TypeScript validation failed." }
npm.cmd run test:purchase-orders:postgres
if ($LASTEXITCODE -ne 0) { throw "Isolated database verification failed." }
npm.cmd run test:purchase-orders:e2e
if ($LASTEXITCODE -ne 0) { throw "Screen verification failed." }
npm.cmd run dev
```

The Postgres runner requires Docker with the `postgres:17` image and starts an
isolated container without exposed ports. The screen runner requires Chromium or
the configured Playwright Chromium executable. These commands do not apply live
migrations or send supplier messages.
