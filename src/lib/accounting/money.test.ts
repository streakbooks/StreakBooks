import { describe, expect, it } from "vitest";
import { assertLinesBalance, fromMinorUnits, sumMinor, toMinorUnits, toSafeMinorNumber } from "./money";

describe("money minor units", () => {
  it("converts major to minor without float drift", () => {
    expect(toMinorUnits("10.00", "GBP")).toBe(1000n);
    expect(toMinorUnits("0.01", "USD")).toBe(1n);
    expect(toMinorUnits("1.005", "USD")).toBe(101n); // half-up
    expect(toMinorUnits("100", "JPY")).toBe(100n);
  });

  it("rejects invalid amounts", () => {
    expect(() => toMinorUnits("abc", "GBP")).toThrow(/Invalid money amount/);
  });

  it("round-trips display", () => {
    expect(fromMinorUnits(12345n, "GBP")).toBe("123.45");
    expect(fromMinorUnits(100n, "JPY")).toBe("100");
  });

  it("sums with bigint only", () => {
    expect(sumMinor([10n, 20n, 30n])).toBe(60n);
  });

  it("converts only exact minor-unit integers at legacy number boundaries", () => {
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    expect(toSafeMinorNumber(0n, "Test")).toBe(0);
    expect(toSafeMinorNumber(max, "Test")).toBe(Number.MAX_SAFE_INTEGER);
    expect(toSafeMinorNumber(-max, "Test")).toBe(-Number.MAX_SAFE_INTEGER);
    expect(() => toSafeMinorNumber(max + 1n, "Opening balance")).toThrow(/Opening balance/);
    expect(() => toSafeMinorNumber(-(max + 1n), "Net profit")).toThrow(/Net profit/);
  });
});

describe("journal balance validation", () => {
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";

  it("accepts balanced journals", () => {
    const totals = assertLinesBalance([
      { account_id: a, debit_minor: 500n, credit_minor: 0n },
      { account_id: b, debit_minor: 0n, credit_minor: 500n },
    ]);
    expect(totals.debit).toBe(500n);
    expect(totals.credit).toBe(500n);
  });

  it("rejects unbalanced journals", () => {
    expect(() =>
      assertLinesBalance([
        { account_id: a, debit_minor: 500n, credit_minor: 0n },
        { account_id: b, debit_minor: 0n, credit_minor: 400n },
      ]),
    ).toThrow(/does not balance/);
  });

  it("rejects dual-sided lines", () => {
    expect(() =>
      assertLinesBalance([
        { account_id: a, debit_minor: 1n, credit_minor: 1n },
        { account_id: b, debit_minor: 0n, credit_minor: 0n },
      ]),
    ).toThrow(/either debit or credit/);
  });

  it("rejects single-line journals", () => {
    expect(() =>
      assertLinesBalance([{ account_id: a, debit_minor: 100n, credit_minor: 0n }]),
    ).toThrow(/at least two lines/);
  });
});
