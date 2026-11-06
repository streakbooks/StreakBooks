import { describe, expect, it } from "vitest";
import { summarizeAssetDetailHistory } from "./asset-detail-summary";

const active = { cost_minor: 12000, opening_accumulated_minor: 2000, status: "active" as const };

describe("fixed asset detail financial presentation", () => {
  it("shows cost, actual posted charges, total recorded depreciation and remaining amount", () => {
    const result = summarizeAssetDetailHistory(active, [
      { amount_minor: 400 },
      { amount_minor: 300 },
    ]);
    expect(result).toEqual({
      costMinor: "12000",
      postedChargesMinor: "700",
      recordedAccumulatedMinor: "2700",
      remainingBeforeDisposalMinor: "9300",
      issue: null,
    });
  });

  it("does not present a pre-disposal remaining balance as current after disposal", () => {
    expect(
      summarizeAssetDetailHistory({ ...active, status: "disposed" }, [{ amount_minor: 300 }]),
    ).toMatchObject({ remainingBeforeDisposalMinor: null, recordedAccumulatedMinor: "2300" });
  });

  it("calculates very large totals precisely from exact integer strings", () => {
    const result = summarizeAssetDetailHistory(
      {
        cost_minor: "9007199254740994",
        opening_accumulated_minor: "9007199254740984",
        status: "active",
      },
      [{ amount_minor: "5" }],
    );
    expect(result).toMatchObject({
      costMinor: "9007199254740994",
      recordedAccumulatedMinor: "9007199254740989",
      remainingBeforeDisposalMinor: "5",
      issue: null,
    });
  });

  it("fails closed on unsafe JS numbers, over-depreciation and invalid amounts", () => {
    expect(
      summarizeAssetDetailHistory({ ...active, cost_minor: Number.MAX_SAFE_INTEGER + 2 }, []),
    ).toMatchObject({ costMinor: null, issue: expect.stringMatching(/precision/i) });
    expect(
      summarizeAssetDetailHistory(active, [{ amount_minor: 11000 }]),
    ).toMatchObject({
      remainingBeforeDisposalMinor: null,
      issue: expect.stringMatching(/exceeds/i),
    });
    expect(
      summarizeAssetDetailHistory(active, [{ amount_minor: "100.5" }]),
    ).toMatchObject({
      remainingBeforeDisposalMinor: null,
      issue: expect.stringMatching(/whole minor-unit/i),
    });
  });

  it("does not alter source assets or journal entries", () => {
    const entries = [{ amount_minor: "100" }, { amount_minor: "250" }];
    const before = JSON.stringify({ active, entries });
    summarizeAssetDetailHistory(active, entries);
    expect(JSON.stringify({ active, entries })).toBe(before);
  });
});
