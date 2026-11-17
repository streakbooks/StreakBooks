import { describe, expect, it } from "vitest";
import {
  assessAccountEvidenceLine,
  assessJournalEvidence,
  summariseJournalEvidence,
  type JournalEvidenceRow,
} from "./evidence-review";

function posted(overrides: Partial<JournalEvidenceRow> = {}): JournalEvidenceRow {
  return {
    journal_id: "11111111-1111-4111-8111-111111111111",
    journal_number: 12,
    journal_date: "2026-11-05",
    status: "posted",
    source_type: "manual",
    source_id: null,
    memo: "Month-end accrual",
    currency_code: "USD",
    total_debit_minor: 12345,
    total_credit_minor: 12345,
    ...overrides,
  };
}

describe("AI journal evidence, read-only and source-linked", () => {
  it("classifies balanced posted totals without calling them an audit conclusion", () => {
    const check = assessJournalEvidence(posted());
    expect(check.status).toBe("balanced_totals");
    expect(check.debit).toBe(12345n);
    expect(check.explanation).toMatch(/does not verify/i);
  });

  it("requires a manual review for unequal or zero posted totals", () => {
    expect(assessJournalEvidence(posted({ total_credit_minor: 12000 })).status).toBe(
      "review_totals",
    );
    expect(
      assessJournalEvidence(posted({ total_debit_minor: 0, total_credit_minor: 0 })).status,
    ).toBe("review_totals");
  });

  it("does not interpret draft journals as posted ledger evidence", () => {
    const check = assessJournalEvidence(posted({ status: "draft" }));
    expect(check.status).toBe("not_posted");
    expect(check.debit).toBeNull();
    expect(check.credit).toBeNull();
  });

  it("never converts unsafe JavaScript numbers to exact ledger integers", () => {
    const check = assessJournalEvidence(
      posted({
        total_debit_minor: Number.MAX_SAFE_INTEGER + 5,
        total_credit_minor: Number.MAX_SAFE_INTEGER + 5,
      }),
    );
    expect(check.status).toBe("unavailable");
    expect(check.debit).toBeNull();
  });

  it("sums only the displayed page, not the total number of matching journals", () => {
    const rows = [posted(), posted({ journal_id: "22222222-2222-4222-8222-222222222222" })];
    const summary = summariseJournalEvidence(rows);
    expect(summary).toMatchObject({ displayed: 2, balanced: 2, review: 0, unavailable: 0 });
    expect(summary.pageDebit).toBe(24690n);
    expect(summary.pageCredit).toBe(24690n);
  });

  it("does not produce a bogus single-currency total for mixed-currency journals", () => {
    const summary = summariseJournalEvidence([posted(), posted({ currency_code: "EUR" })]);
    expect(summary.singleCurrency).toBeNull();
    expect(summary.pageDebit).toBeNull();
  });

  it("suppresses page totals if at least one value cannot be checked exactly", () => {
    const summary = summariseJournalEvidence([
      posted(),
      posted({ total_debit_minor: Number.MAX_SAFE_INTEGER + 100 }),
    ]);
    expect(summary.unavailable).toBe(1);
    expect(summary.pageDebit).toBeNull();
  });

  it("distinguishes ordinary account debits from impossible debit/credit column combinations", () => {
    const line = {
      journal_id: "j1",
      journal_number: 123,
      journal_date: "2026-11-05",
      debit_minor: 500,
      credit_minor: 0,
      running_balance_minor: 2500,
    };
    expect(assessAccountEvidenceLine(line).status).toBe("ordinary");
    expect(assessAccountEvidenceLine({ ...line, credit_minor: 100 }).status).toBe("review");
    expect(assessAccountEvidenceLine({ ...line, debit_minor: 0 }).status).toBe("review");
  });

  it("does not show inexact account-level amounts as if they were verified", () => {
    const check = assessAccountEvidenceLine({
      journal_id: "j1",
      journal_number: 123,
      journal_date: "2026-11-05",
      debit_minor: Number.MAX_SAFE_INTEGER + 1,
      credit_minor: 0,
      running_balance_minor: 0,
    });
    expect(check.status).toBe("unavailable");
  });
});
