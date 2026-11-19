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
| EditableLineItemGrid Excel-style lines | PARTIAL | Sales/purchases/journals/money/claims; Batch 68 spend/PO/CN keyboard+paste; residual module DoD / staging TBD |
| Consistent +New / empty CTAs | PARTIAL | Batches 49–63 closed create empties; Batch 64 App Store + approval queue bridges; residual queue-only empties intentional |
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

## Batch 61 (empty CTA wave 4)

| Gap | Action |
| --- | --- |
| HR assets / documents empties | Open New asset type / Assign / Add document dialogs |
| EM cards / spending / petty / exit | Scroll-to-form EmptyState CTAs |
| EM mileage / travel rate empties | Scroll to rate admin forms |
| CRM team No members | Link to Settings users |

## Batch 62 (empty CTA wave 5)

| Gap | Action |
| --- | --- |
| Advisors clients/staff/engagements empties | Scroll-to-form New client/advisor/engagement CTAs |
| Advisors billing/workspaces/documents/onboarding/overview | Bridge links to engagements, workspaces, inquiries, appointments |
| Advisors portal appointments/home | Book consultation (+ view appointments) |
| HR attendance empty logs | Record attendance dialog CTA |
| CRM contacts empty people | Link to Contacts master |

## Batch 63 (empty CTA wave 6)

| Gap | Action |
| --- | --- |
| EM receipts / reimbursements | Upload receipt scroll; Open approvals bridge |
| Advisors portal messages/tasks/docs/home plan | Compose focus; portal bridges; message advisor |
| Advisors inquiries/conversations filter empties | Clear filters + Advisors site |
| HR self-service attendance / automations | Check in; Refresh rules / Run all |
| App Store explore/billing | Clear filters; Explore apps |
| Sales statements | Choose customer scroll |

## Batch 64 (empty CTA wave 7 / App Store + queues)

| Gap | Action |
| --- | --- |
| App Store featured/register/reviews/sync/exceptions/trust/requests/section | Explore / clear filters / connections / sync bridges |
| EM approvals queue empties | Bridge to my expenses / all claims |
| HR approvals queue empties | Bridge to leave / attendance |
| PM owner statements select empty | Generate statement when permitted |

## Batch 65 (claims spreadsheet + DoD progress)

| Gap | Action |
| --- | --- |
| Expense claim create still card-stack lines (G15 deferred) | Migrate New claim lines to EditableLineItemGrid + DEFAULT_DOCUMENT_LINE_ROWS |
| EditableLineItemGrid residual | Claims create path closed; module DoD / staging still open |

## Batch 66 (claims totals + workspace adoption)

| Gap | Action |
| --- | --- |
| Claim create grid missing TotalsSummary | Live net/tax/total footer via TotalsSummary + minorOrZero |
| Workspace adoption gaps for spend/claims | Enforce TransactionWorkspace / EditableLineItemGrid / TotalsSummary in check:workspace |
| Expense DoD honesty | Document local evidence in FINISHED-SCREEN-DOD-CORE (still IN PROGRESS) |

## Batch 67 (claim keyboard + receive-money adoption)

| Gap | Action |
| --- | --- |
| Claim spreadsheet keyboard/paste | Enter/Arrow navigation + net/tax multi-cell paste (journal parity) |
| Receive Money workspace adoption | Enforce MoneyDocumentPanel TransactionWorkspace + TotalsSummary in check:workspace |
| Includes Batch 66 | Claim TotalsSummary + spend/claims workspace rules rebased onto current main |

## Batch 68 (spend / PO / CN keyboard + workspace gates)

| Gap | Action |
| --- | --- |
| Spend Money spreadsheet keyboard/paste | Enter/Arrow + qty/price paste on expenses.new (banking Spend Money) |
| Purchase order numeric keyboard/paste | qty/price/discount/tax% journal-parity helpers |
| Purchase credit note keyboard/paste + totals | description/net/tax nav; net+tax TotalsSummary rows |
| Workspace adoption | check:workspace enforces interpretLineGridKey on claims/spend/PO/CN |
| Includes Batches 66–67 | Rebased onto current main (supersedes PR #338) |

## Batch 69 (allocate / transfer TotalsSummary)

| Gap | Action |
| --- | --- |
| Receipt allocate totals | TotalsSummary Amount / Allocated / Unallocated on receipts.new |
| Payment allocate chrome + totals | Dense bill table + Allocate oldest first + TotalsSummary Remaining |
| Transfer totals | TotalsSummary Amount (+ Received on FX mismatch) on NewTransfer |
| Workspace adoption | check:workspace gates receipts/payments/transfers TotalsSummary |
| Includes Batches 66–68 | Carried on feature branch (supersedes PR #340) |

## Batch 70 (recurring / sales order / batch payment chrome)

| Gap | Action |
| --- | --- |
| Recurring invoice totals | TotalsSummary Subtotal/Tax/Total on create/edit |
| Sales order create/edit chrome | FormGrid + TotalsSummary + stickyActions; form owns TransactionWorkspace |
| Batch payment wrong chrome | ListWorkspace → TransactionWorkspace + FormGrid + TotalsSummary + sticky Pay |
| Workspace adoption | check:workspace gates recurring/orders.new/payments.batch |
| Includes Batches 66–69 | Rebased onto current main (supersedes PR #341) |

## Batch 71 (requisitions chrome + adoption locks)

| Gap | Action |
| --- | --- |
| Requisition create/edit chrome | FormGrid + TotalsSummary + sticky Save/Cancel; editor owns TransactionWorkspace |
| Claims header FormGrid | Create header fields use FormGrid (no redo of totals/keyboard) |
| Journal / sales-doc adoption | check:workspace locks JournalPanels + SalesDocumentEditor chrome |
| Includes Batches 66–70 | Rebased onto current main (supersedes PR #343) |

