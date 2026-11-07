import { describe, expect, it } from "vitest";
import {
  EXPENSE_MANAGEMENT_BASE,
  EXPENSE_MANAGEMENT_SECTIONS,
  expenseManagementSection,
  isExpenseManagementSectionKey,
} from "./sections";
import { PURCHASES_SECTIONS } from "@/lib/document-sections";
import { navItems } from "@/lib/nav";

describe("expense management sections", () => {
  it("is a top-level module path, not nested under Purchases", () => {
    expect(EXPENSE_MANAGEMENT_BASE).toBe("/expense-management");
    expect(navItems.some((item) => item.to === "/expense-management")).toBe(true);
    expect(EXPENSE_MANAGEMENT_SECTIONS.every((s) => s.path.startsWith("/expense-management"))).toBe(
      true,
    );
    expect(PURCHASES_SECTIONS.some((s) => s.to.includes("expense-management"))).toBe(false);
  });

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
      "exit-settlement",
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
