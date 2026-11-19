import { describe, expect, it } from "vitest";
import { CREATE_ACTIONS } from "@/lib/create-new/registry";
import { opensCreateAsFullPage } from "@/lib/create-new/menu";
import { MONEY_OWNERSHIP } from "@/lib/navigation/money-ownership";

/**
 * Batch 46 — +New create destinations must be full-page workspaces, not list landings
 * or half-screen sheets for complex accounting documents.
 */
describe("create workflow routes (Batch 46)", () => {
  const expected: Record<string, string> = {
    manual_journal: "/accounting/journals/new",
    recurring_journal: "/accounting/journals/new",
    recurring_invoice: "/sales/recurring/new",
    recurring_bill: "/purchases/recurring/new",
    receive_money: MONEY_OWNERSHIP.receiveMoney.createRoute,
    expense: MONEY_OWNERSHIP.spendMoney.createRoute,
    bank_transfer: "/banking/transfers/new",
    invoice: "/sales/invoices/new",
    bill: "/purchases/bills/new",
  };

  it.each(Object.entries(expected))("%s → %s", (id, route) => {
    const action = CREATE_ACTIONS.find((entry) => entry.id === id);
    expect(action, `missing create action ${id}`).toBeTruthy();
    expect(action!.route).toBe(route);
    expect(opensCreateAsFullPage(action!)).toBe(true);
  });

  it("does not leave recurring bill/invoice pointing at list-only routes", () => {
    expect(CREATE_ACTIONS.find((a) => a.id === "recurring_bill")?.route).not.toBe(
      "/purchases/recurring",
    );
    expect(CREATE_ACTIONS.find((a) => a.id === "recurring_invoice")?.route).not.toBe(
      "/sales/recurring",
    );
  });

  it("keeps money-document kinds on money-documents/new (kind supplied by Create menu search)", () => {
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
      expect(action?.id).not.toBe("expense");
    }
  });

  it("documents product /new and expense-claim Create deep-link owners", () => {
    const product = CREATE_ACTIONS.find((a) => a.id === "product");
    const claim = CREATE_ACTIONS.find((a) => a.id === "reimbursement");
    expect(product?.route).toBe("/products-services/new");
    expect(claim?.route).toBe("/expense-management/my-expenses");
    expect(opensCreateAsFullPage(product!)).toBe(true);
    expect(opensCreateAsFullPage(claim!)).toBe(true);
  });

  it("names account create New Account (not Chart of account)", () => {
    expect(CREATE_ACTIONS.find((a) => a.id === "account")?.label).toBe("New Account");
  });

  it("opens sales order create on the dedicated /new workspace", () => {
    const salesOrder = CREATE_ACTIONS.find((a) => a.id === "sales_order");
    expect(salesOrder?.route).toBe("/sales/orders/new");
    expect(opensCreateAsFullPage(salesOrder!)).toBe(true);
  });

  it("opens fixed asset create on the dedicated /new redirect", () => {
    const fixedAsset = CREATE_ACTIONS.find((a) => a.id === "fixed_asset");
    expect(fixedAsset?.route).toBe("/fixed-assets/new");
    expect(opensCreateAsFullPage(fixedAsset!)).toBe(true);
  });
});
