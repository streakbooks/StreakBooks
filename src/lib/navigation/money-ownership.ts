/**
 * Module ownership for bank money movements (Batch 44).
 * Canonical create routes live under Banking; posting engines stay single-sourced.
 */
export const MONEY_OWNERSHIP = {
  receiveMoney: {
    owner: "banking",
    createRoute: "/banking/receive-money",
    legacyCreateRoute: "/banking/money-documents/new?kind=receive_money",
    listRoute: "/banking/money-documents",
    engine: "saveMoneyDocument receive_money",
  },
  spendMoney: {
    owner: "banking",
    createRoute: "/banking/spend-money",
    legacyCreateRoute: "/purchases/expenses/new",
    listRoute: "/purchases/expenses",
    engine: "saveAndPostExpense / purchase_expenses",
  },
  expenseClaims: {
    owner: "expenses",
    createRoute: "/expense-management/my-expenses",
    listRoute: "/expense-management/claims",
    engine: "expense_claims",
  },
  supplierBills: {
    owner: "purchases",
    createRoute: "/purchases/bills/new",
    listRoute: "/purchases/bills",
    engine: "purchase bills",
  },
} as const;

/** Create-menu / shortcut IDs that must open Banking Spend Money. */
export const SPEND_MONEY_ENTRY_ACTION_IDS = ["expense"] as const;

/** Create-menu IDs that must open Banking Receive Money. */
export const RECEIVE_MONEY_ENTRY_ACTION_IDS = ["receive_money"] as const;
