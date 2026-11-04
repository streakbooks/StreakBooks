import { describe, expect, it } from "vitest";
import { normalizeCurrencySelection } from "./currency-selection";

describe("settings currency selection", () => {
  it("normalises to an ordered unique list without silently removing values", () => {
    expect(normalizeCurrencySelection(["usd", " EUR ", "USD"], { enforceSupported: true })).toEqual(
      ["EUR", "USD"],
    );
    expect(normalizeCurrencySelection([])).toEqual([]);
  });

  it("rejects invalid or unsupported new selections", () => {
    for (const value of [["USD", "invalid"], ["USD", null], ["US"], "USD", null]) {
      expect(() => normalizeCurrencySelection(value, { enforceSupported: true })).toThrow();
    }
    expect(() => normalizeCurrencySelection(["XYZ"], { enforceSupported: true })).toThrow(
      "not supported",
    );
  });

  it("accepts a legacy code in an expected snapshot so the user can remove it", () => {
    expect(normalizeCurrencySelection(["XYZ", "USD"])).toEqual(["USD", "XYZ"]);
  });
});
