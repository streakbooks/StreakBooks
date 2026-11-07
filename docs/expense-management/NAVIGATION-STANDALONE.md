# Expense Management — Standalone navigation decision

**Approved:** Expense Management is a **top-level** LinkBooks sidebar module.

## Navigation

- Sidebar: **Expense Management** → `/expense-management` (Money group, beside Sales / Purchases / Banking).
- Internal sections (15): Overview, My Expenses, All Claims, Approvals, Reimbursements, Receipts & Inbox, Mileage, Travel, Corporate Cards, Cash Advances, Spending Requests, Budgets, Petty Cash, Reports, Settings.
- Purchases keeps supplier bills, spend-money expenses (`/purchases/expenses`), payments and legacy employee expenses (`/purchases/employee-expenses`).
- Legacy URLs under `/purchases/expense-management/*` redirect to `/expense-management/*`.

## Integration (unchanged)

Reuse existing Accounting, Banking, Payroll, Budgets, Tax, Files and Reports infrastructure. Do not duplicate journals, liabilities or payment postings.

## Documents

- Master PRD amendment: `MASTER-PRD.md`
- Roadmap: `ROADMAP.md`
- Acceptance: `ACCEPTANCE.md`
- Test cases: `TEST-CASES.md`

## Progress tracker

The 12-batch EM roadmap and visual progress bar remain authoritative; this change updates placement only, not batch completion counts.
