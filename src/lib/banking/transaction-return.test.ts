import { describe, expect, it } from "vitest";
import {
  decodeBankTransactionReturnContext,
  encodeBankTransactionReturnContext,
  parseBankTransactionReturnSearch,
} from "./transaction-return";

describe("Bank transaction to journal browsing context", () => {
  const bankAccountId = "11111111-1111-4111-8111-111111111111";

  it("preserves bank, status, search, dates, sorting context and page size", () => {
    const original = {
      bankAccountId,
      status: "matched",
      statusGroup: "posted",
      q: "Bank fees & charges",
      dateFrom: "2026-01-01",
      dateTo: "2026-10-31",
      direction: "out",
      page: 4,
      pageSize: 100,
    };
    expect(
      decodeBankTransactionReturnContext(encodeBankTransactionReturnContext(original)),
    ).toEqual(original);
  });

  it("preserves page zero for filtered transaction workspaces", () => {
    expect(
      decodeBankTransactionReturnContext(
        encodeBankTransactionReturnContext({ page: 0, status: "reconciled" }),
      ),
    ).toEqual({ status: "reconciled", page: 0 });
  });

  it("does not permit returnTo URLs or arbitrary query flags", () => {
    expect(
      decodeBankTransactionReturnContext(
        "returnTo=https%3A%2F%2Fevil.example&admin=true&status=matched",
      ),
    ).toEqual({ status: "matched" });
  });

  it("rejects duplicate return keys without losing independent filters", () => {
    expect(
      decodeBankTransactionReturnContext("status=matched&status=excluded&page=2&q=bank"),
    ).toEqual({ page: 2, q: "bank" });
    expect(
      decodeBankTransactionReturnContext(
        "dateFrom=2026-01-01&dateFrom=2026-02-01&dateTo=2026-03-01",
      ),
    ).toEqual({ dateTo: "2026-03-01" });
    expect(decodeBankTransactionReturnContext("page=2&page=2&status=reconciled")).toEqual({
      status: "reconciled",
    });
  });

  it("rejects control characters in returned search terms without losing filters", () => {
    for (const q of [
      "bank\nfees",
      "bank\rfees",
      "bank\tfees",
      "bank\u0000fees",
      "bank\u007ffees",
    ]) {
      expect(parseBankTransactionReturnSearch({ q, status: "matched" })).toEqual({
        status: "matched",
      });
      expect(
        decodeBankTransactionReturnContext("q=" + encodeURIComponent(q) + "&status=matched"),
      ).toEqual({ status: "matched" });
    }
    expect(parseBankTransactionReturnSearch({ q: "Café bank fees & charges" })).toEqual({
      q: "Café bank fees & charges",
    });
  });

  it("rejects bidi spoofing controls while preserving ordinary multilingual searches", () => {
    for (const q of ["bank\u202efees", "bank\u202afees", "bank\u2066fees", "bank\u2069fees"]) {
      expect(parseBankTransactionReturnSearch({ q, status: "matched" })).toEqual({
        status: "matched",
      });
      expect(
        decodeBankTransactionReturnContext("q=" + encodeURIComponent(q) + "&status=matched"),
      ).toEqual({ status: "matched" });
    }
    expect(
      decodeBankTransactionReturnContext(
        encodeBankTransactionReturnContext({ q: "बैंक शुल्क Café", page: 2 }),
      ),
    ).toEqual({ q: "बैंक शुल्क Café", page: 2 });
  });

  it("rejects C1, directional marks and Unicode separators in return searches", () => {
    for (const codepoint of [0x0085, 0x009f, 0x061c, 0x200e, 0x200f, 0x2028, 0x2029]) {
      const q = "bank" + String.fromCodePoint(codepoint) + "fees";
      expect(parseBankTransactionReturnSearch({ q, page: 2 })).toEqual({ page: 2 });
      expect(decodeBankTransactionReturnContext("q=" + encodeURIComponent(q) + "&page=2")).toEqual({
        page: 2,
      });
    }
    expect(parseBankTransactionReturnSearch({ q: "बैंक शुल्क Café", page: 2 })).toEqual({
      q: "बैंक शुल्क Café",
      page: 2,
    });
  });

  it("normalizes padded banking search and ignores blank-only deep links", () => {
    expect(parseBankTransactionReturnSearch({ q: "   ", page: 2 })).toEqual({ page: 2 });
    expect(
      parseBankTransactionReturnSearch({ q: "  बैंक शुल्क Café  ", status: "matched" }),
    ).toEqual({ q: "बैंक शुल्क Café", status: "matched" });
    expect(decodeBankTransactionReturnContext("q=%20%20bank%20fees%20%20&page=2")).toEqual({
      q: "bank fees",
      page: 2,
    });
    expect(parseBankTransactionReturnSearch({ q: "  " + "x".repeat(120) + "  " }).q).toBe(
      "x".repeat(120),
    );
    expect(parseBankTransactionReturnSearch({ q: "  " + "x".repeat(121) + "  ", page: 2 })).toEqual(
      { page: 2 },
    );
  });

  it("rejects unknown statuses and unsafe IDs", () => {
    expect(
      parseBankTransactionReturnSearch({
        status: "admin",
        statusGroup: "superuser",
        bankAccountId: "../other-tenant",
        direction: "both",
      }),
    ).toEqual({});
  });

  it("rejects excessively long search terms and context tokens", () => {
    expect(parseBankTransactionReturnSearch({ q: "x".repeat(121) })).toEqual({});
    expect(decodeBankTransactionReturnContext("q=" + "x".repeat(2200))).toEqual({});
  });

  it("accepts only known page sizes and caps page numbers", () => {
    expect(parseBankTransactionReturnSearch({ page: "9999999", pageSize: "200" })).toEqual({
      page: 1_000_000,
      pageSize: 200,
    });
    expect(parseBankTransactionReturnSearch({ page: -1, pageSize: 500 })).toEqual({});
  });

  it("rejects noncanonical page numbers without losing other return filters", () => {
    for (const page of ["00", "002", "01", " 2", "2 ", "+2", "2.0", "2e1", "0x10", "-1"]) {
      expect(parseBankTransactionReturnSearch({ page, status: "matched" })).toEqual({
        status: "matched",
      });
    }
    for (const page of ["0", "1", "20", "9999999", 0, 1, 20]) {
      expect(parseBankTransactionReturnSearch({ page }).page).toBe(
        Math.min(Number(page), 1_000_000),
      );
    }
    expect(decodeBankTransactionReturnContext("page=002&status=matched")).toEqual({
      status: "matched",
    });
  });

  it("rejects noncanonical page sizes without losing other list filters", () => {
    for (const pageSize of ["025", "25 ", " 50", "1e2", "100.0", "+200", "0x32"]) {
      expect(parseBankTransactionReturnSearch({ pageSize, status: "matched" })).toEqual({
        status: "matched",
      });
    }
    for (const pageSize of [25, 50, 100, 200, "25", "50", "100", "200"]) {
      expect(parseBankTransactionReturnSearch({ pageSize }).pageSize).toBe(Number(pageSize));
    }
    expect(decodeBankTransactionReturnContext("pageSize=025&status=matched")).toEqual({
      status: "matched",
    });
  });

  it("rejects malformed dates and unsupported input types", () => {
    expect(
      parseBankTransactionReturnSearch({
        dateFrom: "yesterday",
        dateTo: "2026-10-31T00:00:00Z",
        q: ["test"],
      }),
    ).toEqual({});
    expect(decodeBankTransactionReturnContext(null)).toEqual({});
  });

  it("rejects impossible calendar dates without losing valid return filters", () => {
    expect(
      parseBankTransactionReturnSearch({
        status: "matched",
        dateFrom: "2026-02-29",
        dateTo: "2026-04-31",
      }),
    ).toEqual({ status: "matched" });
    expect(
      parseBankTransactionReturnSearch({
        dateFrom: "2024-02-29",
        dateTo: "2026-12-31",
      }),
    ).toEqual({ dateFrom: "2024-02-29", dateTo: "2026-12-31" });
    expect(
      decodeBankTransactionReturnContext("dateFrom=2026-13-01&dateTo=2026-02-30&page=2"),
    ).toEqual({ page: 2 });
  });

  it("preserves valid early-year dates without the Date.UTC 1900 offset", () => {
    expect(
      parseBankTransactionReturnSearch({
        dateFrom: "0099-12-31",
        dateTo: "0100-01-01",
        status: "matched",
      }),
    ).toEqual({ dateFrom: "0099-12-31", dateTo: "0100-01-01", status: "matched" });
    expect(
      parseBankTransactionReturnSearch({
        dateFrom: "0000-02-29",
        dateTo: "0001-02-29",
        page: 1,
      }),
    ).toEqual({ dateFrom: "0000-02-29", page: 1 });
  });

  it("drops an inverted dateTo while preserving start date and unrelated filters", () => {
    const original = { dateFrom: "2026-12-31", dateTo: "2026-01-01", status: "matched", page: 3 };
    const expected = { dateFrom: "2026-12-31", status: "matched", page: 3 };
    expect(parseBankTransactionReturnSearch(original)).toEqual(expected);
    expect(
      decodeBankTransactionReturnContext(encodeBankTransactionReturnContext(original)),
    ).toEqual(expected);
    expect(
      decodeBankTransactionReturnContext(
        "dateFrom=2026-12-31&dateTo=2026-01-01&status=matched&page=3",
      ),
    ).toEqual(expected);
  });

  it("preserves equal start and end dates for single-day banking views", () => {
    expect(
      parseBankTransactionReturnSearch({
        dateFrom: "2026-11-12",
        dateTo: "2026-11-12",
      }),
    ).toEqual({ dateFrom: "2026-11-12", dateTo: "2026-11-12" });
  });

  it("accepts all defined status groups and directions", () => {
    for (const statusGroup of ["unreconciled", "posted", "all"]) {
      expect(parseBankTransactionReturnSearch({ statusGroup }).statusGroup).toBe(statusGroup);
    }
    expect(parseBankTransactionReturnSearch({ direction: "in" })).toEqual({ direction: "in" });
    expect(parseBankTransactionReturnSearch({ direction: "out" })).toEqual({ direction: "out" });
  });
});
