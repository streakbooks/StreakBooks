import { describe, expect, it } from "vitest";
import {
  decodeInvoiceReturnContext,
  encodeInvoiceReturnContext,
  invoiceListStateFromSearch,
  parseInvoiceListSearch,
} from "./invoice-list-navigation";

describe("Sales invoice browsing state", () => {
  it("normalises missing URL fields to existing list defaults", () => {
    expect(invoiceListStateFromSearch(parseInvoiceListSearch({}))).toEqual({
      q: "", status: "all", from: "", to: "", sort: "invoice_date",
      dir: "desc", page: 0, pageSize: 50,
    });
  });

  it("round-trips full search, filters, sorting and pagination", () => {
    const input = {
      q: "A&B Consulting", status: "partly_paid", from: "2026-01-01",
      to: "2026-10-31", sort: "due_date", dir: "asc", page: 3,
      pageSize: 100, overdue: true,
    };
    const encoded = encodeInvoiceReturnContext(parseInvoiceListSearch(input));
    expect(decodeInvoiceReturnContext(encoded)).toEqual(input);
  });

  it("rejects unexpected query fields and external return destinations", () => {
    const decoded = decodeInvoiceReturnContext(
      "q=design&redirect=https%3A%2F%2Fevil.example&admin=true",
    );
    expect(decoded).toEqual({ q: "design" });
    expect(encodeInvoiceReturnContext(decoded)).toBe("q=design");
  });

  it("rejects malformed status, sort, direction and dates", () => {
    expect(parseInvoiceListSearch({
      status: "admin", sort: "created_by", dir: "wrong",
      from: "yesterday", to: "2026-99-99extra",
    })).toEqual({});
  });

  it("limits record pagination and accepts supported page sizes", () => {
    expect(parseInvoiceListSearch({ page: "10000000", pageSize: 200 })).toEqual({
      pageSize: 200,
    });
    expect(parseInvoiceListSearch({ page: "150", pageSize: "25" })).toEqual({
      page: 150, pageSize: 25,
    });
    expect(parseInvoiceListSearch({ page: -10, pageSize: 17 })).toEqual({});
  });

  it("accepts deep link booleans without treating false as true", () => {
    expect(parseInvoiceListSearch({ overdue: "true" })).toEqual({ overdue: true });
    expect(parseInvoiceListSearch({ overdue: "false" })).toEqual({});
    expect(parseInvoiceListSearch({ overdue: true })).toEqual({ overdue: true });
  });

  it("rejects oversized return tokens and search strings", () => {
    expect(decodeInvoiceReturnContext("q=" + "x".repeat(3000))).toEqual({});
    expect(parseInvoiceListSearch({ q: "x".repeat(101) })).toEqual({});
  });

  it("handles invalid or absent context without unsafe navigation", () => {
    expect(decodeInvoiceReturnContext(null)).toEqual({});
    expect(decodeInvoiceReturnContext(undefined)).toEqual({});
    expect(decodeInvoiceReturnContext({ url: "/elsewhere" })).toEqual({});
  });

  it("does not accidentally include overdue as a ListState control", () => {
    const list = invoiceListStateFromSearch({ status: "paid", overdue: true, page: 2 });
    expect(list.status).toBe("paid");
    expect(list.page).toBe(2);
    expect("overdue" in list).toBe(false);
  });
});
