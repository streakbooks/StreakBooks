import { describe, expect, it } from "vitest";
import { activeNavItem, activeNavLabel } from "./nav-active";
import { navItems } from "./nav";

describe("sidebar selection from the URL", () => {
  it("highlights every primary module and the dashboard", () => {
    for (const item of navItems) {
      expect(activeNavItem(item.to)?.to).toBe(item.to);
      expect(activeNavLabel(item.to)).toBe(item.label);
    }
  });

  it.each([
    ["/contacts/123", "Contacts"],
    ["/contacts/new", "Contacts"],
    ["/contacts/duplicates", "Contacts"],
    ["/banking/transactions", "Banking"],
    ["/banking/cash-coding", "Banking"],
    ["/banking/rules", "Banking"],
    ["/sales/invoices/123", "Sales"],
    ["/documents/branding", "Sales"],
    ["/sales/credit-notes/123", "Sales"],
    ["/purchases/bills/123/edit", "Purchases"],
    ["/purchases/suppliers", "Purchases"],
    ["/purchases/expenses", "Purchases"],
    ["/expense-management", "Expenses"],
    ["/expense-management/my-expenses", "Expenses"],
    ["/expense-management/claims/123", "Expenses"],
    ["/app-store", "App Store"],
    ["/app-store/explore", "App Store"],
    ["/app-store/apps/shopify", "App Store"],
    ["/developer", "Developer"],
    ["/developer/api-docs", "Developer"],
    ["/reports/general-ledger", "Reports"],
    ["/budgets/123", "Budgets"],
    ["/settings/organisation", "Settings"],
    ["/contacts/", "Contacts"],
    ["/contacts/123?tab=history", "Contacts"],
  ])("shows %s under %s", (url, label) => {
    expect(activeNavLabel(url)).toBe(label);
  });

  it("keeps purchase theme navigation in the purchase workspace", () => {
    expect(activeNavLabel("/documents/branding", "purchases")).toBe("Purchases");
    expect(activeNavLabel("/documents/branding", "invalid")).toBe("Sales");
  });
  it("does not incorrectly select the dashboard or another module by prefix", () => {
    for (const url of [
      "/contact",
      "/contactless",
      "/salesforce",
      "/reports-archive",
      "/settings-old",
      "/projects",
      "/imports",
      "/platform",
    ]) {
      expect(activeNavItem(url)).toBeNull();
      expect(activeNavLabel(url)).toBe("LinkBooks");
    }
    expect(activeNavLabel("/")).toBe("Dashboard");
    expect(activeNavLabel("/sales")).toBe("Sales");
    expect(activeNavLabel("/contacts")).toBe("Contacts");
  });

  it("chooses only one active module for every known route", () => {
    for (const item of navItems) {
      const selected = navItems.filter(
        (nav) => activeNavItem(item.to + (item.to === "/" ? "" : "/detail"))?.to === nav.to,
      );
      expect(selected.length).toBe(1);
    }
  });
});
