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
  it("persists generic explorer state for saved views with strict bounds", () => {
    expect(
      parseReportSearch({
        exploreMode: "grid",
        exploreColumns: "3,1,3,999,-1",
        exploreQuery: "  customer  ",
        exploreField: "0",
        exploreMatch: "  invoice ",
        exploreGroup: 2,
        exploreSort: "1",
        exploreDirection: "desc",
        explorePage: "2",
        explorePageSize: "100",
      }),
    ).toMatchObject({
      exploreMode: "grid",
      exploreColumns: "3,1",
      exploreQuery: "customer",
      exploreField: 0,
      exploreMatch: "invoice",
      exploreGroup: 2,
      exploreSort: 1,
      exploreDirection: "desc",
      explorePage: 2,
      explorePageSize: 100,
    });
    expect(
      parseReportSearch({
        exploreMode: "bogus",
        exploreColumns: "bad",
        exploreField: -1,
        exploreGroup: 888,
        explorePageSize: 4,
        explorePage: "1",
      }),
    ).toEqual({});
  });

  it("omits default values", () => {
    expect(parseReportSearch({ columns: "none" })).toEqual({});
  });
});
