import { describe, expect, it } from "vitest";
import {
  buildPaletteActions,
  filterPaletteActions,
  suggestedPaletteActions,
} from "./palette-items";
import { sanitiseSearchTerm } from "./sanitise";

describe("command palette (U-07)", () => {
  const actions = buildPaletteActions();
  it("offers create shortcuts, pages and ready reports", () => {
    expect(actions.some((a) => a.id === "new-invoice" && a.href === "/sales/invoices/new")).toBe(
      true,
    );
    expect(actions.some((a) => a.group === "Go to" && a.href === "/reports")).toBe(true);
    expect(actions.some((a) => a.id === "report-profit-and-loss")).toBe(true);
    // link-only reports are not duplicated as runner reports
    expect(actions.some((a) => a.id === "report-bank-reconciliation")).toBe(false);
  });

  it("keeps Create destinations aligned with createNavTarget intents", () => {
    const claim = actions.find((a) => a.id === "new-expense-claim");
    expect(claim?.href).toBe("/expense-management/my-expenses");
    expect(claim?.search).toEqual({ create: "true" });
    const salesReceipt = actions.find((a) => a.id === "new-sales-receipt");
    expect(salesReceipt?.href).toBe("/banking/money-documents/new");
    expect(salesReceipt?.search).toEqual({ kind: "sales_receipt" });
    const receivePayment = actions.find((a) => a.id === "new-receive-payment");
    expect(receivePayment?.href).toBe("/sales/receipts/new");
    expect(actions.some((a) => a.id === "new-manual-journal")).toBe(true);
    expect(actions.some((a) => a.id === "new-bank-transfer")).toBe(true);
    const salesOrder = actions.find((a) => a.id === "new-sales-order");
    expect(salesOrder?.href).toBe("/sales/orders");
    expect(salesOrder?.search).toEqual({ create: "true" });
    expect(actions.find((a) => a.id === "new-product")?.search).toEqual({ create: "true" });
    expect(actions.find((a) => a.id === "new-customer")?.search).toEqual({ kind: "customer" });
    expect(actions.find((a) => a.id === "new-recurring-invoice")?.href).toBe(
      "/sales/recurring/new",
    );
  });
  it("matches every word against label and keywords", () => {
    expect(filterPaletteActions(actions, "new bill").map((a) => a.id)).toContain("new-bill");
    expect(
      filterPaletteActions(actions, "aged rec").some((a) => a.id === "report-aged-receivables"),
    ).toBe(true);
    expect(filterPaletteActions(actions, "zzzz")).toEqual([]);
    expect(filterPaletteActions(actions, "   ")).toEqual([]);
  });
});

describe("palette suggestions", () => {
  it("offers create shortcuts and pages before anything is typed", () => {
    const s = suggestedPaletteActions(buildPaletteActions());
    expect(s.some((a) => a.group === "Create")).toBe(true);
    expect(s.some((a) => a.group === "Go to")).toBe(true);
    expect(s.every((a) => a.group !== "Reports")).toBe(true);
  });
});

describe("search term sanitiser", () => {
  it("removes filter-breaking characters", () => {
    expect(sanitiseSearchTerm('INV-1),name.eq.x"')).toBe("INV-1 name.eq.x");
    expect(sanitiseSearchTerm("50%_off")).toBe("50 off");
  });
});
