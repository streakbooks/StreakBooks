import { describe, expect, it } from "vitest";
import { planDepreciationMonths, summarizeDepreciationPreview } from "./depreciation-review";
import type { DepreciationRunRow } from "./fixed-assets.functions";

const entry = (
  id: string,
  status: DepreciationRunRow["status"],
  amount = 0,
): DepreciationRunRow => ({
  asset_id: id,
  asset_number: "FA-" + id,
  asset_name: "Asset " + id,
  status,
  amount_minor: amount,
  accumulated_after_minor: amount + 100,
  journal_id: null,
});

describe("Fixed Assets depreciation review", () => {
  it("provides exact status counts and a verified due total", () => {
    expect(summarizeDepreciationPreview([
      entry("a", "due", 300),
      entry("b", "due", 200),
      entry("c", "behind"),
      entry("d", "not_started"),
      entry("e", "done"),
      entry("f", "nothing_left"),
      entry("g", "posted"),
    ], 500)).toEqual({
      due: 2,
      behind: 1,
      notStarted: 1,
      alreadyDone: 2,
      fullyDepreciated: 1,
      totalDueMinor: "500",
    });
  });

  it("fails closed for mismatched totals, duplicates and unsafe due amounts", () => {
    expect(() => summarizeDepreciationPreview([entry("a", "due", 200)], 100))
      .toThrow(/differs/i);
    expect(() => summarizeDepreciationPreview([entry("a", "due", 200), entry("a", "done")], 200))
      .toThrow(/duplicate/i);
    expect(() => summarizeDepreciationPreview([entry("a", "due", Number.MAX_SAFE_INTEGER + 1)], 0))
      .toThrow(/invalid amount/i);
    expect(() => summarizeDepreciationPreview([], Number.MAX_SAFE_INTEGER + 1))
      .toThrow(/exact/i);
  });

  it("makes a single-period proposal when no catch-up is outstanding", () => {
    expect(planDepreciationMonths(null, "2026-11")).toEqual({
      periodEnds: ["2026-11-30"],
      remainingMonths: 0,
      firstPeriodEnd: "2026-11-30",
      lastPeriodEnd: "2026-11-30",
    });
  });

  it("limits long catch-up requests to 36 consecutive months", () => {
    const plan = planDepreciationMonths("2020-01-01", "2026-11");
    expect(plan.periodEnds).toHaveLength(36);
    expect(plan.firstPeriodEnd).toBe("2020-01-31");
    expect(plan.lastPeriodEnd).toBe("2022-12-31");
    expect(plan.remainingMonths).toBe(47);
  });

  it("handles leap-month boundaries and a future outstanding date", () => {
    const plan = planDepreciationMonths("2024-02-01", "2024-04");
    expect(plan.periodEnds).toEqual(["2024-02-29", "2024-03-31", "2024-04-30"]);
    expect(planDepreciationMonths("2026-12-01", "2026-11").periodEnds)
      .toEqual(["2026-11-30"]);
  });

  it("rejects malformed month values and posting limits above the API cap", () => {
    expect(() => planDepreciationMonths("2020-01-01", "2026-99")).toThrow();
    expect(() => planDepreciationMonths(null, "2026-11", 37)).toThrow(/36/);
  });
});
