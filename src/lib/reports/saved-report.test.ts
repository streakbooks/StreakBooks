import { starterDefinition } from "./custom-definition";
import { describe, expect, it } from "vitest";
import {
  assertRunnableReport,
  libraryMetadata,
  savedReportName,
  validateSavedConfig,
  namedSavedConfig,
} from "./saved-report";

describe("saved report validation", () => {
  it("accepts only executable catalogue reports", () => {
    expect(assertRunnableReport("profit-and-loss")).toBe("profit-and-loss");
    expect(() => assertRunnableReport("customer-statement")).toThrow();
    expect(() => assertRunnableReport("unknown")).toThrow();
  });
  it("bounds and trims names", () => {
    expect(savedReportName.parse("  Monthly results  ")).toBe("Monthly results");
    expect(() => savedReportName.parse(" ")).toThrow();
    expect(() => savedReportName.parse("x".repeat(81))).toThrow();
  });
  it("retains supported filters and discards executable content and stale pagination", () => {
    expect(
      validateSavedConfig({
        from: "2026-01-01",
        to: "2026-03-31",
        columns: "month",
        page: 20,
        sql: "drop table companies",
        formula: "process.exit()",
        _library: { archived: true },
      }),
    ).toEqual({ from: "2026-01-01", to: "2026-03-31", columns: "month" });
  });
  it.each(["2026-02-30", "2025-02-29", "2026-13-01", "yesterday"])(
    "rejects invalid date %s",
    (from) => {
      expect(() => validateSavedConfig({ from })).toThrow("Invalid from date");
    },
  );
  it("accepts leap days and rejects reversed ranges and oversized configurations", () => {
    expect(validateSavedConfig({ from: "2024-02-29" })).toEqual({ from: "2024-02-29" });
    expect(() => validateSavedConfig({ from: "2026-04-01", to: "2026-03-01" })).toThrow();
    expect(() => validateSavedConfig({ junk: "x".repeat(100001) })).toThrow();
  });
  it("keeps renamed and duplicated builder titles aligned without changing the source", () => {
    const source = { _builder: starterDefinition("Original") };
    expect(namedSavedConfig(source, "Renamed")._builder?.title).toBe("Renamed");
    expect(source._builder.title).toBe("Original");
  });
  it("reads legacy configurations without metadata", () => {
    expect(libraryMetadata({ columns: "month" })).toEqual({
      archived: false,
      template: false,
      description: "",
    });
    expect(
      libraryMetadata({ _library: { archived: true, template: true, description: "Review" } })
        .archived,
    ).toBe(true);
  });
});
