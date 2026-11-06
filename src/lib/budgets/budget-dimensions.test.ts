import { describe, expect, it } from "vitest";
import { allocationAnnualTotals, validateBudgetAllocations } from "./budget-dimensions";

const months = Array.from({ length: 12 }, (_, i) =>
  `2026-${String(i + 1).padStart(2, "0")}-01`,
);
const base = [
  { accountId: "sales", month: months[0]!, amountMinor: 10_000 },
  { accountId: "sales", month: months[1]!, amountMinor: 8_000 },
];
const a = { optionId: "north", accountId: "sales", month: months[0]!, amountMinor: 6_000 };
const b = { optionId: "south", accountId: "sales", month: months[0]!, amountMinor: 4_000 };

describe("dimension budget allocation validation", () => {
  it("allows two options to split exactly one main-budget cell", () => {
    const result = validateBudgetAllocations({ rows: [a, b], base, months });
    expect(result.remaining.get("sales|2026-01-01")).toBe(0);
    expect(result.remaining.get("sales|2026-02-01")).toBe(8000);
  });
  it("rejects allocations exceeding the base budget", () => {
    expect(() =>
      validateBudgetAllocations({
        rows: [a, { ...b, amountMinor: 4_001 }],
        base,
        months,
      }),
    ).toThrow(/exceed/);
  });
  it("rejects allocation to an unbudgeted account and wrong fiscal month", () => {
    expect(() => validateBudgetAllocations({
      rows: [{ ...a, accountId: "rent" }], base, months,
    })).toThrow(/exceed/);
    expect(() => validateBudgetAllocations({
      rows: [{ ...a, month: "2027-01-01" }], base, months,
    })).toThrow(/financial month/);
  });
  it("rejects negative, fractional and unsafe minor units", () => {
    for (const value of [-1, 10.5, Number.MAX_SAFE_INTEGER]) {
      expect(() => validateBudgetAllocations({
        rows: [{ ...a, amountMinor: value }], base, months,
      })).toThrow();
    }
  });
  it("prevents duplicate option/account/month cells", () => {
    expect(() => validateBudgetAllocations({
      rows: [a, a], base, months,
    })).toThrow(/Duplicate/);
  });
  it("drops zero lines but retains unallocated amounts", () => {
    const result = validateBudgetAllocations({
      rows: [{ ...a, amountMinor: 0 }], base, months,
    });
    expect(result.rows).toEqual([]);
    expect(result.remaining.get("sales|2026-01-01")).toBe(10_000);
  });
  it("correctly sums across months without mixing separate options", () => {
    const totals = allocationAnnualTotals([
      a, b, { ...a, month: months[1]!, amountMinor: 1_000 },
    ]);
    expect(totals.get("north|sales")).toBe(7_000);
    expect(totals.get("south|sales")).toBe(4_000);
  });
  it("rejects unsafe annual subtotal overflow", () => {
    expect(() => allocationAnnualTotals([
      { ...a, amountMinor: Number.MAX_SAFE_INTEGER },
      { ...a, month: months[1]!, amountMinor: 1 },
    ])).toThrow(/supported range/);
  });
});
