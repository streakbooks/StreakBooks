# LinkBooks Expense Management — Master PRD (navigation amendment)

**Version:** 2.1 — Standalone navigation  
**Supersedes navigation placement in Master Command v2.0**  
**Progress authority:** `EM-PROGRESS-TRACKER.md` (batch counts unchanged)

## Product placement

Expense Management is a **separate, top-level** LinkBooks main navigation module at `/expense-management`.

It sits in the primary sidebar Money group alongside Banking, Sales, Purchases, Accounting and Payroll. It is **not** nested under Purchases.

## Purchases coexistence

Purchases retains:

- Supplier bills and purchase orders
- Company-paid spend-money expenses (`/purchases/expenses`)
- Supplier payments
- Legacy employee expense claims UI (`/purchases/employee-expenses`) until fully migrated

Expense Management owns employee/organisation claim workflows without duplicating journals, liabilities or payment postings. Accounting, Banking, Payroll, Budgets, Tax, Files and Reports remain the shared financial infrastructure.

## Internal navigation (15 sections)

| Section | Path |
| --- | --- |
| Overview | `/expense-management` |
| My Expenses | `/expense-management/my-expenses` |
| All Claims | `/expense-management/claims` |
| Approvals | `/expense-management/approvals` |
| Reimbursements | `/expense-management/reimbursements` |
| Receipts & Inbox | `/expense-management/receipts` |
| Mileage | `/expense-management/mileage` |
| Travel | `/expense-management/travel` |
| Corporate Cards | `/expense-management/corporate-cards` |
| Cash Advances | `/expense-management/cash-advances` |
| Spending Requests | `/expense-management/spending-requests` |
| Budgets | `/expense-management/budgets` |
| Petty Cash | `/expense-management/petty-cash` |
| Reports | `/expense-management/reports` |
| Settings | `/expense-management/settings` |

Section visibility and actions are gated by `expenses.*` organisation permissions. Legacy bookmarks under `/purchases/expense-management/*` redirect to the standalone paths.

## Non-goals for this amendment

- Changing EM-01–EM-12 batch scope or verified progress percentages
- Inventing a second ledger or parallel reimbursement posting path
- Removing Purchases spend-money or legacy employee-expenses until migration batches complete

See also: `NAVIGATION-STANDALONE.md`, `ROADMAP.md`, `ACCEPTANCE.md`, `TEST-CASES.md`.
