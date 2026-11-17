import { describe, expect, it } from "vitest";
import {
  buildPerDiemClaimLine,
  calculatePerDiemNetMinor,
  inclusiveTravelDays,
  isPerDiemRateEffectiveOn,
  mapExpensePerDiemRate,
} from "./travel";

describe("inclusiveTravelDays", () => {
  it("counts inclusive calendar days", () => {
    expect(inclusiveTravelDays("2026-11-07", "2026-11-07")).toBe(1);
    expect(inclusiveTravelDays("2026-11-07", "2026-11-09")).toBe(3);
  });

  it("rejects inverted ranges", () => {
    expect(() => inclusiveTravelDays("2026-11-09", "2026-11-07")).toThrow(/end date/i);
  });
});

describe("calculatePerDiemNetMinor", () => {
  it("rounds days × rate", () => {
    expect(calculatePerDiemNetMinor(3, 8500)).toBe(25500);
  });
});

describe("isPerDiemRateEffectiveOn", () => {
  it("checks active window", () => {
    const rate = {
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-12-31",
      isActive: true,
    };
    expect(isPerDiemRateEffectiveOn(rate, "2026-06-01")).toBe(true);
    expect(isPerDiemRateEffectiveOn({ ...rate, isActive: false }, "2026-06-01")).toBe(false);
  });
});

describe("buildPerDiemClaimLine", () => {
  it("builds a reimbursable per diem line", () => {
    const line = buildPerDiemClaimLine({
      expenseDate: "2026-11-07",
      travelStartDate: "2026-11-07",
      travelEndDate: "2026-11-09",
      rate: {
        id: "pd1",
        name: "Domestic overnight",
        locationLabel: "Sydney",
        rateMinorPerDay: 12000,
        accountId: "acct-travel",
        currencyCode: "AUD",
      },
    });
    expect(line.isPerDiem).toBe(true);
    expect(line.travelDayCount).toBe(3);
    expect(line.netMinor).toBe(36000);
    expect(line.description).toContain("Sydney");
    expect(line.perDiemRateId).toBe("pd1");
  });
});

describe("mapExpensePerDiemRate", () => {
  it("maps snake_case RPC rows", () => {
    const rate = mapExpensePerDiemRate({
      id: "r1",
      name: "Intl",
      location_label: "Singapore",
      rate_minor_per_day: 15000,
      currency_code: "sgd",
      account_id: "a1",
      effective_from: "2026-01-01",
      effective_to: null,
      is_active: true,
    });
    expect(rate.currencyCode).toBe("SGD");
    expect(rate.locationLabel).toBe("Singapore");
  });
});
