import { describe, expect, it } from "vitest";
import { budgetCsvHeaders, budgetToCsvRows, parseBudgetCsv } from "./budget-csv";
import { toCsv } from "@/lib/reports/csv";

describe("budget CSV export total integrity", () => {
  it("round-trips exported budgets with multiline and quoted account names", () => {
    const months=Array.from({length:12},(_,index)=>
      "2026-"+String(index+1).padStart(2,"0")+"-01",
    );
    const accounts=[
      {id:"income",code:"400",name:'Retail,\n"North" Division'},
      {id:"expense",code:"500",name:"Office rent"},
    ];
    const source=new Map<string,number[]>([
      ["income",Array.from({length:12},(_,i)=>10000+i)],
      ["expense",Array.from({length:12},(_,i)=>5000+i)],
    ]);
    const text=toCsv({
      company:"Example\nGroup",report:"Annual budget",
      period:"FY 2026",currency:"USD",generatedAt:"2026-11-06T00:00:00.000Z",
    },budgetCsvHeaders(months),budgetToCsvRows(accounts,source,"USD"));
    const parsed=parseBudgetCsv(text,accounts,"USD",months);
    expect(parsed.issues).toEqual([]);
    expect(parsed.values.get("income")).toEqual(source.get("income"));
    expect(parsed.values.get("expense")).toEqual(source.get("expense"));
  });

  it("rejects malformed exported quotes rather than silently misaligning months", () => {
    const months=Array.from({length:12},(_,index)=>
      "2026-"+String(index+1).padStart(2,"0")+"-01",
    );
    const accounts=[{id:"income",code:"400",name:"Sales"}];
    const text=toCsv({
      company:"Example",report:"Budget",period:"FY",currency:"USD",
    },budgetCsvHeaders(months),budgetToCsvRows(accounts,
      new Map([["income",Array(12).fill(100)]]),"USD"));
    expect(() => parseBudgetCsv(text+'\r\n"400","Incomplete',accounts,"USD",months))
      .toThrow(/Unterminated quoted CSV field/);
  });


  const accounts = [{ id: "income", code: "400", name: "Sales" }];

  it("exports an exact annual total from individual monthly amounts", () => {
    const lines = new Map([["income", [1234, -34, 8900]]]);
    const output = budgetToCsvRows(accounts, lines, "USD");
    expect(output).toHaveLength(1);
    expect(output[0]?.at(-1)).toBe("101.00");
    expect(output[0]?.[2]).toBe("12.34");
  });

  it("rejects individually safe values whose annual total is outside safe precision", () => {
    const lines = new Map([["income", [Number.MAX_SAFE_INTEGER, 1]]]);
    expect(() => budgetToCsvRows(accounts, lines, "USD"))
      .toThrow(/safe minor-unit/);
  });

  it("rejects invalid fractional or unsafe amounts before exporting any values", () => {
    for (const invalid of [1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        budgetToCsvRows(accounts, new Map([["income", [invalid]]]), "USD"),
      ).toThrow(/safe integer/);
    }
  });

  it("does not mutate the source row amounts while calculating a CSV total", () => {
    const values = [10, 20, 30];
    budgetToCsvRows(accounts, new Map([["income", values]]), "USD");
    expect(values).toEqual([10, 20, 30]);
  });
});
