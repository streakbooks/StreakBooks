# Master Directive V2 — consolidated gap matrix

**Purpose:** Single tracker for Create/+New and premium UI vs Master Directive V2 + Addendum.  
**Do not restart Batches 46–54.** Implement only rows marked **MISSING** or unresolved **PARTIAL**.  
**Baseline main tip at Batch 55 start:** `e400ca48` (Batch 54 ledger).

## Status legend

| Status | Meaning |
| --- | --- |
| IMPLEMENTED | Verified in code on main / this batch; do not re-implement |
| PARTIAL | Works for primary path; known residual gap listed |
| MISSING | Confirmed gap — eligible for implementation |
| BLOCKED | Waiting on credentials, billing, migration auth, or engine constraint |

## P0 Create / financial workflows (Addendum §§16–19)

| Requirement | Status | Evidence / notes |
| --- | --- | --- |
| Manual Journal full-page create | IMPLEMENTED | `/accounting/journals/new?mode=post` → `ManualJournalPanel` |
| Recurring Journal full-page template | IMPLEMENTED | `/accounting/journals/new?mode=template` → `RecurringJournalPanel` |
| Recurring invoice / bill full-page | IMPLEMENTED | `/sales/recurring/new`, `/purchases/recurring/new` (+ edit URLs) |
| Spend Money Banking-owned editor | IMPLEMENTED | `/banking/spend-money` + `MONEY_OWNERSHIP` |
| Receive Money Banking-owned editor | IMPLEMENTED | `/banking/receive-money` (not Banking hub only) |
| Bank transfer dedicated create | IMPLEMENTED | `/banking/transfers/new` |
| `createNavTarget` preserves create intent | IMPLEMENTED | Batch 49+; Create menu uses helper |
| Product Create opens usable editor | IMPLEMENTED | Batch 55: `/products-services/new` RecordWorkspace; sticky until close |
| Fixed asset Create opens workspace | IMPLEMENTED | `?create=true` sticky until dismiss (Batch 55) |
| Account create labelled **New Account** | IMPLEMENTED | Batch 55 registry label (flyover CoA panel) |
| Expense claim Create opens draft workspace | IMPLEMENTED | `/expense-management/my-expenses?create=true` |
| Sales order dedicated `/new` | IMPLEMENTED | `/sales/orders/new` |
| Purchase requisition create workspace | IMPLEMENTED | `?create=true` + CREATE_ACTIONS |
| Money-document kinds keep distinct `kind` | IMPLEMENTED | `/banking/money-documents/new?kind=…` |
| Multi-account Spend/Receive allocation lines | BLOCKED | Posting engine constraint (documented) |
| Authenticated Playwright create smoke | BLOCKED | No staging E2E credentials |

## Shared premium UI (Workstream B)

| Requirement | Status | Evidence / notes |
| --- | --- | --- |
| TransactionWorkspace / RecordWorkspace / ListWorkspace | PARTIAL | Adopted on create/list surfaces in Batches 25–54; module DoD incomplete |
| EditableLineItemGrid Excel-style lines | PARTIAL | Sales/purchases/journals/money; residual modules TBD |
| Consistent +New / empty CTAs | PARTIAL | Batches 49–54 closed many; continue only on confirmed misses |
| Module finished-screen DoD (34 modules) | PARTIAL | **0/34 COMPLETE** — continue without duplicating create work |
| Staging / live RBAC / prod migrations | BLOCKED | Batches 23–24; require separate auth |

## Batch 55 (this gap close)

| Gap | Action |
| --- | --- |
| Account menu label | `Chart of account` → `New Account` |
| Product addressable create URL | Dedicated `/products-services/new`; sticky list `?create=true` until close |
| FA refresh-safe create | Keep `?create=true` until New asset workspace closes |
| Payroll runs typecheck break (Batch 54 leftover) | Remove orphaned `import {` after Dialog removal |
| Tracker honesty | This matrix + audit/ledger sync |

## Explicitly do **not** re-do

Batches 46–54 merged create routing, money ownership, journal/recurring full pages, EM list-only create, sales order `/new`, product/FA/payroll RecordWorkspace creates, CRM empty CTAs, browsing count sync.
