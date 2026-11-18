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
  it("normalizes padded searches and applies the effective length limit", () => {
    expect(parseBudgetListSearch({ q: "  FY 2026  " })).toEqual({ q: "FY 2026" });
    expect(parseBudgetListSearch({ q: "   " })).toEqual({});
    expect(parseBudgetListSearch({ q: "  " + "x".repeat(100) + "  " })).toEqual({
      q: "x".repeat(100),
    });
    expect(parseBudgetListSearch({ q: "  " + "x".repeat(101) + "  " })).toEqual({});
    expect(decodeBudgetListReturnContext("q=++FY+2026++")).toEqual({ q: "FY 2026" });
  });

  it("rejects ambiguous duplicate search keys and invisible control characters", () => {
    expect(decodeBudgetListReturnContext("q=first&q=second")).toEqual({});
    expect(decodeBudgetListReturnContext("q=first&q=first")).toEqual({});
    for (const control of ["\n", "\u007f", "\u061c", "\u200e", "\u202e", "\u2066", "\u2028"]) {
      expect(parseBudgetListSearch({ q: "FY" + control + "2026" })).toEqual({});
      expect(
        decodeBudgetListReturnContext("q=" + encodeURIComponent("FY" + control + "2026")),
      ).toEqual({});
    }
    expect(parseBudgetListSearch({ q: "बजट 2026" })).toEqual({ q: "बजट 2026" });
  });
});
