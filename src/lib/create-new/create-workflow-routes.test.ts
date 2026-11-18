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
});
