export const EXPENSE_MANAGEMENT_BASE = "/expense-management" as const;

export const EXPENSE_MANAGEMENT_SECTIONS = [
  {
    key: "overview",
    label: "Overview",
    path: EXPENSE_MANAGEMENT_BASE,
    exact: true,
    anyOf: ["expenses.view", "expenses.submit", "expenses.approve", "expenses.admin"] as const,
    batch: "EM-02",
  },
  {
    key: "my-expenses",
    label: "My Expenses",
    path: `${EXPENSE_MANAGEMENT_BASE}/my-expenses`,
    anyOf: ["expenses.submit", "expenses.view", "expenses.admin"] as const,
    batch: "EM-03",
  },
  {
    key: "claims",
    label: "All Claims",
    path: `${EXPENSE_MANAGEMENT_BASE}/claims`,
    anyOf: ["expenses.view", "expenses.approve", "expenses.audit", "expenses.admin"] as const,
    batch: "EM-03",
  },
  {
    key: "approvals",
    label: "Approvals",
    path: `${EXPENSE_MANAGEMENT_BASE}/approvals`,
    anyOf: ["expenses.approve", "expenses.admin"] as const,
    batch: "EM-05",
  },
  {
    key: "reimbursements",
    label: "Reimbursements",
    path: `${EXPENSE_MANAGEMENT_BASE}/reimbursements`,
    anyOf: ["expenses.reimburse", "expenses.view", "expenses.admin"] as const,
    batch: "EM-07",
  },
  {
    key: "receipts",
    label: "Receipts & Inbox",
    path: `${EXPENSE_MANAGEMENT_BASE}/receipts`,
    anyOf: ["expenses.submit", "expenses.view", "expenses.admin"] as const,
    batch: "EM-04",
  },
  {
    key: "mileage",
    label: "Mileage",
    path: `${EXPENSE_MANAGEMENT_BASE}/mileage`,
    anyOf: ["expenses.submit", "expenses.view", "expenses.manage_policies", "expenses.admin"] as const,
    batch: "EM-08",
  },
  {
    key: "travel",
    label: "Travel",
    path: `${EXPENSE_MANAGEMENT_BASE}/travel`,
    anyOf: ["expenses.submit", "expenses.view", "expenses.admin"] as const,
    batch: "EM-08",
  },
  {
    key: "corporate-cards",
    label: "Corporate Cards",
    path: `${EXPENSE_MANAGEMENT_BASE}/corporate-cards`,
    anyOf: ["expenses.manage_cards", "expenses.view", "expenses.admin"] as const,
    batch: "EM-09",
  },
  {
    key: "exit-settlement",
    label: "Exit Settlement",
    path: `${EXPENSE_MANAGEMENT_BASE}/exit-settlement`,
    anyOf: ["expenses.manage_advances", "expenses.admin", "expenses.view"] as const,
    batch: "EM-09",
  },
  {
    key: "cash-advances",
    label: "Cash Advances",
    path: `${EXPENSE_MANAGEMENT_BASE}/cash-advances`,
    anyOf: ["expenses.manage_advances", "expenses.submit", "expenses.admin"] as const,
    batch: "EM-08",
  },
  {
    key: "spending-requests",
    label: "Spending Requests",
    path: `${EXPENSE_MANAGEMENT_BASE}/spending-requests`,
    anyOf: ["expenses.submit", "expenses.approve", "expenses.admin"] as const,
    batch: "EM-05",
  },
  {
    key: "budgets",
    label: "Budgets",
    path: `${EXPENSE_MANAGEMENT_BASE}/budgets`,
    anyOf: ["expenses.view", "expenses.manage_policies", "expenses.admin"] as const,
    batch: "EM-06",
  },
  {
    key: "petty-cash",
    label: "Petty Cash",
    path: `${EXPENSE_MANAGEMENT_BASE}/petty-cash`,
    anyOf: ["expenses.manage_advances", "expenses.post", "expenses.admin"] as const,
    batch: "EM-08",
  },
  {
    key: "reports",
    label: "Reports",
    path: `${EXPENSE_MANAGEMENT_BASE}/reports`,
    anyOf: ["expenses.export", "expenses.view", "expenses.audit", "expenses.admin"] as const,
    batch: "EM-11",
  },
  {
    key: "settings",
    label: "Settings",
    path: `${EXPENSE_MANAGEMENT_BASE}/settings`,
    anyOf: ["expenses.manage_policies", "expenses.admin"] as const,
    batch: "EM-01",
  },
] as const;

export type ExpenseManagementSectionKey = (typeof EXPENSE_MANAGEMENT_SECTIONS)[number]["key"];

const SECTION_KEYS = new Set<string>(EXPENSE_MANAGEMENT_SECTIONS.map((s) => s.key));

export function isExpenseManagementSectionKey(value: string): value is ExpenseManagementSectionKey {
  return SECTION_KEYS.has(value);
}

export function expenseManagementSection(
  key: ExpenseManagementSectionKey,
): (typeof EXPENSE_MANAGEMENT_SECTIONS)[number] {
  const found = EXPENSE_MANAGEMENT_SECTIONS.find((section) => section.key === key);
  if (!found) throw new Error(`Unknown expense management section: ${key}`);
  return found;
}
