import { describe, expect, it } from "vitest";
import {
  exactDepreciationTotalMinor,
  planDepreciationMonths,
  safeDepreciationTotalMinor,
  summarizeDepreciationPreview,
  validateDepreciationPostingPeriods,
} from "./depreciation-review";
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


describe("server-side depreciation posting request integrity", () => {
  const latest = "2026-11-30";

  it("accepts one valid month or consecutive month ends including leap February", () => {
    expect(validateDepreciationPostingPeriods(["2026-11-30"], latest)).toEqual(["2026-11-30"]);
    expect(
      validateDepreciationPostingPeriods(
        ["2024-01-31", "2024-02-29", "2024-03-31"],
        latest,
      ),
    ).toEqual(["2024-01-31", "2024-02-29", "2024-03-31"]);
  });

  it("never reorders, deduplicates or skips requested months", () => {
    expect(() => validateDepreciationPostingPeriods(
      ["2026-09-30", "2026-09-30"], latest,
    )).toThrow(/consecutive/i);
    expect(() => validateDepreciationPostingPeriods(
      ["2026-11-30", "2026-10-31"], latest,
    )).toThrow(/consecutive/i);
    expect(() => validateDepreciationPostingPeriods(
      ["2026-09-30", "2026-11-30"], latest,
    )).toThrow(/consecutive/i);
  });

  it("blocks more than 36 months and future or malformed month ends", () => {
    expect(() => validateDepreciationPostingPeriods([], latest)).toThrow(/at least one/i);
    expect(() => validateDepreciationPostingPeriods(
      planDepreciationMonths("2023-01-01", "2026-01", 36).periodEnds.concat("2026-01-31"),
      latest,
    )).toThrow(/36/i);
    expect(() => validateDepreciationPostingPeriods(["2026-12-31"], latest))
      .toThrow(/not started/i);
    expect(() => validateDepreciationPostingPeriods(["2026-02-30"], latest))
      .toThrow(/real month end/i);
    expect(() => validateDepreciationPostingPeriods(["2026-11-29"], latest))
      .toThrow(/real month end/i);
    expect(() => validateDepreciationPostingPeriods(["2026-11-30"], "2026-11-29"))
      .toThrow(/permitted posting month/i);
  });

  it("sums posted monetary totals with exact bigints and guards preview API precision", () => {
    const posted: DepreciationRunRow[] = [
      entry("a", "posted", Number.MAX_SAFE_INTEGER),
      entry("b", "posted", 10),
    ];
    expect(exactDepreciationTotalMinor(posted, "posted"))
      .toBe("9007199254741001");
    expect(() => safeDepreciationTotalMinor(posted, "posted"))
      .toThrow(/precision/i);
    expect(safeDepreciationTotalMinor([entry("a", "due", 500)], "due"))
      .toBe(500);
    expect(exactDepreciationTotalMinor([], "posted")).toBe("0");
  });

  it("refuses a fractional or negative posted amount", () => {
    expect(() => exactDepreciationTotalMinor([entry("bad", "posted", -3)], "posted"))
      .toThrow(/invalid positive/i);
    expect(() => exactDepreciationTotalMinor([entry("bad", "posted", 3.5)], "posted"))
      .toThrow(/invalid positive/i);
  });
});
