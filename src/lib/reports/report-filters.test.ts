import { describe, expect, it } from "vitest";
import {
  reportFiltersSchema,
  compareFilterDecimals,
  filterFingerprint,
  describeReportFilters,
} from "./report-filters";
describe("bounded reporting filter definitions", () => {
  it("preserves explicit AND/OR semantics and normalizes selected values without executable expressions", () => {
    const filters = reportFiltersSchema.parse({
      logic: "or",
      clauses: [
        { field: "memo", op: "in", values: ["Alpha", "", "Alpha", "Beta"] },
        { field: "debit", op: "between", values: ["100.00", "200"] },
      ],
    });
    expect(filters.clauses[0]!.values).toEqual(["Alpha", "Beta"]);
    expect(describeReportFilters(filters)).toContain(" OR ");
    expect(() =>
      reportFiltersSchema.parse({
        clauses: [{ field: "sql", op: "eq", values: ["drop table journals"] }],
      }),
    ).toThrow();
  });
  it("compares exact decimal thresholds beyond floating point precision", () => {
    expect(compareFilterDecimals("9007199254740993.01", "9007199254740993.00")).toBe(1);
    expect(compareFilterDecimals("100.00", "100")).toBe(0);
    expect(compareFilterDecimals("-0.1", "0")).toBe(-1);
  });
  it.each([
    { field: "debit", op: "between", values: ["2", "1"] },
    { field: "credit", op: "gt", values: ["1e9"] },
    { field: "journal_date", op: "eq", values: ["2026-02-30"] },
    { field: "account_name", op: "gt", values: ["A"] },
    { field: "memo", op: "empty", values: ["unexpected"] },
    { field: "account_id", op: "in", values: ["another tenant account"] },
  ])("rejects invalid values or operators: %o", (clause) =>
    expect(() => reportFiltersSchema.parse({ clauses: [clause] })).toThrow(),
  );
  it("does not make a presentation ID part of the financial filter fingerprint", () => {
    const first = reportFiltersSchema.parse({
      clauses: [{ field: "memo", op: "contains", values: ["100% literal"] }],
    });
    const second = reportFiltersSchema.parse({
      clauses: [{ field: "memo", op: "contains", values: ["100% literal"] }],
    });
    expect(filterFingerprint(first)).toBe(filterFingerprint(second));
  });
});
