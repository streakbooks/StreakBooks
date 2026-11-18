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

  it("persists selected reporting accounts and grouping without accepting cross-shape input", () => {
    const second = "22222222-2222-4222-8222-222222222222";
    expect(
      parseReportSearch({
        accountIds: `${id},${second},${id}`,
        accountScope: "transactions",
        accountGroup: "type",
      }),
    ).toEqual({
      accountIds: `${id},${second}`,
      accountScope: "transactions",
      accountGroup: "type",
    });
    expect(
      parseReportSearch({ accountIds: `${id},bad`, accountScope: "invalid", accountGroup: "none" }),
    ).toEqual({});
    // The full URL length bound is enforced before de-duplicating identifiers.
    expect(
      parseReportSearch({ accountIds: Array.from({ length: 101 }, () => id).join(",") }),
    ).toEqual({});
    expect(
      parseReportSearch({ accountIds: Array.from({ length: 100 }, () => id).join(",") }),
    ).toEqual({ accountIds: id });
    expect(parseReportSearch({ accountIds: "x".repeat(4000) })).toEqual({});
  });

  it("keeps a safe Reports Centre return token on report detail and filter edits", () => {
    expect(parseReportSearch({
      centre: "tab=standard&query=aged+receivables&from=2026-01-01",
    }).centre).toBe("tab=standard&from=2026-01-01&query=aged+receivables");
  });

  it("rejects missing, oversized and non-string Reports Centre origin tokens", () => {
    expect(parseReportSearch({ centre: "returnTo=https%3A%2F%2Fevil.example" })).toEqual({});
    expect(parseReportSearch({ centre: ["tab=standard"] })).toEqual({});
    expect(parseReportSearch({ centre: "tab=standard&query=" + "x".repeat(2200) })).toEqual({});
  });

  it("omits default values", () => {
    expect(parseReportSearch({ columns: "none" })).toEqual({});
  });
});
