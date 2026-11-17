import { describe, expect, it } from "vitest";
import { closeTieFromAsAt } from "./period-close-subledger";

describe("closeTieFromAsAt", () => {
  it("passes when variance is zero", () => {
    expect(closeTieFromAsAt({ varianceMinor: 0, tiesToControl: true })).toEqual({
      found: true,
      variance: 0,
      multiCurrencyBlocked: false,
    });
  });

  it("preserves a non-zero base-currency variance", () => {
    expect(closeTieFromAsAt({ varianceMinor: 250, tiesToControl: false })).toEqual({
      found: true,
      variance: 250,
      multiCurrencyBlocked: false,
    });
  });

  it("blocks automatic pass when foreign currencies prevent a single variance", () => {
    expect(closeTieFromAsAt({ varianceMinor: null, tiesToControl: null })).toEqual({
      found: true,
      variance: 1,
      multiCurrencyBlocked: true,
    });
  });
});
