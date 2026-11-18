# Banking money routing ownership (Batch 44)

## Canonical create routes

| Action | Owner | Create route | Posting engine |
| --- | --- | --- | --- |
| Receive money | Banking | `/banking/receive-money` | `saveMoneyDocument` (`receive_money`) |
| Spend money | Banking | `/banking/spend-money` | `saveAndPostExpense` (`purchase_expenses`) |
| Expense claims | Expenses | `/expense-management/my-expenses` | `expense_claims` |
| Supplier bills | Purchases | `/purchases/bills/new` | purchase bills |

## Legacy redirects (kept for deep links)

- `/purchases/expenses/new` → `/banking/spend-money`
- `/banking/money-documents/new?kind=receive_money` → `/banking/receive-money`

Posted spend documents remain readable at `/purchases/expenses/$id` (single ledger source).

## Cross-module shortcuts

Expenses overview **Spend money** opens Banking Spend Money with `returnTo=/expense-management` so Cancel/Back returns to Expenses without inventing a second posting engine.

## Batch 45 editor notes

- Spend Money uses `EditableLineItemGrid` (Description / Qty / Unit price / Amount). Line amounts **roll up** to a single `netMinor` for `saveAndPostExpense` (one expense account + one bank account). True multi-account line posting remains deferred.
- Receive Money exposes **Save & add another** and **Save & post** (returns to Bank documents).
