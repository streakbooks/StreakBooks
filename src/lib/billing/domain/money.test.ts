import { describe, expect, it } from "vitest";
import {
  convertMinorAmount,
  currencyMinorUnits,
  divideRounded,
  formatMinorAmount,
  isKnownCurrency,
  minorToDecimalString,
  multiplyByDecimal,
  parseAmountToMinor,
} from "./money";

describe("currency metadata", () => {
  it("uses ISO 4217 exponents for 0, 2 and 3 decimal currencies", () => {
    expect(currencyMinorUnits("JPY")).toBe(0);
    expect(currencyMinorUnits("INR")).toBe(2);
    expect(currencyMinorUnits("usd")).toBe(2);
    expect(currencyMinorUnits("BHD")).toBe(3);
    expect(currencyMinorUnits("KWD")).toBe(3);
  });

  it("rejects unknown and non-billing codes", () => {
    expect(isKnownCurrency("XAU")).toBe(false);
    expect(() => currencyMinorUnits("ZZZ")).toThrow(/Unsupported currency/);
  });
});

describe("divideRounded", () => {
  it.each([
    [5n, 2n, "HALF_UP", 3n],
    [5n, 2n, "HALF_EVEN", 2n],
    [7n, 2n, "HALF_EVEN", 4n],
    [5n, 2n, "DOWN", 2n],
    [5n, 2n, "UP", 3n],
    [-5n, 2n, "HALF_UP", -3n],
    [-5n, 2n, "DOWN", -2n],
    [4n, 2n, "UP", 2n],
  ] as const)("%s / %s %s = %s", (n, d, mode, expected) => {
    expect(divideRounded(n, d, mode)).toBe(expected);
  });

  it("refuses division by zero", () => {
    expect(() => divideRounded(1n, 0n, "HALF_UP")).toThrow();
  });
});

describe("parseAmountToMinor", () => {
  it("parses exact amounts per currency exponent", () => {
    expect(parseAmountToMinor("499", "INR")).toBe(49900n);
    expect(parseAmountToMinor("10.5", "USD")).toBe(1050n);
    expect(parseAmountToMinor("1500", "JPY")).toBe(1500n);
    expect(parseAmountToMinor("1.234", "BHD")).toBe(1234n);
  });

  it("rejects excess precision unless rounding is explicit", () => {
    expect(() => parseAmountToMinor("9.999", "USD")).toThrow(/at most 2/);
    expect(() => parseAmountToMinor("10.5", "JPY")).toThrow(/at most 0/);
    expect(parseAmountToMinor("9.995", "USD", "HALF_UP")).toBe(1000n);
    expect(parseAmountToMinor("9.995", "USD", "DOWN")).toBe(999n);
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "1,000", "1e3", "abc", "1.2.3", " . "]) {
      expect(() => parseAmountToMinor(bad, "USD")).toThrow();
    }
  });
});

describe("minorToDecimalString", () => {
  it("renders exact decimals", () => {
    expect(minorToDecimalString(49900n, "INR")).toBe("499.00");
    expect(minorToDecimalString(5n, "USD")).toBe("0.05");
    expect(minorToDecimalString(-1234n, "KWD")).toBe("-1.234");
    expect(minorToDecimalString(1500n, "JPY")).toBe("1500");
    expect(minorToDecimalString(123456789012345678901234n, "USD")).toBe(
      "1234567890123456789012.34",
    );
  });
});

describe("multiplyByDecimal", () => {
  it("applies an exact markup factor", () => {
    expect(multiplyByDecimal(1000n, "1.025", "HALF_UP")).toBe(1025n);
    expect(multiplyByDecimal(999n, "1.5", "HALF_UP")).toBe(1499n); // 1498.5 -> 1499
    expect(multiplyByDecimal(999n, "1.5", "HALF_EVEN")).toBe(1498n);
  });
});

describe("convertMinorAmount", () => {
  it("converts USD to a 2-decimal currency with an exact rate", () => {
    // USD 10.00 at 1.53214 AUD/USD = AUD 15.3214 -> 15.32
    expect(convertMinorAmount(1000n, "USD", "AUD", "1.53214", "HALF_UP")).toBe(1532n);
  });

  it("converts into 0-decimal and 3-decimal currencies", () => {
    // USD 10.00 at 151.235 JPY/USD = JPY 1512.35 -> 1512
    expect(convertMinorAmount(1000n, "USD", "JPY", "151.235", "HALF_UP")).toBe(1512n);
    // USD 10.00 at 0.37602 BHD/USD = BHD 3.7602 -> 3.760
    expect(convertMinorAmount(1000n, "USD", "BHD", "0.37602", "HALF_UP")).toBe(3760n);
  });

  it("is free of float drift for rates that are inexact in binary", () => {
    // 0.1 * 3 style traps: USD 0.30 at rate 1.1 = 0.33 exactly.
    expect(convertMinorAmount(30n, "USD", "EUR", "1.1", "HALF_UP")).toBe(33n);
  });

  it("rejects non-positive rates", () => {
    expect(() => convertMinorAmount(1000n, "USD", "AUD", "0", "HALF_UP")).toThrow();
    expect(() => convertMinorAmount(1000n, "USD", "AUD", "-1.2", "HALF_UP")).toThrow();
  });
});

describe("formatMinorAmount", () => {
  it("formats with the currency's own precision", () => {
    expect(formatMinorAmount(49900n, "INR", "en-IN")).toBe("₹499.00");
    expect(formatMinorAmount(1000n, "USD", "en-US")).toBe("$10.00");
    expect(formatMinorAmount(1500n, "JPY", "en-US")).toBe("¥1,500");
    expect(formatMinorAmount(3760n, "BHD", "en-US")).toMatch(/3\.760/);
  });

  it("formats amounts beyond the safe integer range exactly", () => {
    expect(formatMinorAmount(900719925474099312n, "USD", "en-US")).toBe(
      "$9,007,199,254,740,993.12",
    );
  });
});
