import { describe, expect, it } from "vitest";
import { allocateTaxAcrossLegs, splitExpenseAmount } from "./split";

describe("splitExpenseAmount", () => {
  it("splits by fixed amounts when they total the original", () => {
    const result = splitExpenseAmount(1100, "amount", [
      { amountMinor: 700, label: "Travel" },
      { amountMinor: 400, label: "Meals" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.legs.map((leg) => leg.amountMinor)).toEqual([700, 400]);
  });

  it("rejects amount splits that do not reconcile", () => {
    const result = splitExpenseAmount(1100, "amount", [
      { amountMinor: 700 },
      { amountMinor: 300 },
    ]);
    expect(result.ok).toBe(false);
  });

  it("splits by percentage and puts remainder on the last leg", () => {
    const result = splitExpenseAmount(100, "percentage", [
      { percentage: 33.333 },
      { percentage: 33.333 },
      { percentage: 33.334 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.legs.reduce((sum, leg) => sum + leg.amountMinor, 0)).toBe(100);
  });

  it("splits equally with remainder on the last leg", () => {
    const result = splitExpenseAmount(100, "equal", [{}, {}, {}]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.legs.map((leg) => leg.amountMinor)).toEqual([33, 33, 34]);
  });
});

describe("allocateTaxAcrossLegs", () => {
  it("allocates tax in proportion to net amounts", () => {
    expect(allocateTaxAcrossLegs(10, [70, 30])).toEqual([7, 3]);
  });
});
