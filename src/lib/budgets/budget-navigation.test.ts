import { describe, expect, it } from "vitest";
import {
  decodeBudgetListReturnContext,
  encodeBudgetListReturnContext,
  parseBudgetListSearch,
} from "./budget-navigation";

describe("Budgets list browsing and return navigation", () => {
  it("round-trips a search query with special characters", () => {
    const original = { q: "FY 2026 & Operations + Sales" };
    expect(decodeBudgetListReturnContext(encodeBudgetListReturnContext(original))).toEqual(
      original,
    );
  });

  it("omits empty query values", () => {
    expect(parseBudgetListSearch({ q: "" })).toEqual({});
    expect(encodeBudgetListReturnContext({ q: "" })).toBe("");
    expect(decodeBudgetListReturnContext("")).toEqual({});
  });

  it("rejects unsafe redirects and arbitrary list fields", () => {
    expect(
      decodeBudgetListReturnContext("q=budget&returnTo=https%3A%2F%2Fevil.example&admin=true"),
    ).toEqual({ q: "budget" });
  });

  it("bounds query length and rejects malformed inputs", () => {
    expect(parseBudgetListSearch({ q: "x".repeat(101) })).toEqual({});
    expect(decodeBudgetListReturnContext("q=" + "x".repeat(650))).toEqual({});
    expect(decodeBudgetListReturnContext({ q: "test" })).toEqual({});
  });

  it("does not retain any detail route or company identifiers", () => {
    expect(
      parseBudgetListSearch({
        q: "budget",
        budgetId: "other-budget",
        companyId: "other-organisation",
      }),
    ).toEqual({ q: "budget" });
  });
});
