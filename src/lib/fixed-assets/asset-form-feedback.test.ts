import { describe, expect, it } from "vitest";
import { validateAssetFormForDisplay, type AssetFormValues } from "./asset-form-feedback";

const complete: AssetFormValues = {
  name: "Vehicle",
  purchase: "2026-01-01",
  start: "2026-02-01",
  method: "straight_line",
  costMinor: 120000,
  residualMinor: 10000,
  openingMinor: 0,
  lifeMonths: 60,
  rateBps: null,
  assetAccountId: "account-cost",
  accumulatedAccountId: "account-acc",
  expenseAccountId: "account-expense",
  frozen: false,
};

describe("Fixed Assets form feedback", () => {
  it("accepts complete valid asset terms", () => {
    expect(validateAssetFormForDisplay(complete)).toEqual({
      fields: {},
      messages: [],
      valid: true,
    });
  });
  it("shows field-level errors for missing core inputs without silently accepting zero cost", () => {
    const feedback = validateAssetFormForDisplay({
      ...complete,
      name: "",
      purchase: "",
      start: "",
      costMinor: 0,
      assetAccountId: "",
    });
    expect(feedback.valid).toBe(false);
    expect(feedback.fields.name).toMatch(/name/i);
    expect(feedback.fields.purchase).toMatch(/date/i);
    expect(feedback.fields.start).toMatch(/date/i);
    expect(feedback.fields.cost).toMatch(/positive/i);
    expect(feedback.fields.asset).toMatch(/account/i);
  });
  it("detects invalid calendar days, pre-purchase starts and duplicate accounts", () => {
    const invalid = validateAssetFormForDisplay({
      ...complete,
      purchase: "2026-02-30",
      start: "2026-01-01",
      accumulatedAccountId: "account-cost",
    });
    expect(invalid.fields.purchase).toMatch(/valid/i);
    expect(invalid.fields.acc).toMatch(/separate/i);
    const reversed = validateAssetFormForDisplay({
      ...complete,
      purchase: "2026-02-05",
      start: "2026-02-04",
    });
    expect(reversed.fields.start).toMatch(/before/i);
  });
  it("respects reducing balance rate bounds and cost plus opening limits", () => {
    const result = validateAssetFormForDisplay({
      ...complete,
      method: "reducing_balance",
      rateBps: 10001,
      residualMinor: 80000,
      openingMinor: 50000,
    });
    expect(result.fields.rate).toMatch(/rate/i);
    expect(result.messages).toEqual(
      expect.arrayContaining([expect.stringMatching(/plus opening depreciation/i)]),
    );
  });
  it("allows descriptive-only changes to assets with posted depreciation", () => {
    const frozen = validateAssetFormForDisplay({
      ...complete,
      frozen: true,
      name: "Renamed",
      purchase: "",
      costMinor: null,
      assetAccountId: "",
      accumulatedAccountId: "",
      expenseAccountId: "",
    });
    expect(frozen.valid).toBe(true);
    expect(validateAssetFormForDisplay({ ...complete, frozen: true, name: "" }).fields.name)
      .toMatch(/name/i);
  });
  it("rejects non-finite and imprecise amounts", () => {
    expect(validateAssetFormForDisplay({ ...complete, costMinor: NaN }).fields.cost)
      .toMatch(/exact/i);
    expect(validateAssetFormForDisplay({
      ...complete,
      costMinor: Number.MAX_SAFE_INTEGER + 2,
    }).fields.cost).toMatch(/exact/i);
  });
});
