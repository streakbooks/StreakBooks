import { describe, expect, it } from "vitest";
import { summarizeAssetDetailHistory } from "./asset-detail-summary";

const active = { cost_minor: 12000, residual_minor: 1000, opening_accumulated_minor: 2000, status: "active" as const };

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
        residual_minor: "0",
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

  it("preserves the residual value as the exact minimum remaining amount", () => {
    expect(summarizeAssetDetailHistory(
      { ...active, cost_minor: 12000, residual_minor: 4000, opening_accumulated_minor: 2000 },
      [{ amount_minor: 6000 }],
    )).toMatchObject({
      costMinor: "12000",
      recordedAccumulatedMinor: "8000",
      remainingBeforeDisposalMinor: "4000",
      issue: null,
    });
  });

  it("rejects depreciation below residual value, even if accumulated stays below gross cost", () => {
    expect(summarizeAssetDetailHistory(
      { ...active, residual_minor: 4000, opening_accumulated_minor: 2000 },
      [{ amount_minor: 6001 }],
    )).toMatchObject({
      costMinor: null,
      remainingBeforeDisposalMinor: null,
      issue: expect.stringMatching(/depreciable cost/i),
    });
  });

  it("rejects contradictory residual plus opening values and unsafe residual integers", () => {
    expect(summarizeAssetDetailHistory(
      { ...active, residual_minor: 11500, opening_accumulated_minor: 2000 },
      [],
    )).toMatchObject({ remainingBeforeDisposalMinor: null, issue: expect.stringMatching(/residual/i) });
    expect(summarizeAssetDetailHistory(
      { ...active, residual_minor: Number.MAX_SAFE_INTEGER + 1 },
      [],
    )).toMatchObject({ remainingBeforeDisposalMinor: null, issue: expect.stringMatching(/precision/i) });
  });

  it("continues to reject impossible posted depreciation for disposed assets", () => {
    expect(summarizeAssetDetailHistory(
      { ...active, status: "disposed", residual_minor: 4000 },
      [{ amount_minor: 6001 }],
    )).toMatchObject({
      recordedAccumulatedMinor: null,
      remainingBeforeDisposalMinor: null,
      issue: expect.stringMatching(/depreciable cost/i),
    });
  });

  it("does not alter source assets or journal entries", () => {
    const entries = [{ amount_minor: "100" }, { amount_minor: "250" }];
    const before = JSON.stringify({ active, entries });
    summarizeAssetDetailHistory(active, entries);
    expect(JSON.stringify({ active, entries })).toBe(before);
  });
});
