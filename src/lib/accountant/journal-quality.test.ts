import { describe, expect, it } from "vitest";
import { minorValue, reviewManualJournals, type ManualJournalReviewRow } from "./journal-quality";

const base: ManualJournalReviewRow = {
  id: "journal-1",
  journal_number: 1,
  journal_date: "2026-11-01",
  status: "posted",
  source_type: "manual",
  memo: "Month-end accrual",
  currency_code: "GBP",
  reverses_journal_id: null,
  reversed_by_journal_id: null,
  journal_lines: [
    { account_id: "expense", debit_minor: 12500, credit_minor: 0 },
    { account_id: "accrual", debit_minor: 0, credit_minor: 12500 },
  ],
};

function kinds(rows: ManualJournalReviewRow[]) {
  return reviewManualJournals(rows).map((finding) => finding.kind);
}

describe("manual journal review", () => {
  it("accepts only exact safe minor units without floating-point rounding", () => {
    expect(minorValue(12)).toBe(12n);
    expect(minorValue("9007199254740991")).toBe(9007199254740991n);
    for (const value of [-1, 0.1, Number.MAX_SAFE_INTEGER + 1, "-1", "1.0", "9007199254740992"])
      expect(minorValue(value)).toBeNull();
  });

  it("finds exact same-day manual duplicate candidates regardless of line order", () => {
    const other: ManualJournalReviewRow = {
      ...base,
      id: "journal-2",
      journal_number: 2,
      memo: "  MONTH-END    ACCRUAL  ",
      journal_lines: base.journal_lines?.slice().reverse() ?? [],
    };
    const findings = reviewManualJournals([base, other]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "possible_duplicate",
      journalId: "journal-2",
      relatedJournalId: "journal-1",
      severity: "review",
    });
  });

  it("never groups different currency, date, memo, accounts or amounts", () => {
    const variations: Partial<ManualJournalReviewRow>[] = [
      { currency_code: "USD" },
      { journal_date: "2026-11-02" },
      { memo: "Different accrual" },
      {
        journal_lines: [
          { account_id: "other expense", debit_minor: 12500, credit_minor: 0 },
          { account_id: "accrual", debit_minor: 0, credit_minor: 12500 },
        ],
      },
      {
        journal_lines: [
          { account_id: "expense", debit_minor: 13000, credit_minor: 0 },
          { account_id: "accrual", debit_minor: 0, credit_minor: 13000 },
        ],
      },
    ];
    for (const [index, change] of variations.entries())
      expect(
        kinds([base, { ...base, ...change, id: "v" + index, journal_number: index + 2 }]),
      ).not.toContain("possible_duplicate");
  });

  it("excludes posted source documents, reversals and already reversed manual journals from duplication", () => {
    expect(kinds([base, { ...base, id: "x", source_type: "sales_invoice" }])).toEqual([]);
    expect(kinds([base, { ...base, id: "x", reverses_journal_id: "original" }])).not.toContain(
      "possible_duplicate",
    );
    expect(kinds([base, { ...base, id: "x", reversed_by_journal_id: "reversal" }])).not.toContain(
      "possible_duplicate",
    );
  });

  it("detects posted entries that are not balanced or have invalid line amounts", () => {
    expect(
      kinds([
        {
          ...base,
          journal_lines: [
            { account_id: "expense", debit_minor: 12501, credit_minor: 0 },
            { account_id: "accrual", debit_minor: 0, credit_minor: 12500 },
          ],
        },
      ]),
    ).toContain("imbalanced");
    expect(
      kinds([
        { ...base, journal_lines: [{ account_id: "expense", debit_minor: 1.5, credit_minor: 0 }] },
      ]),
    ).toContain("invalid_amount");
  });

  it("flags missing narrations, missing lines, zero-value lines and both-sided lines without mutating records", () => {
    const row = {
      ...base,
      memo: " ",
      journal_lines: [
        { account_id: "expense", debit_minor: 200, credit_minor: 100 },
        { account_id: "accrual", debit_minor: 0, credit_minor: 100 },
        { account_id: "zero", debit_minor: 0, credit_minor: 0 },
      ],
    };
    const snapshot = JSON.stringify(row);
    expect(kinds([row])).toEqual(
      expect.arrayContaining(["missing_memo", "zero_line", "both_sides"]),
    );
    expect(JSON.stringify(row)).toBe(snapshot);
    expect(kinds([{ ...base, journal_lines: [] }])).toContain("missing_lines");
  });

  it("ignores draft, voided and nonmanual journals and never emits posting actions", () => {
    expect(
      kinds([
        { ...base, status: "draft" },
        { ...base, source_type: "tax_adjustment" },
      ]),
    ).toEqual([]);
  });
});
