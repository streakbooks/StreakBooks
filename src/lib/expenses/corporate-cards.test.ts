import { describe, expect, it } from "vitest";
import {
  buildCorporateCardAccrualCredit,
  canMatchCardTransaction,
  mapExpenseCorporateCard,
  mapExpenseCorporateCardTransaction,
} from "./corporate-cards";

describe("canMatchCardTransaction", () => {
  const base = {
    txStatus: "unmatched",
    txAmountMinor: 5000,
    txCurrency: "AUD",
    txCardId: "card-1",
    claimPaymentSource: "corporate_card",
    claimTotalMinor: 5000,
    claimCurrency: "AUD",
    claimCardId: "card-1",
  };

  it("allows matching when amounts and card align", () => {
    expect(canMatchCardTransaction(base)).toEqual({ ok: true });
  });

  it("rejects mismatched totals or sources", () => {
    expect(
      canMatchCardTransaction({ ...base, claimTotalMinor: 4999 }).ok,
    ).toBe(false);
    expect(
      canMatchCardTransaction({ ...base, claimPaymentSource: "employee_paid" }).ok,
    ).toBe(false);
  });
});

describe("buildCorporateCardAccrualCredit", () => {
  it("credits the card liability", () => {
    expect(
      buildCorporateCardAccrualCredit({
        liabilityAccountId: "liab",
        amountMinor: 1200,
        last4: "4242",
      }),
    ).toEqual({
      ok: true,
      accountId: "liab",
      creditMinor: 1200,
      description: "Corporate card ****4242",
    });
  });
});

describe("mappers", () => {
  it("maps card and transaction rows", () => {
    const card = mapExpenseCorporateCard({
      id: "c1",
      label: "Ops Visa",
      network: "visa",
      last4: "4242",
      holder_user_id: "u1",
      liability_account_id: "l1",
      currency_code: "aud",
      status: "active",
      version: 1,
      updated_at: "2026-11-07T00:00:00Z",
    });
    expect(card.currencyCode).toBe("AUD");
    expect(card.last4).toBe("4242");

    const tx = mapExpenseCorporateCardTransaction({
      id: "t1",
      card_id: "c1",
      transaction_date: "2026-11-01",
      posted_date: null,
      merchant_name: "Airline",
      description: "Flight",
      amount_minor: 90000,
      currency_code: "AUD",
      status: "unmatched",
      matched_claim_id: null,
      external_ref: "ext-1",
    });
    expect(tx.amountMinor).toBe(90000);
    expect(tx.status).toBe("unmatched");
  });
});
