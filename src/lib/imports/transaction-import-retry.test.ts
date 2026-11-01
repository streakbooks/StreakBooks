import { describe, expect, it } from "vitest";
import { classifyTransactionImportRetry, isExactTransactionImportRetry, isVerifiedTransactionImportJournal, type ExpectedImportRetry, type StoredImportRetry } from "./transaction-import-retry";

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

describe("AR/AP import retry posting-state guard (non-posting)", () => {
  it.each(["authorised", "partly_paid", "paid"])(
    "requires a real posted journal for %s documents",
    (status) => {
      expect(classifyTransactionImportRetry(status, null, false)).toBe("invalid");
      expect(classifyTransactionImportRetry(status, "journal-id", true)).toBe("skip");
    },
  );
  it.each(["draft", "awaiting_approval"])(
    "allows draft-only %s retries but requires review before requested posting",
    (status) => {
      expect(classifyTransactionImportRetry(status, null, false)).toBe("skip");
      expect(classifyTransactionImportRetry(status, null, true)).toBe("manual_authorisation");
      expect(classifyTransactionImportRetry(status, "journal-id", false)).toBe("invalid");
    },
  );
  it.each(["void", "cancelled", "unknown", ""])(
    "never silently skips %s statuses",
    (status) => expect(classifyTransactionImportRetry(status, "journal-id", true)).toBe("invalid"),
  );
});

describe("AR/AP import retry journal provenance guard (read-only)", () => {
  const expectedJournal = {
    companyId: "company-a", documentId: "invoice-a",
    journalId: "journal-a", sourceType: "sales_invoice" as const,
  };
  const journal = {
    id: "journal-a", company_id: "company-a", status: "posted",
    source_type: "sales_invoice", source_id: "invoice-a",
  };
  it("accepts only a posted journal linked to the exact organisation and document", () => {
    expect(isVerifiedTransactionImportJournal(expectedJournal, journal)).toBe(true);
    expect(isVerifiedTransactionImportJournal(
      { ...expectedJournal, documentId: "other" }, journal,
    )).toBe(false);
    expect(isVerifiedTransactionImportJournal(expectedJournal, null)).toBe(false);
  });
  it("rejects cross-organisation, wrong journal, wrong source type and unposted links", () => {
    for (const patch of [
      { company_id: "company-b" },
      { id: "journal-b" },
      { source_type: "purchase_bill" },
      { status: "draft" },
      { source_id: "invoice-b" },
    ]) {
      expect(isVerifiedTransactionImportJournal(expectedJournal, { ...journal, ...patch })).toBe(false);
    }
  });
  it("does not treat legacy source-less demo journals as verified imports", () => {
    expect(isVerifiedTransactionImportJournal(expectedJournal, { ...journal, source_id: null })).toBe(false);
  });
  it("also validates purchase-bill journal provenance", () => {
    expect(isVerifiedTransactionImportJournal(
      { ...expectedJournal, documentId: "bill-a", sourceType: "purchase_bill" },
      { ...journal, source_type: "purchase_bill", source_id: "bill-a" },
    )).toBe(true);
  });
});
