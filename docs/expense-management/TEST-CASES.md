# Expense Management — Navigation test cases

## Automated (local)

| ID | Case | Expected |
| --- | --- | --- |
| NAV-01 | `EXPENSE_MANAGEMENT_BASE` | Equals `/expense-management` |
| NAV-02 | `navItems` | Contains top-level `/expense-management` |
| NAV-03 | Section paths | All 15 start with `/expense-management` |
| NAV-04 | Purchases sections | No `expense-management` entry |
| NAV-05 | `activeNavItem("/expense-management/my-expenses")` | Expense Management |
| NAV-06 | `activeNavItem("/purchases/expenses")` | Purchases |
| NAV-07 | Access catalogue | Every `expenses.*` permission listed once under Expense Management area |
| NAV-08 | `check:ui` | No route/screen contract violations |

## Manual (authenticated local / staging — not yet executed for this amendment)

| ID | Case | Expected |
| --- | --- | --- |
| NAV-M01 | Open sidebar → Expense Management | Lands on overview; Purchases remains separate |
| NAV-M02 | Open each of 15 tabs | Correct title; denied roles see no-access state |
| NAV-M03 | Browser back from claim detail | Returns to My Expenses / Claims |
| NAV-M04 | Open section in new tab | Loads standalone URL |
| NAV-M05 | Sidebar search “expense” | Finds Expense Management |
| NAV-M06 | Visit `/purchases/expense-management/receipts` | Redirects to `/expense-management/receipts` |
| NAV-M07 | Purchases → Expenses | Company spend-money still works |
| NAV-M08 | Narrow / mobile viewport | Subnav wraps; primary item reachable |

Record manual results in the batch final report when executed.
