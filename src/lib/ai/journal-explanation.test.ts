import { describe, expect, it } from "vitest";
import {
  accountPostingMeaning,
  buildJournalExplanation,
  exactJournalMinorString,
  type PostedJournalInput,
} from "./journal-explanation";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function posted(overrides: Partial<PostedJournalInput> = {}): PostedJournalInput {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    journal_number: 100,
    journal_date: "2026-11-05",
    status: "posted",
    memo: "Accrued utility expense",
    source_type: "manual",
    source_id: null,
    currency_code: "USD",
    reverses_journal_id: null,
    lines: [
      {
        id: A,
        line_no: 1,
        account_id: A,
        account_code: "6100",
        account_name: "Utilities expense",
        account_type: "expense",
        account_active: true,
        description: "November expense",
        debit_minor: "35000",
        credit_minor: "0",
      },
      {
        id: B,
        line_no: 2,
        account_id: B,
        account_code: "2100",
        account_name: "Accrued liabilities",
        account_type: "liability",
        account_active: true,
        description: "Payable accrual",
        debit_minor: "0",
        credit_minor: "35000",
      },
    ],
    ...overrides,
  };
}

describe("posted journal evidence explanations", () => {
  it("uses real journal line accounts, not a simulated or model-generated entry", () => {
    const explained = buildJournalExplanation(posted());
    expect(explained.journal.id).toBe(posted().id);
    expect(explained.lines).toHaveLength(2);
    expect(explained.balanced).toBe(true);
    expect(explained.total_debit_minor).toBe("35000");
    expect(explained.total_credit_minor).toBe("35000");
    expect(explained.lines[0]?.meaning).toMatch(/Debit.*expense.*increases/);
    expect(explained.lines[1]?.meaning).toMatch(/Credit.*liability.*increases/);
    expect(explained.summary).toMatch(/correctness.*unverified/);
  });

  it("maps standard debit/credit effects without claiming a reason for the posting", () => {
    expect(accountPostingMeaning("asset", 100n, 0n)).toMatch(/increases/);
    expect(accountPostingMeaning("asset", 0n, 100n)).toMatch(/decreases/);
    expect(accountPostingMeaning("expense", 100n, 0n)).toMatch(/increases/);
    expect(accountPostingMeaning("income", 0n, 100n)).toMatch(/increases/);
    expect(accountPostingMeaning("equity", 100n, 0n)).toMatch(/decreases/);
    expect(accountPostingMeaning("liability", 0n, 100n)).toMatch(/increases/);
  });

  it("returns no inferred account meaning for unknown types", () => {
    expect(accountPostingMeaning("mystery", 100n, 0n)).toMatch(/unavailable/);
    expect(accountPostingMeaning(null, 0n, 100n)).toMatch(/unavailable/);
  });

  it("does not interpret negative, zero or double-sided lines as ordinary postings", () => {
    expect(accountPostingMeaning("expense", -100n, 0n)).toMatch(/negative/);
    expect(accountPostingMeaning("expense", 0n, 0n)).toMatch(/No movement/);
    expect(accountPostingMeaning("asset", 100n, 100n)).toMatch(/Both/);
  });

  it("supports exact string amounts beyond JavaScript number precision", () => {
    const large = "900719925474099312";
    const input = posted();
    input.lines[0]!.debit_minor = large;
    input.lines[1]!.credit_minor = large;
    const explained = buildJournalExplanation(input);
    expect(explained.balanced).toBe(true);
    expect(explained.total_debit_minor).toBe(large);
    expect(explained.lines[0]?.debit_display).toBe("USD 9007199254740993.12");
  });

  it("refuses unsafe numeric database casts rather than silently rounding money", () => {
    expect(() => exactJournalMinorString(Number.MAX_SAFE_INTEGER + 1)).toThrow(/exact/);
    expect(exactJournalMinorString("900719925474099312")).toBe("900719925474099312");
    expect(exactJournalMinorString(123)).toBe("123");
    expect(() => exactJournalMinorString("1.50")).toThrow(/exact/);
  });

  it("identifies unbalanced entries for independent review", () => {
    const input = posted();
    input.lines[1]!.credit_minor = "20000";
    const explained = buildJournalExplanation(input);
    expect(explained.balanced).toBe(false);
    expect(explained.actions.map((action) => action.id)).toContain("balance");
    expect(explained.summary).toMatch(/further investigation/);
  });

  it("calls out inactive accounts and absent memo without inventing a correction", () => {
    const input = posted({ memo: "" });
    input.lines[0]!.account_active = false;
    const explained = buildJournalExplanation(input);
    expect(explained.actions.map((action) => action.id)).toEqual(
      expect.arrayContaining(["inactive_accounts", "memo", "source_support", "period_tax"]),
    );
    expect(
      explained.actions.some((action) => /post a correction automatically/i.test(action.detail)),
    ).toBe(false);
  });

  it("flags a missing source reference only when a document-backed source is expected", () => {
    const first = buildJournalExplanation(posted({ source_type: "sales_invoice" }));
    expect(first.actions.some((action) => action.id === "source")).toBe(true);
    const manual = buildJournalExplanation(posted());
    expect(manual.actions.some((action) => action.id === "source")).toBe(false);
  });

  it("does not convert foreign-currency journals into base-currency totals", () => {
    const explained = buildJournalExplanation(posted({ currency_code: "KWD" }));
    expect(explained.lines[0]?.debit_display).toBe("KWD 35.000");
    expect(explained.limitations.join(" ")).toMatch(/No FX conversion/);
  });

  it("refuses non-posted or unreasonably long journals", () => {
    expect(() => buildJournalExplanation(posted({ status: "draft" }))).toThrow(/Only posted/);
    expect(() => buildJournalExplanation(posted({ lines: [] }))).toThrow(/between 2 and 200/);
    expect(() =>
      buildJournalExplanation(
        posted({ lines: Array.from({ length: 201 }, () => posted().lines[0]!) }),
      ),
    ).toThrow(/between 2 and 200/);
  });

  it("always suggests human document, tax and period verification", () => {
    const explained = buildJournalExplanation(posted());
    expect(explained.actions.map((action) => action.id)).toContain("source_support");
    expect(explained.actions.map((action) => action.id)).toContain("period_tax");
    expect(explained.limitations.join(" ")).toMatch(/not an audit finding or approval/);
    expect(explained).not.toHaveProperty("approved");
    expect(explained).not.toHaveProperty("postedJournalId");
  });
});
