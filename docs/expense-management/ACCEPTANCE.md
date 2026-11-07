# Expense Management — Navigation acceptance criteria

## Standalone module

- [x] Primary sidebar includes **Expense Management** as its own item (not under Purchases).
- [x] Base route is `/expense-management`.
- [x] All 15 approved internal sections are registered and permission-filtered.
- [x] Active sidebar highlighting follows nested Expense Management URLs.
- [x] Breadcrumbs resolve Expense Management segments.
- [x] Create New / Settings Centre / attachments / command palette use standalone paths.
- [x] Legacy `/purchases/expense-management/*` redirects to `/expense-management/*`.
- [x] Purchases subnav still exposes bills, spend-money expenses, payments and employee expenses.
- [x] Purchases subnav does **not** list Expense Management.
- [x] Expense permissions are catalogued under a dedicated Expense Management access area.

## Accounting integrity (ongoing)

- [ ] No duplicate journals or liability rows when claims move through EM (EM-06/EM-07).
- [ ] Reimbursements reuse Banking / Payroll posting patterns (EM-07).
- [ ] Budgets, Tax, Files and Reports integrations verified per later batches.

## Mileage (EM-08a — local code)

- [x] Company mileage rates with effective dates, unit, currency and expense account.
- [x] Mileage trip drafts create employee-paid claim lines with server-side amount calc.
- [ ] Applied migration + authenticated browser verification.

## Cash advances (EM-08b — local code)

- [x] Draft → issue (DR advance asset / CR bank) with `expenses.manage_advances`.
- [x] Link cash-advance claims and post as DR expense / CR advance; remaining balance updates.
- [ ] Unused advance reclaim to bank.
- [ ] Applied migration + authenticated browser verification.

## Petty cash (EM-08c — local code)

- [x] Float create/fund/replenish (DR petty cash / CR bank).
- [x] Company-paid claims link a float and post as DR expense / CR petty cash.
- [ ] Applied migration + authenticated browser verification.

## Travel / per diem (EM-08d — local code)

- [x] Company per diem rates with location, daily amount, account and effective dates.
- [x] Travel trip drafts create employee-paid per diem claim lines (inclusive days × rate).
- [ ] Booking integrations / multi-leg itineraries.
- [ ] Applied migration + authenticated browser verification.

## Explicitly out of scope for this navigation amendment

Browser E2E, applied migrations, GitHub CI/PR and production verification remain open and must not be marked complete from local code alone.
