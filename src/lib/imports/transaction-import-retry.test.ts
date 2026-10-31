import { describe, expect, it } from "vitest";
import { isExactTransactionImportRetry, type ExpectedImportRetry, type StoredImportRetry } from "./transaction-import-retry";

const expected: ExpectedImportRetry = {
  contactId: "contact-a",
  documentDate: "2026-10-01",
  dueDate: "2026-10-31",
  currencyCode: "USD",
  lines: [
    { description: "Consulting", accountId: "income-a", quantity: 1.5, unitPriceMinor: 1250, taxCodeId: "tax-a" },
    { description: "Service", accountId: "income-b", quantity: 1, unitPriceMinor: 400, taxCodeId: null },
  ],
};
const stored: StoredImportRetry = {
  contact_id: "contact-a",
  document_date: "2026-10-01",
  due_date: "2026-10-31",
  currency_code: "USD",
  memo: null,
  lines: [
    { description: "Consulting", account_id: "income-a", quantity: "1.5", unit_price_minor: "1250", tax_code_id: "tax-a", discount_minor: 0, product_id: null },
    { description: "Service", account_id: "income-b", quantity: 1, unit_price_minor: 400, tax_code_id: null, discount_minor: 0, product_id: null },
  ],
};

describe("Sales/Purchases CSV import idempotent retry comparison (non-posting)", () => {
  it("accepts exact persisted source data including numeric values returned as strings", () => {
    expect(isExactTransactionImportRetry(expected, stored)).toBe(true);
  });
  it("rejects same-number collisions with different customer, date or currency", () => {
    expect(isExactTransactionImportRetry(expected, { ...stored, contact_id: "other" })).toBe(false);
    expect(isExactTransactionImportRetry(expected, { ...stored, due_date: "2026-11-01" })).toBe(false);
    expect(isExactTransactionImportRetry(expected, { ...stored, currency_code: "EUR" })).toBe(false);
    expect(isExactTransactionImportRetry(expected, { ...stored, memo: "Manual changes" })).toBe(false);
  });
  it("rejects changed account, tax, price, quantity, description and line order", () => {
    for (const patch of [
      { account_id: "other" },
      { tax_code_id: null },
      { unit_price_minor: 1251 },
      { quantity: 2 },
      { description: "Different" },
    ]) {
      expect(isExactTransactionImportRetry(expected, {
        ...stored, lines: [{ ...stored.lines[0]!, ...patch }, stored.lines[1]!],
      })).toBe(false);
    }
    expect(isExactTransactionImportRetry(expected, { ...stored, lines: [...stored.lines].reverse() })).toBe(false);
    expect(isExactTransactionImportRetry(expected, { ...stored, lines: [stored.lines[0]!] })).toBe(false);
  });
  it("rejects manual discounts and linked products absent from CSV", () => {
    expect(isExactTransactionImportRetry(expected, {
      ...stored, lines: [{ ...stored.lines[0]!, discount_minor: 10 }, stored.lines[1]!],
    })).toBe(false);
    expect(isExactTransactionImportRetry(expected, {
      ...stored, lines: [{ ...stored.lines[0]!, product_id: "item-a" }, stored.lines[1]!],
    })).toBe(false);
  });
});
