import { describe, expect, it } from "vitest";
import {
  canFinalizeExitSettlement,
  mapExpenseExitOutstanding,
  summarizeExitOutstanding,
} from "./exit-settlement";

describe("exit settlement helpers", () => {
  it("maps outstanding snapshot rows", () => {
    const mapped = mapExpenseExitOutstanding({
      employee_user_id: "u1",
      open_advances: [
        {
          id: "a1",
          advance_number: "ADV-0001",
          remaining_minor: 2500,
          currency_code: "aud",
          status: "issued",
          version: 2,
        },
      ],
      open_claims: [],
      open_card_transactions: [],
    });
    expect(mapped.openAdvances[0]?.remainingMinor).toBe(2500);
    expect(mapped.openAdvances[0]?.currencyCode).toBe("AUD");
  });

  it("blocks finalize when cards or submitted claims remain", () => {
    expect(
      canFinalizeExitSettlement({
        status: "draft",
        openSubmittedClaims: 1,
        openCardTransactions: 0,
        bankAccountId: "bank",
      }).ok,
    ).toBe(false);
    expect(
      canFinalizeExitSettlement({
        status: "draft",
        openSubmittedClaims: 0,
        openCardTransactions: 0,
        bankAccountId: "bank",
      }),
    ).toEqual({ ok: true });
  });

  it("summarizes remaining advance cash", () => {
    const summary = summarizeExitOutstanding(
      mapExpenseExitOutstanding({
        employee_user_id: "u1",
        open_advances: [
          {
            id: "a1",
            advance_number: "A",
            remaining_minor: 1000,
            currency_code: "USD",
            status: "issued",
            version: 1,
          },
          {
            id: "a2",
            advance_number: "B",
            remaining_minor: 500,
            currency_code: "USD",
            status: "partially_settled",
            version: 1,
          },
        ],
        open_claims: [
          {
            id: "c1",
            claim_number: "E",
            approval_status: "draft",
            reimbursement_status: "not_eligible",
            total_minor: 1,
            claim_currency: "USD",
          },
        ],
        open_card_transactions: [],
      }),
    );
    expect(summary.advanceRemainingMinor).toBe(1500);
    expect(summary.blocking).toBe(false);
  });
});
