import { describe, expect, it } from "vitest";
import { summarizeBudgetGrid } from "./budget-grid-summary";

const rows = [
  {id:"sales",kind:"income" as const,months:[1000,2000,3000]},
  {id:"other",kind:"income" as const,months:[500,0,400]},
  {id:"rent",kind:"expense" as const,months:[300,500,600]},
];

describe("budget editor precision-safe totals", () => {
  it("calculates monthly, annual and net totals from all accounts", () => {
    const result = summarizeBudgetGrid(rows,3);
    expect(result.incomeMonths).toEqual([1500,2000,3400]);
    expect(result.expenseMonths).toEqual([300,500,600]);
    expect(result.netMonths).toEqual([1200,1500,2800]);
    expect(result.incomeYear).toBe(6900);
    expect(result.expenseYear).toBe(1400);
    expect(result.netYear).toBe(5500);
  });
  it("handles negative adjustments without altering original data", () => {
    const original=JSON.stringify(rows);
    const result=summarizeBudgetGrid([
      {id:"refunds",kind:"income",months:[-100,0,-50]},
      {id:"rent",kind:"expense",months:[500,-100,200]},
    ],3);
    expect(result.netMonths).toEqual([-600,100,-250]);
    expect(result.netYear).toBe(-750);
    expect(JSON.stringify(rows)).toBe(original);
  });
  it("prevents individually safe monthly cells from overflowing a row annual total", () => {
    expect(()=>summarizeBudgetGrid([
      {id:"sales",kind:"income",months:[Number.MAX_SAFE_INTEGER,1]},
    ],2)).toThrow(/safe minor-unit/);
  });
  it("rejects a section total overflow across two otherwise safe account rows", () => {
    const half=5_000_000_000_000_000;
    expect(()=>summarizeBudgetGrid([
      {id:"a",kind:"income",months:[half]},
      {id:"b",kind:"income",months:[half]},
    ],1)).toThrow(/safe minor-unit/);
  });
  it("rejects an unsafe net profit even when income and expense totals are individually safe", () => {
    expect(()=>summarizeBudgetGrid([
      {id:"a",kind:"income",months:[Number.MAX_SAFE_INTEGER]},
      {id:"b",kind:"expense",months:[-1]},
    ],1)).toThrow(/safe minor-unit/);
  });
  it("rejects a fractional, NaN or unsafe cell instead of rounding the preview", () => {
    for(const amount of [0.25, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]){
      expect(()=>summarizeBudgetGrid([
        {id:"a",kind:"income",months:[amount]},
      ],1)).toThrow(/safe integer/);
    }
  });
  it("rejects duplicate account rows and mismatched fiscal period counts", () => {
    expect(()=>summarizeBudgetGrid([rows[0]!,rows[0]!],3)).toThrow(/duplicate/);
    expect(()=>summarizeBudgetGrid([rows[0]!],12)).toThrow(/one value per fiscal/);
  });
  it("uses zero in preview for a temporarily invalid editor cell without saving it", () => {
    const result=summarizeBudgetGrid([
      {id:"sales",kind:"income",months:[100,null,500]},
    ],3);
    expect(result.incomeYear).toBe(600);
  });
});
