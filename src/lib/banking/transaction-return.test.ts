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

  it("accepts all defined status groups and directions", () => {
    for (const statusGroup of ["unreconciled", "posted", "all"]) {
      expect(parseBankTransactionReturnSearch({ statusGroup }).statusGroup).toBe(statusGroup);
    }
    expect(parseBankTransactionReturnSearch({ direction: "in" })).toEqual({ direction: "in" });
    expect(parseBankTransactionReturnSearch({ direction: "out" })).toEqual({ direction: "out" });
  });
});
