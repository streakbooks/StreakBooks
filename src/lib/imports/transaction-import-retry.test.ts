import { describe, expect, it } from "vitest";
import {
  classifyTransactionImportRetry,
  isExactTransactionImportRetry,
  isVerifiedTransactionImportJournal,
  isReconciledTransactionImportJournal,
  type ExpectedImportRetry,
  type StoredImportRetry,
} from "./transaction-import-retry";

const expected: ExpectedImportRetry = {
  contactId: "contact-a",
  documentDate: "2026-10-01",
  dueDate: "2026-10-31",
  currencyCode: "USD",
  lines: [
    {
      description: "Consulting",
      accountId: "income-a",
      quantity: 1.5,
      unitPriceMinor: 1250,
      taxCodeId: "tax-a",
    },
    {
      description: "Service",
      accountId: "income-b",
      quantity: 1,
      unitPriceMinor: 400,
      taxCodeId: null,
    },
  ],
};
const stored: StoredImportRetry = {
  contact_id: "contact-a",
  document_date: "2026-10-01",
  due_date: "2026-10-31",
  currency_code: "USD",
  memo: null,
  lines: [
    {
      description: "Consulting",
      account_id: "income-a",
      quantity: "1.5",
      unit_price_minor: "1250",
      tax_code_id: "tax-a",
      discount_minor: 0,
      product_id: null,
    },
    {
      description: "Service",
      account_id: "income-b",
      quantity: 1,
      unit_price_minor: 400,
      tax_code_id: null,
      discount_minor: 0,
      product_id: null,
    },
  ],
};

