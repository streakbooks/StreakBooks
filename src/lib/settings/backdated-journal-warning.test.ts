import { describe, expect, it } from "vitest";
import { backdatedJournalWarning } from "./backdated-journal-warning";

describe("manual journal backdate warning", () => {
  it("warns at and beyond the configured day threshold without blocking posting", () => {
    expect(backdatedJournalWarning("2026-01-01", 90, "2026-04-01")).toContain(
      "90-day backdate warning threshold",
    );
    expect(backdatedJournalWarning("2026-01-01", 90, "2026-04-02")).toContain(
      "91 days before today",
    );
  });

  it("does not warn for recent dates, future dates or a disabled threshold", () => {
    expect(backdatedJournalWarning("2026-03-31", 90, "2026-04-01")).toBeNull();
    expect(backdatedJournalWarning("2026-04-02", 1, "2026-04-01")).toBeNull();
    expect(backdatedJournalWarning("2025-01-01", 0, "2026-04-01")).toBeNull();
  });

  it("ignores invalid dates and malformed stored thresholds safely", () => {
    expect(backdatedJournalWarning("2026-02-30", 1, "2026-04-01")).toBeNull();
    expect(backdatedJournalWarning("2026-01-01", Number.NaN, "2026-04-01")).toBeNull();
  });
});
