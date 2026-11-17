import { describe, expect, it } from "vitest";
import { getAiSuggestionKind, getJournalPreview } from "./suggestion-review";

const goodLines = [
  { account_id: "expense-account", debit_minor: 15_000, credit_minor: 0 },
  { account_id: "accrual-account", debit_minor: 0, credit_minor: 15_000 },
];

describe("AI proposal kind metadata", () => {
  it("classifies new journal drafts explicitly", () => {
    expect(getAiSuggestionKind("draft", { _ai_type: "journal_draft", lines: goodLines })).toBe(
      "journal_draft",
    );
  });

  it("keeps invoice/bill/category drafts non-posting even with lines", () => {
    for (const kind of ["invoice_draft", "bill_draft", "category_suggestion"]) {
      expect(getAiSuggestionKind("draft", { _ai_type: kind, lines: goodLines })).toBe(kind);
      expect(
        getJournalPreview({
          intent: "draft",
          status: "validated",
          payload: { _ai_type: kind, lines: goodLines },
        }),
      ).toBeNull();
    }
  });

  it("identifies unmistakable legacy journal drafts without metadata", () => {
    expect(getAiSuggestionKind("draft", { lines: goodLines })).toBe("journal_draft");
    expect(
      getJournalPreview({ intent: "draft", status: "validated", payload: { lines: goodLines } }),
    ).toHaveLength(2);
  });

  it("does not classify ordinary document lines as a journal", () => {
    expect(
      getAiSuggestionKind("draft", {
        lines: [{ description: "Service", quantity: 1, unit_price_minor: 12000 }],
      }),
    ).toBe("document_draft");
  });
});

describe("AI review-and-post preview guard", () => {
  it("provides a balanced preview only for validated journal drafts", () => {
    expect(
      getJournalPreview({
        intent: "draft",
        status: "validated",
        payload: { _ai_type: "journal_draft", lines: goodLines },
      }),
    ).toEqual(goodLines);
  });

  it.each(["pending", "invalid", "rejected", "applied"])(
    "refuses terminal or unvalidated status: %s",
    (status) => {
      expect(
        getJournalPreview({
          intent: "draft",
          status,
          payload: { _ai_type: "journal_draft", lines: goodLines },
        }),
      ).toBeNull();
    },
  );

  it("refuses unbalanced and zero-total journals", () => {
    expect(
      getJournalPreview({
        intent: "draft",
        status: "validated",
        payload: {
          _ai_type: "journal_draft",
          lines: [
            { account_id: "a", debit_minor: 100, credit_minor: 0 },
            { account_id: "b", debit_minor: 0, credit_minor: 50 },
          ],
        },
      }),
    ).toBeNull();
    expect(
      getJournalPreview({
        intent: "draft",
        status: "validated",
        payload: {
          _ai_type: "journal_draft",
          lines: [
            { account_id: "a", debit_minor: 0, credit_minor: 0 },
            { account_id: "b", debit_minor: 0, credit_minor: 0 },
          ],
        },
      }),
    ).toBeNull();
  });

  it("refuses non-integer, negative, two-sided, and missing-account lines", () => {
    for (const row of [
      { account_id: "a", debit_minor: 1.5, credit_minor: 0 },
      { account_id: "a", debit_minor: -1, credit_minor: 0 },
      { account_id: "a", debit_minor: 100, credit_minor: 100 },
      { account_id: "", debit_minor: 100, credit_minor: 0 },
    ]) {
      expect(
        getJournalPreview({
          intent: "draft",
          status: "validated",
          payload: { _ai_type: "journal_draft", lines: [row, goodLines[1]] },
        }),
      ).toBeNull();
    }
  });

  it("fails closed when a proposal is missing its payload", () => {
    expect(getJournalPreview({ intent: "draft", status: "validated", payload: null })).toBeNull();
  });
});
