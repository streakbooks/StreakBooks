import { describe, expect, it } from "vitest";
import { canAddAdvisorPlanCode, normalizeAdvisorPlanCode } from "./plan-code";

describe("Advisors plan-code validation", () => {
  it("normalizes whitespace and casing", () => {
    expect(normalizeAdvisorPlanCode("  Premium   Plan  ")).toBe("premium_plan");
    expect(normalizeAdvisorPlanCode("Basic\tBooks")).toBe("basic_books");
  });
  it("rejects empty, invalid and oversized codes", () => {
    for (const value of ["", "123plan", "a-b", "a".repeat(65)]) {
      expect(canAddAdvisorPlanCode(value, [])).toBe(false);
    }
  });
  it("accepts valid normalized codes", () => {
    expect(canAddAdvisorPlanCode(" Premium Plan ", [])).toBe(true);
    expect(canAddAdvisorPlanCode("a", [])).toBe(true);
  });
  it("rejects non-ASCII punctuation and overlength normalized codes", () => {
    expect(canAddAdvisorPlanCode("plan/plus", [])).toBe(false);
    expect(canAddAdvisorPlanCode("équipe", [])).toBe(false);
    expect(canAddAdvisorPlanCode("a".repeat(64), [])).toBe(true);
    expect(canAddAdvisorPlanCode("a".repeat(65), [])).toBe(false);
  });
  it("rejects duplicate codes regardless of case", () => {
    expect(canAddAdvisorPlanCode("Premium Plan", ["PREMIUM_PLAN"])).toBe(false);
    expect(canAddAdvisorPlanCode("Premium Plan", ["  Premium   Plan  "])).toBe(false);
    expect(canAddAdvisorPlanCode("Premium Plan", ["other", "premium\tplan"])).toBe(false);
  });
});
