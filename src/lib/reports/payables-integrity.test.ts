import { describe, expect, it } from "vitest";
import {
  assertCurrentPayablesDate,
  assertPayablesAsOfNotFuture,
  payableOutstandingInBase,
} from "./payables-integrity";

describe("payables reporting integrity", () => {
  it("allows historical as-at dates and rejects future dates", () => {
    expect(() => assertPayablesAsOfNotFuture("2026-11-03", "2026-11-03")).not.toThrow();
    expect(() => assertPayablesAsOfNotFuture("2026-10-31", "2026-11-03")).not.toThrow();
    expect(() => assertPayablesAsOfNotFuture("2026-11-04", "2026-11-03")).toThrow(
      "future as-at date",
    );
    expect(() => assertCurrentPayablesDate("2026-10-01", "2026-11-03")).not.toThrow();
  });

  it("never silently mixes foreign outstanding amounts into the base-currency total", () => {
    expect(() => payableOutstandingInBase(10000n, "USD", "GBP", null)).toThrow(
      "no posted exchange rate",
    );
    expect(() => payableOutstandingInBase(10000n, "USD", "GBP", 0)).toThrow();
    expect(payableOutstandingInBase(10000n, "USD", "GBP", "2")).toBe(20000n);
    expect(payableOutstandingInBase(1n, "JPY", "GBP", "2")).toBe(200n);
    expect(payableOutstandingInBase(10000n, "GBP", "GBP", null)).toBe(10000n);
    expect(payableOutstandingInBase(0n, "USD", "GBP", null)).toBe(0n);
  });
});
