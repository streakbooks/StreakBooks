import { describe, expect, it } from "vitest";
import { reviewJournalLines, type JournalReviewDetail, type JournalReviewHeader } from "./journal-line-review";

const header: JournalReviewHeader = {
  id: "j1", journal_number: 17, journal_date: "2026-11-06",
  status: "posted", source_type: "payroll", currency_code: "JPY", total_debit_minor: 150,
};
const detail: JournalReviewDetail = {
  id: "j1", journal_number: 17, journal_date: "2026-11-06",
  status: "posted", source_type: "payroll", currency_code: "JPY",
  lines: [
    { id: "l1", line_no: 1, account_code: "100", debit_minor: 150, credit_minor: 0 },
    { id: "l2", line_no: 2, account_code: "200", debit_minor: 0, credit_minor: 150 },
  ],
};
const review = (override: Partial<JournalReviewDetail> = {}, h: Partial<JournalReviewHeader> = {}) =>
  reviewJournalLines({ ...header, ...h }, { ...detail, ...override });

describe("journal line-to-list review", () => {
  it("checks posted debits and credits using original minor-unit values", () => {
    expect(review()).toEqual({ state: "balanced", debitMinor: 150, creditMinor: 150, issues: [] });
  });
  it("does not claim posted integrity for a draft", () => {
    expect(review({ status: "draft" }, { status: "draft" }).state).toBe("not_posted");
  });
  it("rejects selected wrong detail, date, source, currency and stale status", () => {
    expect(review({ id: "j2" }).issues.join(" ")).toMatch(/does not match/);
    expect(review({ journal_date: "2026-10-31" }).issues.join(" ")).toMatch(/date or source/);
    expect(review({ source_type: "manual" }).issues.join(" ")).toMatch(/date or source/);
    expect(review({ currency_code: "USD" }).issues.join(" ")).toMatch(/currency/);
    expect(review({ status: "draft" }).state).toBe("exception");
  });
  it("fails closed on absent or incomplete posted journal lines", () => {
    expect(review({ lines: [] }).state).toBe("exception");
    expect(review({ lines: detail.lines.slice(0, 1) }).issues.join(" ")).toMatch(/at least two/);
  });
  it("rejects an unbalanced or header-mismatched journal", () => {
    expect(review({ lines: [{ ...detail.lines[0]!, debit_minor: 151 }, detail.lines[1]!] }).issues.join(" "))
      .toMatch(/not equal/);
    expect(review({}, { total_debit_minor: 151 }).issues.join(" ")).toMatch(/differs/);
  });
  it("detects duplicate identifiers, line numbers and missing account evidence", () => {
    const lines = [{ ...detail.lines[0]! }, { ...detail.lines[1]!, id: "l1", line_no: 1, account_code: "" }];
    const result = review({ lines });
    expect(result.state).toBe("exception");
    expect(result.issues.join(" ")).toMatch(/duplicate ID/);
    expect(result.issues.join(" ")).toMatch(/duplicate line number/);
    expect(result.issues.join(" ")).toMatch(/no linked account/);
  });
  it("rejects double-sided and zero-sided journal lines", () => {
    const lines = [{ ...detail.lines[0]!, credit_minor: 1 }, { ...detail.lines[1]!, debit_minor: 0, credit_minor: 0 }];
    expect(review({ lines }).issues.filter(x => x.includes("both/neither"))).toHaveLength(2);
  });
  it("rejects unsafe amounts without silently rounding", () => {
    const lines = [{ ...detail.lines[0]!, debit_minor: Number.MAX_SAFE_INTEGER + 1 }, detail.lines[1]!];
    expect(review({ lines }).state).toBe("exception");
    expect(review({ lines }).issues.join(" ")).toMatch(/unsafe/);
  });
  it("rejects an overall total exceeding the safe integer limit", () => {
    const lines = [
      { ...detail.lines[0]!, debit_minor: Number.MAX_SAFE_INTEGER },
      { ...detail.lines[1]!, debit_minor: 1, credit_minor: 0 },
      { ...detail.lines[1]!, id: "l3", line_no: 3, credit_minor: Number.MAX_SAFE_INTEGER },
      { ...detail.lines[1]!, id: "l4", line_no: 4, credit_minor: 1 },
    ];
    const result = review({ lines });
    expect(result.state).toBe("exception");
    expect(result.debitMinor).toBeNull();
    expect(result.creditMinor).toBeNull();
    expect(result.issues.join(" ")).toMatch(/safe display precision/);
  });
});
