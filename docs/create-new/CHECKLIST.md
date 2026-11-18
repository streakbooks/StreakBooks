# Create New checklist

Source of truth: `src/lib/create-new/registry.ts`. All 30 commands stay in the menu. A command opens when `availability` is `ready` and the role has its permission.

## Enabled (full-page workspaces)

These navigate to dedicated routes (browser history, Back, deep links):

| Action | Destination |
| --- | --- |
| Invoice | `/sales/invoices/new` |
| Quote / Estimate | `/sales/quotes/new` |
| Receive payment | `/sales/receipts/new` |
| Customer credit note | `/sales/credit-notes/new` |
| Recurring invoice | `/sales/recurring/new` |
| Bill | `/purchases/bills/new` |
| Recurring bill | `/purchases/recurring/new` |
| Purchase order | `/purchases/orders/new` |
| Quick payment | `/purchases/payments/new` |
| Spend money | `/banking/spend-money` |
| Supplier credit | `/purchases/credit-notes/new` |
| Expense claim | `/expense-management/my-expenses?create=true` (Purchases employee-expenses is legacy approve list only) |
| Receive money | `/banking/receive-money` |
| Sales receipt / refunds / deposit / card / adjustment | `/banking/money-documents/new?kind=…` |
| Transfer money | `/banking/transfers/new` |
| Manual journal | `/accounting/journals/new?mode=post` |
| Recurring journal | `/accounting/journals/new?mode=template` |
| Customer / Supplier | `/contacts/new?kind=…` |
| Product / Service | `/products-services?create=true` |

## Enabled (list / tooling / flyover)

| Action | Destination | Notes |
| --- | --- | --- |
| Customer statement | `/sales/statements` | Statement tooling page |
| Chart of account | Flyover `NewAccountPanel` | Also available from Accounting CoA |
| Project | Flyover `ProjectPanel` | Narrow create |
| Document upload | Flyover `InboxPanel` | No malware scanner claimed |

## Held

None. All 29 registry actions have `availability: "ready"`. Permission still gates visibility.

Recurring bill automatic generation uses the existing schedule runner; do not invent posting that bypasses approvals.