describe("Sales/Purchases CSV import idempotent retry comparison (non-posting)", () => {
  it("accepts exact persisted source data including numeric values returned as strings", () => {
    expect(isExactTransactionImportRetry(expected, stored)).toBe(true);
  });
  it("rejects same-number collisions with different customer, date or currency", () => {
    expect(isExactTransactionImportRetry(expected, { ...stored, contact_id: "other" })).toBe(false);
    expect(isExactTransactionImportRetry(expected, { ...stored, due_date: "2026-11-01" })).toBe(
      false,
    );
    expect(isExactTransactionImportRetry(expected, { ...stored, currency_code: "EUR" })).toBe(
      false,
    );
    expect(isExactTransactionImportRetry(expected, { ...stored, memo: "Manual changes" })).toBe(
      false,
    );
  });
  it("rejects changed account, tax, price, quantity, description and line order", () => {
    for (const patch of [
      { account_id: "other" },
      { tax_code_id: null },
      { unit_price_minor: 1251 },
      { quantity: 2 },
      { description: "Different" },
    ]) {
      expect(
        isExactTransactionImportRetry(expected, {
          ...stored,
          lines: [{ ...stored.lines[0]!, ...patch }, stored.lines[1]!],
        }),
      ).toBe(false);
    }
    expect(
      isExactTransactionImportRetry(expected, { ...stored, lines: [...stored.lines].reverse() }),
    ).toBe(false);
    expect(isExactTransactionImportRetry(expected, { ...stored, lines: [stored.lines[0]!] })).toBe(
      false,
    );
  });
  it("rejects manual discounts and linked products absent from CSV", () => {
    expect(
      isExactTransactionImportRetry(expected, {
        ...stored,
        lines: [{ ...stored.lines[0]!, discount_minor: 10 }, stored.lines[1]!],
      }),
    ).toBe(false);
    expect(
      isExactTransactionImportRetry(expected, {
        ...stored,
        lines: [{ ...stored.lines[0]!, product_id: "item-a" }, stored.lines[1]!],
      }),
    ).toBe(false);
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
  it.each(["void", "cancelled", "unknown", ""])("never silently skips %s statuses", (status) =>
    expect(classifyTransactionImportRetry(status, "journal-id", true)).toBe("invalid"),
  );
});

describe("AR/AP import retry journal provenance guard (read-only)", () => {
  const expectedJournal = {
    companyId: "company-a",
    documentId: "invoice-a",
    journalId: "journal-a",
    sourceType: "sales_invoice" as const,
  };
  const journal = {
    id: "journal-a",
    company_id: "company-a",
    status: "posted",
    source_type: "sales_invoice",
    source_id: "invoice-a",
  };
  it("accepts only a posted journal linked to the exact organisation and document", () => {
    expect(isVerifiedTransactionImportJournal(expectedJournal, journal)).toBe(true);
    expect(
      isVerifiedTransactionImportJournal({ ...expectedJournal, documentId: "other" }, journal),
    ).toBe(false);
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
      expect(isVerifiedTransactionImportJournal(expectedJournal, { ...journal, ...patch })).toBe(
        false,
      );
    }
  });
  it("does not treat legacy source-less demo journals as verified imports", () => {
    expect(
      isVerifiedTransactionImportJournal(expectedJournal, { ...journal, source_id: null }),
    ).toBe(false);
  });
  it("also validates purchase-bill journal provenance", () => {
    expect(
      isVerifiedTransactionImportJournal(
        { ...expectedJournal, documentId: "bill-a", sourceType: "purchase_bill" },
        { ...journal, source_type: "purchase_bill", source_id: "bill-a" },
      ),
    ).toBe(true);
  });
});

describe("AR/AP CSV retry GL-to-subledger reconciliation (read-only)", () => {
  const companyId = "org-a";
  const journalId = "journal-a";
  const controlAccountId = "ar-control";
  const expected = {
    companyId,
    journalId,
    controlAccountId,
    controlSide: "debit" as const,
    expectedTotalMinor: 1100n,
    persistedTotalMinor: "1100",
  };
  const lines = [
    {
      company_id: companyId,
      journal_id: journalId,
      account_id: controlAccountId,
      debit_minor: "1100",
      credit_minor: "0",
    },
    {
      company_id: companyId,
      journal_id: journalId,
      account_id: "revenue",
      debit_minor: 0,
      credit_minor: 1000,
    },
    {
      company_id: companyId,
      journal_id: journalId,
      account_id: "tax",
      debit_minor: 0,
      credit_minor: 100,
    },
  ];

  it("accepts balanced AR debit with matching persisted invoice and calculated CSV total", () => {
    expect(isReconciledTransactionImportJournal(expected, lines)).toBe(true);
  });

  it("accepts balanced AP credit with reverse-charge self-assessment lines", () => {
    const ap = { ...expected, controlSide: "credit" as const, controlAccountId: "ap-control" };
    const billLines = [
      { ...lines[0]!, account_id: "expense", debit_minor: 1000, credit_minor: 0 },
      { ...lines[0]!, account_id: "input-tax", debit_minor: 100, credit_minor: 0 },
      { ...lines[0]!, account_id: "ap-control", debit_minor: 0, credit_minor: 1100 },
      { ...lines[0]!, account_id: "reverse-input", debit_minor: 50, credit_minor: 0 },
      { ...lines[0]!, account_id: "reverse-output", debit_minor: 0, credit_minor: 50 },
    ];
    expect(isReconciledTransactionImportJournal(ap, billLines)).toBe(true);
  });

  it("rejects mismatched persisted subledger total and wrong GL control amount", () => {
    expect(
      isReconciledTransactionImportJournal({ ...expected, persistedTotalMinor: 1099 }, lines),
    ).toBe(false);
    expect(
      isReconciledTransactionImportJournal({ ...expected, expectedTotalMinor: 1099n }, lines),
    ).toBe(false);
    expect(
      isReconciledTransactionImportJournal(expected, [
        { ...lines[0]!, debit_minor: 1099 },
        ...lines.slice(1),
      ]),
    ).toBe(false);
  });

  it("rejects cross-company and unrelated journal lines, including mixed-company responses", () => {
    expect(
      isReconciledTransactionImportJournal(expected, [
        { ...lines[0]!, company_id: "org-b" },
        ...lines.slice(1),
      ]),
    ).toBe(false);
    expect(
      isReconciledTransactionImportJournal(expected, [
        lines[0]!,
        { ...lines[1]!, journal_id: "journal-other" },
        lines[2]!,
      ]),
    ).toBe(false);
  });

  it("rejects unbalanced journals and duplicate AR/AP control postings", () => {
    expect(
      isReconciledTransactionImportJournal(expected, [
        lines[0]!,
        lines[1]!,
        { ...lines[2]!, credit_minor: 99 },
      ]),
    ).toBe(false);
    expect(
      isReconciledTransactionImportJournal(expected, [
        ...lines,
        { ...lines[0]!, debit_minor: 1100 },
      ]),
    ).toBe(false);
  });

  it("rejects zero, negative, dual-sided, fractional or invalid journal amounts", () => {
    for (const patch of [
      { debit_minor: -1 },
      { debit_minor: 0 },
      { credit_minor: 1 },
      { debit_minor: 0.5 },
      { debit_minor: "not-a-number" },
    ]) {
      expect(
        isReconciledTransactionImportJournal(expected, [
          { ...lines[0]!, ...patch },
          ...lines.slice(1),
        ]),
      ).toBe(false);
    }
  });

  it("fails closed on empty, missing or truncated journal line queries", () => {
    expect(isReconciledTransactionImportJournal(expected, null)).toBe(false);
    expect(isReconciledTransactionImportJournal(expected, [])).toBe(false);
    expect(isReconciledTransactionImportJournal(expected, [lines[0]!])).toBe(false);
    expect(
      isReconciledTransactionImportJournal(
        expected,
        Array.from({ length: 501 }, () => lines[0]!),
      ),
    ).toBe(false);
  });
});
