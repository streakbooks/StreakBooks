import { describe, expect, it } from "vitest";
import { assertReportDate, isReportDate } from "./date-validation";
import { isoDate } from "@/lib/planning/rpc";
import { parseReportSearch } from "./search";

describe("report calendar date integrity", () => {
  it.each([
    "2026-02-30",
    "2025-02-29",
    "2026-04-31",
    "2026-00-10",
    "2026-01-00",
    "2026-01-01junk",
    null,
    20260101,
  ])("rejects invalid date %s at report and planning boundaries", (value) => {
    expect(isReportDate(value)).toBe(false);
    expect(() => assertReportDate(value, "From")).toThrow("valid date");
    expect(() => isoDate(value, "As at")).toThrow("valid date");
    expect(parseReportSearch({ from: value, to: value })).toEqual({});
  });
  it.each(["2024-02-29", "2026-02-28", "2026-12-31"])("accepts real calendar date %s", (value) => {
    expect(assertReportDate(value, "From")).toBe(value);
    expect(parseReportSearch({ from: value })).toEqual({ from: value });
  });
});
