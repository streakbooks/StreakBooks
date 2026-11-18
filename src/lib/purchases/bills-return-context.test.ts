import { describe, expect, it } from "vitest";
import { decodeBillsReturnContext, encodeBillsReturnContext } from "./bills-return-context";

describe("Bills list return navigation", () => {
  it("round-trips all list filters and pagination without changing types", () => {
    const original = {
      tab: "to_pay" as const,
      q: "Paper & printing",
      from: "2026-01-01",
      to: "2026-10-31",
      dateField: "due_date" as const,
      includeVoid: true,
      overdueOnly: true,
      status: "authorised",
      page: 4,
      sortBy: "total_minor",
      sortDir: "asc" as const,
    };
    expect(decodeBillsReturnContext(encodeBillsReturnContext(original))).toEqual(original);
  });

  it("does not generate redirects or preserve arbitrary parameters", () => {
    const result = decodeBillsReturnContext("q=supplies&returnTo=https%3A%2F%2Fevil.example&admin=true");
    expect(result).toEqual({ q: "supplies" });
    expect(encodeBillsReturnContext(result)).toBe("q=supplies");
  });

  it("rejects invalid enum values and bounds pagination", () => {
    expect(decodeBillsReturnContext(
      "tab=forged&sortDir=sideways&dateField=wrong&sortBy=javascript&page=9999999",
    )).toEqual({ page: 1_000_000 });
  });

  it("rejects invalid dates and overlong text", () => {
    expect(decodeBillsReturnContext(
      "from=yesterday&to=2026-10-01x&q=" + "x".repeat(101),
    )).toEqual({});
  });

  it("does not preserve false or empty filters", () => {
    expect(encodeBillsReturnContext({ q: "", includeVoid: false, page: 0 })).toBe("page=0");
  });

  it("rejects oversized strings instead of allowing unbounded URLs", () => {
    expect(decodeBillsReturnContext("q=" + "x".repeat(2049))).toEqual({});
    expect(encodeBillsReturnContext({ q: "x".repeat(2049) })).toBe("");
  });

  it("accepts only true positive boolean values", () => {
    expect(decodeBillsReturnContext("includeVoid=false&overdueOnly=1")).toEqual({
      overdueOnly: true,
    });
  });

  it("returns empty context for malformed non-string inputs", () => {
    expect(decodeBillsReturnContext(null)).toEqual({});
    expect(decodeBillsReturnContext({ tab: "all" })).toEqual({});
  });
});
