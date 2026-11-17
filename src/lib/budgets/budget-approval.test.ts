import { describe, expect, it } from "vitest";
import {
  availableBudgetApprovalActions,
  validateBudgetApprovalAction,
  APPROVAL_STATUS_LABELS,
} from "./budget-approval";

const base = {
  status: "draft" as const,
  isRequester: false,
  canManage: true,
  hasAmounts: true,
  manuallyLocked: false,
};

describe("budget approval commands", () => {
  it("trims approval notes", () => {
    expect(
      validateBudgetApprovalAction({ action: "approve", note: "  Reviewed and valid  " }),
    ).toEqual({
      action: "approve",
      note: "Reviewed and valid",
    });
  });
  it("rejects empty notes, invalid actions and oversized notes", () => {
    expect(() => validateBudgetApprovalAction({ action: "release", note: "Valid" })).toThrow();
    expect(() => validateBudgetApprovalAction({ action: "submit", note: "" })).toThrow();
    expect(() => validateBudgetApprovalAction({ action: "submit", note: "ab" })).toThrow();
    expect(() =>
      validateBudgetApprovalAction({ action: "submit", note: "x".repeat(501) }),
    ).toThrow();
  });
  it("allows submitting saved draft, rejected and reopened budgets", () => {
    for (const status of ["draft", "rejected", "withdrawn", "reopened"] as const) {
      expect(availableBudgetApprovalActions({ ...base, status })).toEqual(["submit"]);
    }
  });
  it("allows requester to withdraw but not approve their own submission", () => {
    expect(
      availableBudgetApprovalActions({ ...base, status: "pending", isRequester: true }),
    ).toEqual(["withdraw"]);
  });
  it("offers only review actions to other managers", () => {
    expect(
      availableBudgetApprovalActions({ ...base, status: "pending", isRequester: false }),
    ).toEqual(["approve", "reject"]);
  });
  it("only permits reopening an approved plan", () => {
    expect(availableBudgetApprovalActions({ ...base, status: "approved" })).toEqual(["reopen"]);
  });
  it("cannot submit an empty or manually locked plan", () => {
    expect(availableBudgetApprovalActions({ ...base, hasAmounts: false })).toEqual([]);
    expect(availableBudgetApprovalActions({ ...base, manuallyLocked: true })).toEqual([]);
  });
  it("does not expose approval actions to read-only users", () => {
    expect(
      availableBudgetApprovalActions({ ...base, canManage: false, status: "pending" }),
    ).toEqual([]);
  });
  it("has labels for all workflow states", () => {
    expect(Object.keys(APPROVAL_STATUS_LABELS)).toHaveLength(6);
    expect(APPROVAL_STATUS_LABELS.approved).toBe("Approved");
  });
});
