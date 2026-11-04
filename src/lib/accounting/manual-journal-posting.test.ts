import { describe, expect, it } from "vitest";
import { assertManualJournalPosting } from "./manual-journal-posting";

const lines = [
  { debitMinor: 20000, creditMinor: 0 },
  { debitMinor: 0, creditMinor: 20000 },
];

describe("manual journal server posting guard", () => {
  it("accepts a safe balanced double-entry journal", () => {
    expect(() => assertManualJournalPosting("2026-10-31", "2026-11-01", lines)).not.toThrow();
  });

  it("refuses invalid calendar dates and reversal ordering", () => {
    expect(() => assertManualJournalPosting("2026-02-30", undefined, lines)).toThrow(
      "valid posting date",
    );
    expect(() => assertManualJournalPosting("2026-10-31", "2026-11-31", lines)).toThrow(
      "valid reversal date",
    );
    expect(() => assertManualJournalPosting("2026-10-31", "2026-10-31", lines)).toThrow("after");
  });

  it("refuses NaN, fractional, unsafe and negative minor units", () => {
    for (const invalid of [NaN, Infinity, 0.3, Number.MAX_SAFE_INTEGER + 1, -1]) {
      expect(() =>
        assertManualJournalPosting("2026-10-31", undefined, [
          { debitMinor: invalid, creditMinor: 0 },
          lines[1]!,
        ]),
      ).toThrow("Journal line 1");
    }
  });

  it("refuses double-sided, empty, oversized and unbalanced journal lines", () => {
    expect(() =>
      assertManualJournalPosting("2026-10-31", undefined, [
        { debitMinor: 100, creditMinor: 100 },
        lines[1]!,
      ]),
    ).toThrow("Journal line 1");
    expect(() =>
      assertManualJournalPosting("2026-10-31", undefined, [
        { debitMinor: 0, creditMinor: 0 },
        lines[1]!,
      ]),
    ).toThrow("Journal line 1");
    expect(() => assertManualJournalPosting("2026-10-31", undefined, [lines[0]!])).toThrow(
      "between 2",
    );
    expect(() =>
      assertManualJournalPosting("2026-10-31", undefined, [
        lines[0]!,
        { debitMinor: 0, creditMinor: 10000 },
      ]),
    ).toThrow("balanced");
  });
});
