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
| Fixed asset Create opens workspace | IMPLEMENTED | Batch 56: `/fixed-assets/new` redirects to sticky `?create=true` |
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

## Batch 56 (production defect + remaining create gaps)

| Gap | Action |
| --- | --- |
| Typecheck failures (firm/HR/projects/EM PersistedSwitch) | Fixed fixtures, Json narrowing, sticky project create search, PersistedSwitch optional props |
| Dedicated `/fixed-assets/new` | Thin redirect to sticky `?create=true` workspace |
| Project create sticky URL + close on save | Refresh-safe; `ProjectPanel onSaved` closes panel |
| Production build | Local `vite build` PASS on this batch |

## Batch 57 (sticky create honesty)

| Gap | Action |
| --- | --- |
| Shared create-search helpers | `parseCreateSearchFlag` + omit pattern (exactOptional-safe) |
| Budgets deep-link create | Sticky `?create=true` until Close |
| Payroll employee/run create deep links | Sticky `?create=true` opens RecordWorkspace |
| Requisition create URL sticky | Clear only when editor Cancel/Save |
| Expense claim Cancel | Clears `create` search so form does not reopen |
| Products create clear | exactOptional-safe omit (no `create: undefined`) |

## Batch 58 (empty CTA honesty)

| Gap | Action |
| --- | --- |
| HR training / performance / onboarding empty lists | EmptyState actions mirror header New controls |
| CRM territories empty | New territory CTA |
| PM properties / units / tenants empty | New property / unit / Link tenant CTAs |

## Batch 59 (empty CTA wave 2)

| Gap | Action |
| --- | --- |
| HR leave / shifts / transfers / relations / offboarding / recruitment / holidays / compensation | EmptyState actions mirror header create controls |
| PM leases / owners / agreements / payouts / statements / reservations | EmptyState New/Link/Generate CTAs |
| CRM campaigns | EmptyState New campaign CTA |

## Batch 60 (empty CTA wave 3)

| Gap | Action |
| --- | --- |
| PM rent charges / portals / ownership panel | EmptyState Generate/Invite/Add share CTAs |
| HR self-service leave empty | Request leave CTA |
| Messages conversation empties | New message / New group CTAs |
| CRM quotes / relationships / forecasting empties | Links to opportunities / quotes / pipelines |

