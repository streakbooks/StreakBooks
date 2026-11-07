import { describe, expect, it } from "vitest";
import {
  EXPENSE_MANAGEMENT_SECTIONS,
  expenseManagementSection,
  isExpenseManagementSectionKey,
} from "./sections";

describe("expense management sections", () => {
  it("includes the required workspace tabs", () => {
    const keys = EXPENSE_MANAGEMENT_SECTIONS.map((section) => section.key);
    expect(keys).toEqual([
      "overview",
      "my-expenses",
      "claims",
      "approvals",
      "reimbursements",
      "receipts",
      "mileage",
      "travel",
      "corporate-cards",
      "cash-advances",
      "spending-requests",
      "budgets",
      "petty-cash",
      "reports",
      "settings",
    ]);
  });

  it("validates section keys", () => {
    expect(isExpenseManagementSectionKey("approvals")).toBe(true);
    expect(isExpenseManagementSectionKey("unknown")).toBe(false);
    expect(expenseManagementSection("settings").batch).toBe("EM-01");
  });
});
