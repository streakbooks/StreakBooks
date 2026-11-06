import { describe, expect, it } from "vitest";
import {
  convertBasePrice,
  isValidRate,
  planPrice,
  strategyFitsCurrency,
  type PriceList,
} from "./country-pricing";

// The same vectors are asserted against billing.fx_convert in tests/integration/billing-03-pricing.sql.
const vectors = [
  { base: 1000n, to: "AUD", rate: "1.523456789012", markup: 0, mode: "HALF_UP", expected: 1523n },
  { base: 5000n, to: "JPY", rate: "151.37", markup: 0, mode: "HALF_UP", expected: 7569n },
  { base: 5000n, to: "JPY", rate: "151.37", markup: 0, mode: "HALF_EVEN", expected: 7568n },
  { base: 5000n, to: "JPY", rate: "151.37", markup: 0, mode: "DOWN", expected: 7568n },
  { base: 1000n, to: "KWD", rate: "0.3071", markup: 250, mode: "UP", expected: 3148n },
  {
    base: 99999999999n,
    to: "INR",
    rate: "83.123456789012",
    markup: 0,
    mode: "HALF_UP",
    expected: 8312345678818n,
  },
] as const;

describe("convertBasePrice", () => {
  it.each(vectors)("$base USD -> $to at $rate ($mode, $markup bps)", (vector) => {
    expect(
      convertBasePrice({
        baseMinor: vector.base,
        targetCurrency: vector.to,
        rate: vector.rate,
        markupBps: vector.markup,
        rounding: vector.mode,
      }),
    ).toBe(vector.expected);
  });

  it("refuses malformed rates and markups", () => {
    const base = {
      baseMinor: 1000n,
      targetCurrency: "AUD",
      markupBps: 0,
      rounding: "HALF_UP",
    } as const;
    expect(() => convertBasePrice({ ...base, rate: "1.5e2" })).toThrow();
    expect(() => convertBasePrice({ ...base, rate: "0" })).toThrow();
    expect(() => convertBasePrice({ ...base, rate: "1.5", markupBps: 10001 })).toThrow();
  });
});

describe("rules", () => {
  it("validates rates as plain decimals with up to 12 places", () => {
    expect(isValidRate("83.123456789012")).toBe(true);
    expect(isValidRate("0.0000001")).toBe(true);
    expect(isValidRate("1.0000000000001")).toBe(false);
    expect(isValidRate("-1")).toBe(false);
    expect(isValidRate("0.000")).toBe(false);
  });

  it("matches strategy and currency like the database", () => {
    expect(strategyFitsCurrency("BASE", "USD")).toBe(true);
    expect(strategyFitsCurrency("BASE", "EUR")).toBe(false);
    expect(strategyFitsCurrency("FX_CONVERTED", "USD")).toBe(false);
    expect(strategyFitsCurrency("FIXED", "INR")).toBe(true);
  });

  it("finds a plan price by interval", () => {
    const list: PriceList = {
      country: "IN",
      baseCurrency: "USD",
      plans: [
        {
          code: "pro",
          name: "Pro",
          versionId: "v",
          publishedAt: null,
          prices: [
            {
              priceId: "p",
              interval: "month",
              currency: "INR",
              amountMinor: 99900,
              strategy: "FIXED",
              country: "IN",
            },
          ],
        },
      ],
    };
    expect(planPrice(list, "pro", "month")?.amountMinor).toBe(99900);
    expect(planPrice(list, "pro", "year")).toBeNull();
    expect(planPrice(null, "pro", "month")).toBeNull();
  });
});
