import { describe, expect, it } from "vitest";
import { parseFilesListSearch } from "./files-navigation";

describe("Files workspace native browsing state", () => {
  const folder = "a5f54317-b430-4cd5-a59e-5b15c3ff7ec0";
  const file = "11cd7a39-7692-44ac-8c16-27ee1bd6fcef";

  it("fails closed for malformed runtime search containers", () => {
    for (const raw of [null, undefined, "q=spoofed", 7, true, ["q"]]) {
      expect(parseFilesListSearch(raw as unknown as Record<string, unknown>)).toEqual({});
    }
  });

  it("restores a complete bookmarked file view", () => {
    expect(parseFilesListSearch({
      folder, file, q: "receipts & invoices", type: "purchase_bill",
      sort: "oldest", view: "all", page: "3",
    })).toEqual({
      folder, file, q: "receipts & invoices", type: "purchase_bill",
      sort: "oldest", view: "all", page: 3,
    });
  });

  it("retains search and sorting through folder navigation", () => {
    const context = parseFilesListSearch({
      q: "pdf", type: "company", sort: "largest", page: 7, view: "all",
    });
    expect(parseFilesListSearch({
      ...context, folder, page: 0,
    })).toEqual({
      q: "pdf", type: "company", sort: "largest", page: 0, view: "all", folder,
    });
  });

  it("accepts all existing supported view states", () => {
    for (const view of ["all", "to-file", "review"]) {
      expect(parseFilesListSearch({ view })).toEqual({ view });
    }
  });

  it("rejects unsafe destinations, arbitrary flags and unknown types", () => {
    expect(parseFilesListSearch({
      redirect: "https://evil.example", admin: true,
      folder: "../outside", file: "x", type: "private",
      sort: "random", view: "../settings",
    })).toEqual({});
  });

  it("rejects excessively long terms and bounds pagination", () => {
    expect(parseFilesListSearch({ q: "x".repeat(121), page: -3 })).toEqual({});
    expect(parseFilesListSearch({ page: "9999999" })).toEqual({ page: 1_000_000 });
    expect(parseFilesListSearch({ page: 1.3 })).toEqual({});
  });

  it("normalizes Files search while retaining independent browsing filters", () => {
    expect(parseFilesListSearch({ q: "  Tax & books  ", sort: "name", page: 2 }))
      .toEqual({ q: "Tax & books", sort: "name", page: 2 });
    expect(parseFilesListSearch({ q: "   ", sort: "oldest" }))
      .toEqual({ sort: "oldest" });
    expect(parseFilesListSearch({ q: " ".repeat(10) + "x".repeat(120) + " " }))
      .toEqual({ q: "x".repeat(120) });
    expect(parseFilesListSearch({ q: "x".repeat(121), view: "review" }))
      .toEqual({ view: "review" });
    for (const bad of ["a\nb", "a\tb", "a\u202eb", "a\u200bb", "a\u2060b"]) {
      expect(parseFilesListSearch({ q: bad, sort: "largest" }))
        .toEqual({ sort: "largest" });
    }
    expect(parseFilesListSearch({ q: "  फ़ाइल 文件  " }))
      .toEqual({ q: "फ़ाइल 文件" });
  });

  it("rejects noncanonical pagination while retaining independent filters", () => {
    for (const page of ["00", "03", " 3", "+3", "1e2", "0x10", "0000000", "10000000"]) {
      expect(parseFilesListSearch({ page, sort: "name" })).toEqual({ sort: "name" });
    }
    expect(parseFilesListSearch({ page: "0" })).toEqual({ page: 0 });
    expect(parseFilesListSearch({ page: "9999999" })).toEqual({ page: 1_000_000 });
  });

  it("accepts only known file record types", () => {
    for (const type of ["all", "company", "contact", "sales_invoice", "journal"]) {
      expect(parseFilesListSearch({ type })).toEqual({ type });
    }
    expect(parseFilesListSearch({ type: ["company"] })).toEqual({});
  });

  it("ignores prototype-inherited query values without losing own fields", () => {
    const inherited = Object.create({ folder, file, q: "spoofed", type: "company", sort: "largest", view: "review", page: "8" }) as Record<string, unknown>;
    expect(parseFilesListSearch(inherited)).toEqual({});
    inherited["q"] = "  actual search  ";
    inherited["page"] = "2";
    expect(parseFilesListSearch(inherited)).toEqual({ q: "actual search", page: 2 });
    const nullPrototype = Object.assign(Object.create(null) as Record<string, unknown>, { folder, sort: "name" });
    expect(parseFilesListSearch(nullPrototype)).toEqual({ folder, sort: "name" });
  });

  it("preserves filter characters safely through a standard URL", () => {
    const query = "Tax & books + FY/26";
    const params = new URLSearchParams({ q: query, sort: "name", view: "to-file" });
    expect(parseFilesListSearch(Object.fromEntries(params))).toEqual({
      q: query, sort: "name", view: "to-file",
    });
  });
});
