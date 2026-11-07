import { describe, expect, it } from "vitest";
import {
  buildCashAdvanceIssueLines,
  buildCashAdvanceSettlementCredit,
  canIssueCashAdvance,
  mapExpenseCashAdvance,
} from "./cash-advances";

describe("canIssueCashAdvance", () => {
  it("allows draft advances with positive amount", () => {
    expect(canIssueCashAdvance({ status: "draft", amountMinor: 5000 })).toEqual({ ok: true });
  });

  it("blocks non-draft or zero amounts", () => {
    expect(canIssueCashAdvance({ status: "issued", amountMinor: 5000 }).ok).toBe(false);
    expect(canIssueCashAdvance({ status: "draft", amountMinor: 0 }).ok).toBe(false);
  });
});

describe("buildCashAdvanceIssueLines", () => {
  it("builds DR advance / CR bank", () => {
    const result = buildCashAdvanceIssueLines({
      advanceAccountId: "adv",
      bankAccountId: "bank",
      amountMinor: 25000,
      advanceNumber: "ADV-0001",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines).toEqual([
      {
        accountId: "adv",
        debitMinor: 25000,
        creditMinor: 0,
        description: "Cash advance ADV-0001",
      },
      {
        accountId: "bank",
        debitMinor: 0,
        creditMinor: 25000,
        description: "Issue advance ADV-0001",
      },
    ]);
  });

  it("rejects same account for advance and bank", () => {
    expect(
      buildCashAdvanceIssueLines({
        advanceAccountId: "same",
        bankAccountId: "same",
        amountMinor: 100,
        advanceNumber: "ADV-1",
      }).ok,
    ).toBe(false);
  });
});

describe("buildCashAdvanceSettlementCredit", () => {
  it("credits the advance asset when settling a claim", () => {
    const result = buildCashAdvanceSettlementCredit({
      advanceAccountId: "adv",
      amountMinor: 1200,
      advanceNumber: "ADV-9",
    });
    expect(result).toEqual({
      ok: true,
      accountId: "adv",
      creditMinor: 1200,
      description: "Settle advance ADV-9",
    });
  });
});

describe("mapExpenseCashAdvance", () => {
  it("maps snake_case RPC rows", () => {
    const adv = mapExpenseCashAdvance({
      id: "a1",
      advance_number: "ADV-0002",
      title: "Trip float",
      description: null,
      employee_user_id: "u1",
      advance_date: "2026-11-07",
      currency_code: "aud",
      amount_minor: 10000,
      remaining_minor: 4000,
      status: "partially_settled",
      bank_account_id: "b1",
      issue_journal_id: "j1",
      version: 2,
      updated_at: "2026-11-07T00:00:00Z",
    });
    expect(adv.currencyCode).toBe("AUD");
    expect(adv.remainingMinor).toBe(4000);
    expect(adv.status).toBe("partially_settled");
  });
});
