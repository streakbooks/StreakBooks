import { describe, expect, it } from "vitest";
import { PERMISSIONS, roleHasPermission } from "@/lib/permissions";

const EXPENSE_PERMISSIONS = [
  "expenses.view",
  "expenses.submit",
  "expenses.approve",
  "expenses.post",
  "expenses.reimburse",
  "expenses.manage_cards",
  "expenses.manage_advances",
  "expenses.manage_policies",
  "expenses.export",
  "expenses.audit",
  "expenses.admin",
] as const;

describe("expense management permissions", () => {
  it("registers every expense permission in the catalogue", () => {
    for (const key of EXPENSE_PERMISSIONS) {
      expect(PERMISSIONS).toContain(key);
    }
  });

  it("keeps submit for staff without approve, post or reimburse", () => {
    expect(roleHasPermission("staff", "expenses.submit")).toBe(true);
    expect(roleHasPermission("staff", "expenses.approve")).toBe(false);
    expect(roleHasPermission("staff", "expenses.post")).toBe(false);
    expect(roleHasPermission("staff", "expenses.reimburse")).toBe(false);
    expect(roleHasPermission("staff", "expenses.admin")).toBe(false);
  });

  it("segregates bookkeeper approve from reimburse/post", () => {
    expect(roleHasPermission("bookkeeper", "expenses.approve")).toBe(false);
    expect(roleHasPermission("bookkeeper", "expenses.post")).toBe(true);
    expect(roleHasPermission("bookkeeper", "expenses.reimburse")).toBe(true);
  });

  it("gives accountants policy and audit rights without expenses.admin", () => {
    expect(roleHasPermission("accountant", "expenses.manage_policies")).toBe(true);
    expect(roleHasPermission("accountant", "expenses.audit")).toBe(true);
    expect(roleHasPermission("accountant", "expenses.admin")).toBe(false);
  });
});
