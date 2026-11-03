import { describe, expect, it } from "vitest";
import { buildBreadcrumbs } from "./breadcrumbs";

describe("buildBreadcrumbs", () => {
  it("has no trail on the dashboard", () => {
    expect(buildBreadcrumbs("/")).toEqual([]);
  });
  it("uses the nav label for the module", () => {
    expect(buildBreadcrumbs("/products-services")).toEqual([
      { label: "Products & Services", to: "/products-services", current: true },
    ]);
  });
  it("humanises nested segments and hides record ids", () => {
    const crumbs = buildBreadcrumbs("/sales/credit-notes/0b8b0a4e-3a9f-4a53-9d2a-1f7a2e0c9d11");
    expect(crumbs.map((c) => c.label)).toEqual(["Sales", "Credit notes", "Details"]);
    expect(crumbs.map((c) => c.current)).toEqual([false, false, true]);
    expect(crumbs[1]?.to).toBe("/sales/credit-notes");
  });
  it("keeps invoice branding under sales settings with real ancestor routes", () => {
    expect(buildBreadcrumbs("/documents/branding")).toEqual([
      { label: "Sales", to: "/sales", current: false },
      { label: "Settings", to: "/sales/settings", current: false },
      { label: "Invoice themes & branding", to: "/documents/branding", current: true },
    ]);
  });
  it("returns purchase branding to purchase settings", () => {
    expect(
      buildBreadcrumbs("/documents/branding", "purchases")
        .slice(0, 2)
        .map((c) => c.to),
    ).toEqual(["/purchases", "/purchases/settings"]);
  });
  it("labels new/edit screens", () => {
    expect(buildBreadcrumbs("/purchases/bills/new").map((c) => c.label)).toEqual([
      "Purchases",
      "Bills",
      "New",
    ]);
  });
});
