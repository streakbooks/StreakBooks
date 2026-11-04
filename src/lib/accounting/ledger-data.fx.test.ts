import { describe, expect, it } from "vitest";
import { rawLineToPosted } from "./ledger-data";

const fixture = (debit: number | string, rate: number | string | null, currency = "USD") => ({
  id: "line-1",
  line_no: 1,
  account_id: "account-1",
  debit_minor: debit,
  credit_minor: 0,
  description: "Synthetic FX fixture",
  journals: {
    id: "journal-1",
    journal_number: 1,
    journal_date: "2026-11-04",
    status: "posted",
    memo: "Synthetic",
    source_type: "manual",
    source_id: null,
    currency_code: currency,
    fx_rate_to_base: rate,
  },
  accounts: {
    code: "1100",
    name: "Bank",
    account_type: "asset",
    subtype: null,
    account_kind: null,
    system_key: null,
    fs_line: null,
    cash_flow_class: null,
  },
});

describe("historical ledger FX provenance", () => {
  it("does not produce a false 1:1 base-currency balance for missing USD rate", () => {
    expect(() => rawLineToPosted(fixture(10_000, null) as never, "GBP")).toThrow(
      /Missing posted exchange-rate snapshot/,
    );
  });

  it("converts valid posted FX snapshots exactly with documented currency decimals", () => {
    const result = rawLineToPosted(fixture("10000", "0.8") as never, "GBP");
    expect(result.debit_minor).toBe(8000n);
    expect(result.credit_minor).toBe(0n);
    expect(result.currency_code).toBe("GBP");
  });

  it("allows a missing rate for an explicitly base-currency journal", () => {
    expect(rawLineToPosted(fixture(1234, null, "GBP") as never, "GBP").debit_minor).toBe(1234n);
  });

  it("rejects unsafe JSON numeric minor units before reinterpreting them as exact", () => {
    expect(() => rawLineToPosted(fixture(Number.MAX_SAFE_INTEGER + 1, "1") as never, "GBP")).toThrow(
      /unsafe integer/,
    );
    expect(() => rawLineToPosted(fixture("12.50", "1") as never, "GBP")).toThrow(
      /not an integer/,
    );
  });

  it("keeps exact very large source amounts when supplied as integer text", () => {
    const result = rawLineToPosted(fixture("9007199254740993", null, "GBP") as never, "GBP");
    expect(result.debit_minor).toBe(9007199254740993n);
  });
});
