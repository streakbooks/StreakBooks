import { describe, expect, it } from "vitest";
import { filterSavedTaxReturns, isStaleTaxPreview } from "./tax-return-view";

const rows = [
  {id:"one",period_start:"2026-01-01",period_end:"2026-03-31",basis:"accrual",status:"draft",settlement_journal_id:null},
  {id:"two",period_start:"2026-04-01",period_end:"2026-06-30",basis:"cash",status:"filed",settlement_journal_id:null},
  {id:"three",period_start:"2026-07-01",period_end:"2026-09-30",basis:"accrual",status:"filed",settlement_journal_id:"journal-1"},
];

describe("tax return list filtering", () => {
  it("filters by selected status, including settlement", () => {
    expect(filterSavedTaxReturns(rows,"","draft").map(r=>r.id)).toEqual(["one"]);
    expect(filterSavedTaxReturns(rows,"","filed").map(r=>r.id)).toEqual(["two","three"]);
    expect(filterSavedTaxReturns(rows,"","settled").map(r=>r.id)).toEqual(["three"]);
  });
  it("searches dates, basis and status without changing source order", () => {
    expect(filterSavedTaxReturns(rows,"2026-04","all").map(r=>r.id)).toEqual(["two"]);
    expect(filterSavedTaxReturns(rows," CASH ","all").map(r=>r.id)).toEqual(["two"]);
    expect(filterSavedTaxReturns(rows,"accrual","all").map(r=>r.id)).toEqual(["one","three"]);
    expect(filterSavedTaxReturns(rows,"missing","all")).toEqual([]);
    expect(rows).toHaveLength(3);
  });
});

describe("tax return preview selection guard", () => {
  const shown = {start:"2026-01-01",end:"2026-03-31",basis:"accrual"};
  it("marks a preview stale when any selection changes", () => {
    expect(isStaleTaxPreview(shown,shown)).toBe(false);
    expect(isStaleTaxPreview(shown,{...shown,end:"2026-04-30"})).toBe(true);
    expect(isStaleTaxPreview(shown,{...shown,start:"2026-02-01"})).toBe(true);
    expect(isStaleTaxPreview(shown,{...shown,basis:"cash"})).toBe(true);
    expect(isStaleTaxPreview(null,shown)).toBe(false);
  });
});
