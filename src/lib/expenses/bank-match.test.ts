import { describe, expect, it } from "vitest";
import { mapExpenseReimbursementBankSuggestions } from "./bank-match";

describe("expense reimbursement bank match helpers", () => {
  it("maps suggestion rows", () => {
    const rows = mapExpenseReimbursementBankSuggestions({
      suggestions: [
        {
          claim_id: "c1",
          claim_number: "EXP-1",
          claim_title: "Taxi",
          claim_date: "2026-11-01",
          claim_currency: "usd",
          remaining_minor: 2500,
          bank_transaction_id: "t1",
          txn_date: "2026-11-02",
          bank_amount_minor: -2500,
          bank_description: "REIMB",
          bank_account_id: "b1",
        },
      ],
    });
    expect(rows[0]?.claimCurrency).toBe("USD");
    expect(rows[0]?.bankAmountMinor).toBe(-2500);
  });
});
