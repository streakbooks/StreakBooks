import { describe, expect, it } from "vitest";
import {
  buildMileageClaimLine,
  calculateMileageNetMinor,
  isMileageRateEffectiveOn,
  mapExpenseMileageRate,
  resolveMileageRateUnit,
} from "./mileage";

describe("resolveMileageRateUnit", () => {
  it("uses the company default for a new rate until the user chooses a unit", () => {
    expect(resolveMileageRateUnit("mi", null)).toBe("mi");
    expect(resolveMileageRateUnit("km", undefined)).toBe("km");
    expect(resolveMileageRateUnit(undefined, null)).toBe("km");
  });

  it("preserves an explicit new-rate choice over the company default", () => {
    expect(resolveMileageRateUnit("mi", "km")).toBe("km");
  });
});

describe("calculateMileageNetMinor", () => {
  it("rounds distance × rate into minor units", () => {
    expect(calculateMileageNetMinor(12.5, 45)).toBe(563);
    expect(calculateMileageNetMinor(10, 100)).toBe(1000);
  });

  it("rejects non-positive inputs", () => {
    expect(() => calculateMileageNetMinor(0, 45)).toThrow(/Distance/);
    expect(() => calculateMileageNetMinor(5, 0)).toThrow(/rate/i);
  });
});

describe("isMileageRateEffectiveOn", () => {
  it("checks active window inclusive of bounds", () => {
    const rate = {
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-12-31",
      isActive: true,
    };
    expect(isMileageRateEffectiveOn(rate, "2026-01-01")).toBe(true);
    expect(isMileageRateEffectiveOn(rate, "2026-12-31")).toBe(true);
    expect(isMileageRateEffectiveOn(rate, "2025-12-31")).toBe(false);
    expect(isMileageRateEffectiveOn({ ...rate, isActive: false }, "2026-06-01")).toBe(false);
  });
});

describe("buildMileageClaimLine", () => {
  it("builds a reimbursable mileage line from a rate", () => {
    const line = buildMileageClaimLine({
      expenseDate: "2026-11-07",
      distanceValue: 42,
      distanceUnit: "km",
      rate: {
        id: "rate-1",
        name: "Standard car",
        rateMinorPerUnit: 67,
        accountId: "acct-travel",
        distanceUnit: "km",
        currencyCode: "AUD",
      },
      origin: "Office",
      destination: "Client site",
    });

    expect(line.isMileage).toBe(true);
    expect(line.netMinor).toBe(2814);
    expect(line.grossMinor).toBe(2814);
    expect(line.quantity).toBe(42);
    expect(line.unitPriceMinor).toBe(67);
    expect(line.description).toContain("Office → Client site");
    expect(line.mileageRateId).toBe("rate-1");
    expect(line.accountId).toBe("acct-travel");
  });

  it("rejects mismatched distance units", () => {
    expect(() =>
      buildMileageClaimLine({
        expenseDate: "2026-11-07",
        distanceValue: 10,
        distanceUnit: "mi",
        rate: {
          id: "rate-1",
          name: "Standard car",
          rateMinorPerUnit: 67,
          accountId: "acct-travel",
          distanceUnit: "km",
          currencyCode: "AUD",
        },
      }),
    ).toThrow(/unit/i);
  });
});

describe("mapExpenseMileageRate", () => {
  it("maps snake_case RPC rows", () => {
    const rate = mapExpenseMileageRate({
      id: "r1",
      name: "Car",
      vehicle_class: "sedan",
      distance_unit: "km",
      rate_minor_per_unit: 70,
      currency_code: "aud",
      account_id: "a1",
      effective_from: "2026-01-01",
      effective_to: null,
      is_active: true,
    });
    expect(rate.currencyCode).toBe("AUD");
    expect(rate.rateMinorPerUnit).toBe(70);
    expect(rate.vehicleClass).toBe("sedan");
  });
});
