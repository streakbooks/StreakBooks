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
- `reimbursement` → `/expense-management/my-expenses`
- `bank_transfer` → `/banking/transfers`
- `product` → `/products-services`
- `account` → `/accounting` (flyover CoA still primary)
- `project` → `/projects` (flyover)
- `document_upload` → flyover only

## Defects closed this batch

1. Accounting `tab=post` embedded half-width journal → redirect to `/accounting/journals/new`.
2. Journals / Accountant / Recurring journals missing reliable New CTAs → Links to canonical routes.
3. Purchases recurring Sheet (`NewRecurringBillDialog`) → full-page `/purchases/recurring/new`.
4. Sales recurring inline max-width card → full-page `/sales/recurring/new` TransactionWorkspace.
5. Template bill title still said “New bill” → “Recurring bill template”.

## Next batch candidates (P0-D+)

- Product / Statement / Transfer create destinations that still land on lists.
- Authenticated Playwright create-flow smoke (blocked without staging E2E credentials).
- Multi-account Spend/Receive allocation lines (deferred; posting engine constraint).
