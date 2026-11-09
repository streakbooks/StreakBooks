import { describe, expect, it } from "vitest";
import { navItems } from "./nav";
import { activeNavItem, activeNavLabel } from "./nav-active";

/** These are all distinct, user-facing sidebar modules; aliases are not separate entries. */
const REQUIRED_MODULES = [
  ["Dashboard", "/"],
  ["Banking", "/banking"],
  ["Sales", "/sales"],
  ["Purchases", "/purchases"],
  ["Expenses", "/expense-management"],
  ["Contacts", "/contacts"],
  ["Products & Services", "/products-services"],
  ["Files", "/files"],
  ["Accounting", "/accounting"],
  ["Action Center", "/notifications"],
  ["Budgets", "/budgets"],
  ["Fixed assets", "/fixed-assets"],
  ["Payroll", "/payroll"],
  ["Reports", "/reports"],
  ["Tax", "/tax"],
  ["Accountant", "/accountant"],
  ["Firm", "/firm"],
  ["Advisors", "/advisors-admin"],
  ["Advisors portal", "/advisors-portal"],
  ["App Store", "/app-store"],
  ["Developer", "/developer"],
  ["AI Assistant", "/ai-assistant"],
  ["Settings", "/settings"],
  ["Help", "/help"],
] as const;

describe("Full LinkBooks top-level navigation coverage", () => {
  it("registers every required navigation exactly once", () => {
    expect(navItems).toHaveLength(REQUIRED_MODULES.length);
    expect(new Set(navItems.map((item) => item.to)).size).toBe(navItems.length);
    expect(new Set(navItems.map((item) => item.label)).size).toBe(navItems.length);
    for (const [label, to] of REQUIRED_MODULES) {
      expect(navItems.filter((item) => item.label === label && item.to === to)).toHaveLength(1);
    }
  });

  it("retains a usable accessible label and real path for every module", () => {
    for (const item of navItems) {
      expect(item.label.trim()).not.toBe("");
      expect(item.description.trim()).not.toBe("");
      expect(item.to.startsWith("/")).toBe(true);
      expect(activeNavLabel(item.to)).toBe(item.label);
    }
  });

  it("keeps detail and submenu paths in their parent module", () => {
    for (const item of navItems.filter((entry) => entry.to !== "/")) {
      const nested = item.to + "/example-detail";
      expect(activeNavItem(nested)?.to).toBe(item.to);
      expect(activeNavLabel(nested + "?tab=history")).toBe(item.label);
    }
  });

  it("does not confuse route prefixes or unrelated workspaces", () => {
    expect(activeNavItem("/salesforce")).toBeNull();
    expect(activeNavItem("/app-storefront")).toBeNull();
    expect(activeNavItem("/developer-tools")).toBeNull();
    expect(activeNavLabel("/")).toBe("Dashboard");
  });
});
