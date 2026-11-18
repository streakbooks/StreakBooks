import { describe, expect, it } from "vitest";
import { CREATE_ACTIONS } from "@/lib/create-new/registry";
import {
  MONEY_OWNERSHIP,
  RECEIVE_MONEY_ENTRY_ACTION_IDS,
  SPEND_MONEY_ENTRY_ACTION_IDS,
} from "@/lib/navigation/money-ownership";

describe("money ownership routing", () => {
  it("registers Spend money under Banking create route", () => {
    for (const id of SPEND_MONEY_ENTRY_ACTION_IDS) {
      const action = CREATE_ACTIONS.find((entry) => entry.id === id);
      expect(action?.group).toBe("banking");
      expect(action?.route).toBe(MONEY_OWNERSHIP.spendMoney.createRoute);
    }
  });

  it("registers Receive money under Banking create route", () => {
    for (const id of RECEIVE_MONEY_ENTRY_ACTION_IDS) {
      const action = CREATE_ACTIONS.find((entry) => entry.id === id);
      expect(action?.group).toBe("banking");
      expect(action?.route).toBe(MONEY_OWNERSHIP.receiveMoney.createRoute);
    }
  });

  it("keeps expense claims owned by Expenses, not Spend money", () => {
    const claim = CREATE_ACTIONS.find((entry) => entry.id === "reimbursement");
    expect(claim?.route).toBe(MONEY_OWNERSHIP.expenseClaims.createRoute);
    expect(claim?.route).not.toBe(MONEY_OWNERSHIP.spendMoney.createRoute);
  });

  it("does not leave other money kinds pointing at bare money-documents/new without kind helpers", () => {
    const moneyIds = [
      "sales_receipt",
      "customer_refund",
      "supplier_refund",
      "bank_deposit",
      "card_payment",
      "bank_adjustment",
    ] as const;
    for (const id of moneyIds) {
      const action = CREATE_ACTIONS.find((entry) => entry.id === id);
      expect(action?.route).toBe("/banking/money-documents/new");
      expect(action?.id).not.toBe("receive_money");
    }
  });
});
