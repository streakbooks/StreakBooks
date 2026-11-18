import { describe, expect, it } from "vitest";
import {
  assertBankMatchPermissionGranted,
  isBankMatchPermissionGranted,
} from "@/lib/banking/match-permission";

describe("bank match permission gate", () => {
  it("grants when categorise or reconcile is present", () => {
    expect(isBankMatchPermissionGranted({ hasCategorise: true, hasReconcile: false })).toBe(true);
    expect(isBankMatchPermissionGranted({ hasCategorise: false, hasReconcile: true })).toBe(true);
    expect(isBankMatchPermissionGranted({ hasCategorise: true, hasReconcile: true })).toBe(true);
  });

  it("denies membership-only callers", () => {
    expect(isBankMatchPermissionGranted({ hasCategorise: false, hasReconcile: false })).toBe(false);
    expect(() =>
      assertBankMatchPermissionGranted({ hasCategorise: false, hasReconcile: false }),
    ).toThrow(/do not have permission/i);
  });

  it("assert is a no-op when either permission is granted", () => {
    expect(() =>
      assertBankMatchPermissionGranted({ hasCategorise: true, hasReconcile: false }),
    ).not.toThrow();
    expect(() =>
      assertBankMatchPermissionGranted({ hasCategorise: false, hasReconcile: true }),
    ).not.toThrow();
  });
});
