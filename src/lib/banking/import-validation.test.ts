import { describe, expect, it } from "vitest";
import { validateBankImportRows } from "./import-validation";

const row = (over: Record<string, unknown> = {}) => ({
  rowNumber: 2,
  txnDate: "2026-11-04",
  amountMinor: -1250,
  description: "Office supplies",
  reference: "B-123",
  payee: "Vendor",
  externalId: "bank_abc123",
  ...over,
});

describe("bank import input integrity", () => {
  it("accepts valid signed exact minor units and normalizes optional strings", () => {
    expect(validateBankImportRows([row()])).toEqual([{ ...row(), force: false }]);
    expect(
      validateBankImportRows([row({ amountMinor: Number.MAX_SAFE_INTEGER })])[0]?.amountMinor,
    ).toBe(Number.MAX_SAFE_INTEGER);
    expect(
      validateBankImportRows([row({ amountMinor: -Number.MAX_SAFE_INTEGER })])[0]?.amountMinor,
    ).toBe(-Number.MAX_SAFE_INTEGER);
    expect(validateBankImportRows([row({ reference: "", payee: null })])[0]).toMatchObject({
      reference: null,
      payee: null,
    });
  });

  it("validates real bank dates including leap day and date separators", () => {
    expect(validateBankImportRows([row({ txnDate: "2028-02-29" })])[0]?.txnDate).toBe("2028-02-29");
    for (const badDate of [
      "2026-02-29",
      "2026-02-31",
      "2026-13-01",
      "2026-11-31",
      "11/04/2026",
      "2026-1-04",
    ]) {
      expect(() => validateBankImportRows([row({ txnDate: badDate })])).toThrow(/calendar date/);
    }
  });

  it.each([0, 1.5, "123", Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects unsafe or unsupported amount values",
    (amount) => {
      expect(() => validateBankImportRows([row({ amountMinor: amount })])).toThrow(/amount/);
    },
  );

  it("requires nonempty textual descriptions and non-ambiguous transaction IDs", () => {
    expect(() => validateBankImportRows([row({ description: "" })])).toThrow(/description/);
    expect(() => validateBankImportRows([row({ description: 42 })])).toThrow(/description/);
    expect(() => validateBankImportRows([row({ externalId: "" })])).toThrow(/transaction ID/);
    expect(() => validateBankImportRows([row({ externalId: "x".repeat(201) })])).toThrow(
      /transaction ID/,
    );
    expect(() =>
      validateBankImportRows([row(), row({ rowNumber: 3, externalId: "bank_abc123" })]),
    ).toThrow(/duplicate/);
  });

  it("rejects duplicate row numbers to protect forced-import identity", () => {
    expect(() => validateBankImportRows([row(), row({ externalId: "different" })])).toThrow(
      /row number/,
    );
  });

  it("rejects non-boolean forced imports and nonsensical optional types", () => {
    expect(() => validateBankImportRows([row({ force: "true" })])).toThrow(/override/);
    expect(() => validateBankImportRows([row({ payee: 12 })])).toThrow(/payee/);
    expect(() => validateBankImportRows([row({ reference: {} })])).toThrow(/reference/);
  });

  it("bounds the import, rejects malformed rows and accepts two real same-content transactions", () => {
    expect(() => validateBankImportRows([])).toThrow(/no rows/);
    expect(() => validateBankImportRows({})).toThrow(/no rows/);
    expect(() => validateBankImportRows([null])).toThrow(/invalid transaction/);
    expect(() => validateBankImportRows(Array(20_001).fill(row()))).toThrow(/At most/);
    const result = validateBankImportRows([
      row(),
      row({ rowNumber: 3, externalId: "bank_xyz456" }),
    ]);
    expect(result).toHaveLength(2);
  });
});
