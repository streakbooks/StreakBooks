# Create / +New workflow audit — Batch 46

**Branch:** `feature/premium-ui-batch46-create-workflows`  
**Baseline main:** `e186afd5` (Batch 45 merge)  
**Date:** 2026-11-18

## P0 entry points verified in this batch

| Module | Submodule | Source screen | Action | Intended destination | Actual (after fix) | Form rendering | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Accounting | Journals | Accounting → Post manual journal / Journals panel | New manual journal | Full-page journal workspace | `/accounting/journals/new?mode=post` | `ManualJournalPanel` + TransactionWorkspace | Fixed |
| Accounting | Recurring journals | Recurring journals list / Create menu | New recurring journal | Full-page template workspace | `/accounting/journals/new?mode=template` | `RecurringJournalPanel` + TransactionWorkspace | Fixed |
| Purchases | Recurring | Recurring list / Create menu | New recurring bill | Full-page bill template | `/purchases/recurring/new` | `NewBill mode=template` | Fixed (was Sheet) |
| Sales | Recurring | Recurring list / Create menu | New recurring invoice | Full-page schedule workspace | `/sales/recurring/new` | `NewRecurringInvoice` + TransactionWorkspace | Fixed (was inline half-box) |
| Banking | Spend money | Create menu / Purchases shortcuts | Spend money | Banking spend form | `/banking/spend-money` | Spend Money editor (Batch 44/45) | Verified intact |
| Banking | Receive money | Create menu / Banking subnav | Receive money | Banking receive form | `/banking/receive-money` | Receive Money form (Batch 44/45) | Verified intact |

## Registry routes (CREATE_ACTIONS)

Automated guard: `src/lib/create-new/create-workflow-routes.test.ts` + `menu.test.ts`.

Remaining non-`/new` destinations that are intentional (list/tooling, not complex accounting create):

- `customer_statement` → `/sales/statements`
- `reimbursement` → `/expense-management/my-expenses` (`?create=true`)
- `bank_transfer` → `/banking/transfers/new` (dedicated create; list is history)
- `product` → `/products-services/new` (Batch 55)
- `fixed_asset` → `/fixed-assets?create=true` (sticky until workspace closes; Batch 55)
- `account` → `/accounting` flyover; label **New Account** (Batch 55)
- `project` → `/projects` (flyover)
- `document_upload` → flyover only

## Defects closed this batch

1. Accounting `tab=post` embedded half-width journal → redirect to `/accounting/journals/new`.
2. Journals / Accountant / Recurring journals missing reliable New CTAs → Links to canonical routes.
3. Purchases recurring Sheet (`NewRecurringBillDialog`) → full-page `/purchases/recurring/new`.
4. Sales recurring inline max-width card → full-page `/sales/recurring/new` TransactionWorkspace.
5. Template bill title still said “New bill” → “Recurring bill template”.

## Follow-up closed on same branch (production hardening)

| Module | Action | Fix |
| --- | --- | --- |
| Banking | Transfer money | `/banking/transfers/new` TransactionWorkspace; list is history-only |
| Products | Product / Service | Create menu → `/products-services?create=true` opens New item dialog |
| Expenses | Expense claim | Create menu → `/expense-management/my-expenses?create=true` focuses full-width draft |
| Tooling | `check:navigation` / browsing manifest | Recurring + transfers + money/journal routes synced (163 routes) |

## Superseded by later batches

- Recurring bill/invoice **edit** → full-page `/$id/edit` (Batch 47).
- Transfer create → `/banking/transfers/new`; Banking hub New CTAs (Batches 46–49).
- Recurring Sheets deleted (Batch 48).
- Create nav intent helper `createNavTarget` (Batch 49).

## Batch 50 follow-ups (this programme)

- My Expenses list no longer dual-renders half-width create (list-only; `?create=true` → workspace).
- Command palette Create intents aligned (claim `create=true`, sales receipt vs receive payment).
- Empty CTAs: PO / supplier CN / bills recurring / fixed assets / sales orders / projects.
- Sales order create/edit uses TransactionWorkspace (route still `/sales/orders` until dedicated `/new`).

## Batch 53 follow-ups

- Dedicated `/sales/orders/new` TransactionWorkspace; legacy `?create=true` redirects.
- `purchase_requisition` CREATE_ACTIONS + palette + `?create=true`.
- Customers/suppliers lists route to Contacts create (no half-width inline forms).
- Budgets/CRM lead empty CTAs; budgets create on demand.

## Batch 54 follow-ups

- Product create → RecordWorkspace (edit remains Dialog).
- Fixed asset create → RecordWorkspace via `layout="workspace"` + CREATE `fixed_asset`.
- Payroll employee/run create → RecordWorkspace.
- CRM opportunities/activities empty New CTAs.

## Batch 55 follow-ups (directive gap consolidation)

- Account CREATE label → **New Account**.
- Dedicated `/products-services/new`; list `?create=true` stays until Cancel/Save.
- Fixed asset `?create=true` sticky until New asset workspace closes.
- Consolidated tracker: `docs/premium-ui/DIRECTIVE_V2_GAP_MATRIX.md`.

## Still deferred

- Authenticated Playwright create-flow smoke (blocked without staging E2E credentials).
- Multi-account Spend/Receive allocation lines (posting engine constraint).
- Optional dedicated `/fixed-assets/new` (sticky `?create=true` is addressable; extract only if needed).
- Module finished-screen DoD (0/34 COMPLETE).
