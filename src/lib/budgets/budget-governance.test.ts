import { describe, expect, it } from "vitest";
import { validateBudgetLockCommand } from "./budget-governance";

describe("budget governance request validation", () => {
  it("normalises audit reasons and preserves boolean lock state", () => {
    expect(validateBudgetLockCommand({ locked: true, reason: "  Approved FY budget  " })).toEqual({
      locked: true,
      reason: "Approved FY budget",
    });
    expect(validateBudgetLockCommand({ locked: false, reason: "Need to revise" })).toEqual({
      locked: false,
      reason: "Need to revise",
    });
  });

  it("does not accept string booleans or missing lock state", () => {
    expect(() => validateBudgetLockCommand({ locked: "true", reason: "Approved" })).toThrow(
      /valid lock state/,
    );
    expect(() => validateBudgetLockCommand({ locked: null, reason: "Approved" })).toThrow();
  });

  it("requires a meaningful non-empty reason", () => {
    for (const reason of ["", " ", "ab", 123, null]) {
      expect(() => validateBudgetLockCommand({ locked: true, reason })).toThrow(/reason/);
    }
    expect(validateBudgetLockCommand({ locked: true, reason: "abc" }).reason).toBe("abc");
  });

  it("limits lock and unlock notes to 500 characters", () => {
    expect(
      validateBudgetLockCommand({ locked: false, reason: "a".repeat(500) }).reason,
    ).toHaveLength(500);
    expect(() => validateBudgetLockCommand({ locked: false, reason: "a".repeat(501) })).toThrow(
      /500/,
    );
  });
});
