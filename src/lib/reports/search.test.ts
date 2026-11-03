import { describe, expect, it } from "vitest";
import { parseReportSearch } from "./search";

describe("report URL search params (RP-05)", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("keeps valid values and drops junk", () => {
    expect(
      parseReportSearch({
        from: "2026-01-01",
        to: "2026-03-31",
        account: id,
        columns: "month",
        page: "2",
      }),
    ).toEqual({ from: "2026-01-01", to: "2026-03-31", account: id, columns: "month", page: 2 });
    expect(
      parseReportSearch({
        from: "yesterday",
        account: "x",
        columns: "weird",
        page: -1,
        actor: "nope",
      }),
    ).toEqual({});
  });
  it("persists searchable report analysis filters without accepting unknown or oversized parameters", () => {
    expect(parseReportSearch({ term: "  Acme Trading  ", nonZero: true })).toEqual({
      term: "Acme Trading",
      nonZero: true,
    });
    expect(parseReportSearch({ term: "", nonZero: "yes" })).toEqual({});
    expect(parseReportSearch({ term: "a".repeat(300) }).term).toHaveLength(120);
  });
  it("validates account transaction columns, filtering and page-size URL state", () => {
    expect(
      parseReportSearch({
        txnColumns: "description,date,balance,description,bogus",
        txnSource: "sales_invoice",
        txnFlow: "credit",
        txnSort: "date_desc",
        txnQuery: "  Acme  ",
        txnPageSize: "50",
        txnMin: "100.00",
        txnMax: "250.50",
      }),
    ).toMatchObject({
      txnColumns: "description,date,balance",
      txnSource: "sales_invoice",
      txnFlow: "credit",
      txnSort: "date_desc",
      txnQuery: "Acme",
      txnPageSize: 50,
      txnMin: "100.00",
      txnMax: "250.50",
    });
    expect(
      parseReportSearch({
        txnColumns: "bogus",
        txnSource: "bad-value",
        txnFlow: "other",
        txnSort: "invalid",
        txnPageSize: 999,
      }),
    ).toEqual({});
  });
  it("omits default values", () => {
    expect(parseReportSearch({ columns: "none" })).toEqual({});
  });
});
