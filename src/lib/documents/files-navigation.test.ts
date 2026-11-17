import { describe, expect, it } from "vitest";
import { parseFilesListSearch } from "./files-navigation";

describe("Files workspace native browsing state", () => {
  const folder = "a5f54317-b430-4cd5-a59e-5b15c3ff7ec0";
  const file = "11cd7a39-7692-44ac-8c16-27ee1bd6fcef";

  it("restores a complete bookmarked file view", () => {
    expect(
      parseFilesListSearch({
        folder,
        file,
        q: "receipts & invoices",
        type: "purchase_bill",
        sort: "oldest",
        view: "all",
        page: "3",
      }),
    ).toEqual({
      folder,
      file,
      q: "receipts & invoices",
      type: "purchase_bill",
      sort: "oldest",
      view: "all",
      page: 3,
    });
  });

  it("retains search and sorting through folder navigation", () => {
    const context = parseFilesListSearch({
      q: "pdf",
      type: "company",
      sort: "largest",
      page: 7,
      view: "all",
    });
    expect(
      parseFilesListSearch({
        ...context,
        folder,
        page: 0,
      }),
    ).toEqual({
      q: "pdf",
      type: "company",
      sort: "largest",
      page: 0,
      view: "all",
      folder,
    });
  });

  it("accepts all existing supported view states", () => {
    for (const view of ["all", "to-file", "review"]) {
      expect(parseFilesListSearch({ view })).toEqual({ view });
    }
  });

  it("rejects unsafe destinations, arbitrary flags and unknown types", () => {
    expect(
      parseFilesListSearch({
        redirect: "https://evil.example",
        admin: true,
        folder: "../outside",
        file: "x",
        type: "private",
        sort: "random",
        view: "../settings",
      }),
    ).toEqual({});
  });

  it("rejects excessively long terms and bounds pagination", () => {
    expect(parseFilesListSearch({ q: "x".repeat(121), page: -3 })).toEqual({});
    expect(parseFilesListSearch({ page: "9999999" })).toEqual({ page: 1_000_000 });
    expect(parseFilesListSearch({ page: 1.3 })).toEqual({});
  });

  it("accepts only known file record types", () => {
    for (const type of ["all", "company", "contact", "sales_invoice", "journal"]) {
      expect(parseFilesListSearch({ type })).toEqual({ type });
    }
    expect(parseFilesListSearch({ type: ["company"] })).toEqual({});
  });

  it("preserves filter characters safely through a standard URL", () => {
    const query = "Tax & books + FY/26";
    const params = new URLSearchParams({ q: query, sort: "name", view: "to-file" });
    expect(parseFilesListSearch(Object.fromEntries(params))).toEqual({
      q: query,
      sort: "name",
      view: "to-file",
    });
  });
});
