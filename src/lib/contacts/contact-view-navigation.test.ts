import { describe, expect, it } from "vitest";
import {
  CONTACT_DIRECTORY_VIEWS,
  decodeContactsReturnContext,
  encodeContactsReturnContext,
  parseContactDirectoryView,
  parseContactsDirectorySearch,
} from "./contact-view-navigation";

describe("Contact directory return navigation", () => {
  it("accepts every supported role and activity view", () => {
    for (const view of CONTACT_DIRECTORY_VIEWS) {
      expect(parseContactDirectoryView(view)).toBe(view);
    }
  });

  it("rejects external URL and path return values", () => {
    expect(parseContactDirectoryView("https://example.com/redirect")).toBeUndefined();
    expect(parseContactDirectoryView("/contacts?view=customers")).toBeUndefined();
    expect(parseContactDirectoryView("../settings")).toBeUndefined();
  });

  it("rejects unsupported query values and types", () => {
    for (const value of ["administrator", "Customers", "", null, undefined, ["customers"]]) {
      expect(parseContactDirectoryView(value)).toBeUndefined();
    }
    expect(parseContactDirectoryView({ view: "customers" })).toBeUndefined();
  });

  it("retains all permitted search, sorting and pagination fields", () => {
    expect(
      parseContactsDirectorySearch({
        view: "suppliers",
        q: "paper & pens",
        sort: "name_desc",
        page: "4",
      }),
    ).toEqual({ view: "suppliers", q: "paper & pens", sort: "name_desc", page: 4 });
  });

  it("allows only known sortable directory fields", () => {
    expect(parseContactsDirectorySearch({ sort: "credit_desc" }).sort).toBe("credit_desc");
    expect(parseContactsDirectorySearch({ sort: "updated" }).sort).toBe("updated");
    expect(parseContactsDirectorySearch({ sort: "sql" })).toEqual({});
  });

  it("round trips list context through a safe URL parameter", () => {
    const original = {
      view: "archived",
      q: "consulting & audit",
      sort: "created_desc",
      page: 6,
    };
    expect(decodeContactsReturnContext(encodeContactsReturnContext(original))).toEqual(original);
  });

  it("drops unsafe return URLs and unexpected query parameters", () => {
    expect(
      decodeContactsReturnContext(
        "redirect=https%3A%2F%2Fevil.example&view=customers&q=abc&admin=true",
      ),
    ).toEqual({ view: "customers", q: "abc" });
  });

  it("rejects excessively long queries and unbounded return context", () => {
    expect(parseContactsDirectorySearch({ q: "x".repeat(101), page: -1 })).toEqual({});
    expect(decodeContactsReturnContext("q=" + "x".repeat(2200))).toEqual({});
  });

  it("bounds page numbers and validates all supported views", () => {
    expect(parseContactsDirectorySearch({ page: "9999999" })).toEqual({ page: 1_000_000 });
    for (const view of CONTACT_DIRECTORY_VIEWS) {
      expect(decodeContactsReturnContext(encodeContactsReturnContext({ view }))).toEqual({
        view,
      });
    }
  });
});
