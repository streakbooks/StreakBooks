import { describe, expect, it } from "vitest";
import type { PeriodRow } from "./accounting.functions";
import {
  assertPeriodStillLocked,
  filterFinancialYears,
  financialYearSummary,
  financialYearsCsv,
  validPeriodDeepLink,
} from "./financial-years-review";

const rows: PeriodRow[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "=FY 2025",
    start_date: "2025-01-01",
    end_date: "2025-12-31",
    status: "locked",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "FY 2026",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    status: "open",
  },
];

describe("financial year catalogue", () => {
  it("counts independent open and locked periods", () => {
    expect(financialYearSummary(rows)).toEqual({ total: 2, open: 1, locked: 1 });
  });

  it("filters dates, names, and status without hiding data from the export", () => {
    expect(filterFinancialYears(rows, "open", "")).toEqual([rows[1]]);
    expect(filterFinancialYears(rows, "all", "2025-12")).toEqual([rows[0]]);
    expect(filterFinancialYears(rows, "locked", "2026")).toEqual([]);
    const csv = financialYearsCsv(rows);
    expect(csv).toContain("'=FY 2025");
    expect(csv).toContain("2026-12-31,open");
  });

  it("requires an unchanged locked period before unlocking", () => {
    expect(() => assertPeriodStillLocked(rows[0]!, rows[0]!)).not.toThrow();
    expect(() => assertPeriodStillLocked(rows[0]!, undefined)).toThrow("period changed");
    expect(() => assertPeriodStillLocked(rows[0]!, { ...rows[0]!, status: "open" })).toThrow();
    expect(() =>
      assertPeriodStillLocked(rows[0]!, { ...rows[0]!, end_date: "2026-01-31" }),
    ).toThrow();
  });

  it("accepts only a valid UUID deep link", () => {
    expect(validPeriodDeepLink(rows[0]!.id)).toBe(rows[0]!.id);
    expect(validPeriodDeepLink("../../../admin")).toBeUndefined();
    expect(validPeriodDeepLink(10)).toBeUndefined();
  });
});
