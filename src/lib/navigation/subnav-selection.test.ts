import { describe, expect, it } from "vitest";
import { activeSubnavIndex } from "./subnav-selection";

describe("shared LinkBooks submenu active selection", () => {
  const tabs = [
    { to: "/sales", label: "Overview", exact: true },
    { to: "/sales/invoices", label: "Invoices" },
    { to: "/sales/invoices/recurring", label: "Recurring invoices" },
    { to: "/sales/quotes", label: "Quotes" },
  ] as const;

  it("selects only the most specific matching real route", () => {
    expect(activeSubnavIndex(tabs, "/sales")).toBe(0);
    expect(activeSubnavIndex(tabs, "/sales/invoices/123")).toBe(1);
    expect(activeSubnavIndex(tabs, "/sales/invoices/recurring/123")).toBe(2);
    expect(activeSubnavIndex(tabs, "/sales/quotes")).toBe(3);
  });

  it("distinguishes same-path sections with explicit search values", () => {
    const sections = [
      { to: "/reports", label: "Overview" },
      { to: "/reports", label: "Standard", search: { tab: "standard" } },
      { to: "/reports", label: "Custom", search: { tab: "custom" } },
    ] as const;
    expect(activeSubnavIndex(sections, "/reports", { tab: "standard" })).toBe(1);
    expect(activeSubnavIndex(sections, "/reports", { tab: "custom" })).toBe(2);
    expect(activeSubnavIndex(sections, "/reports", { tab: "other" })).toBe(0);
    expect(activeSubnavIndex(sections, "/reports")).toBe(0);
  });

  it("rejects path-prefix collisions, keeps trailing slashes and supports no match", () => {
    expect(activeSubnavIndex(tabs, "/salesforce")).toBe(-1);
    expect(activeSubnavIndex(tabs, "/sales/invoices/")).toBe(1);
    expect(activeSubnavIndex(tabs, "/unknown")).toBe(-1);
  });

  it("does not treat a query filter with a different value as selected", () => {
    const only = [{ to: "/accounting", label: "Journals", search: { tab: "journals" } }];
    expect(activeSubnavIndex(only, "/accounting", { tab: "coa" })).toBe(-1);
    expect(activeSubnavIndex(only, "/accounting", { tab: "journals" })).toBe(0);
  });
});
