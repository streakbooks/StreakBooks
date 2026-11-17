import { describe, expect, it } from "vitest";
import { resolvedDraftPriceList, usableCustomerPriceList } from "./customer-price-list-rules";

describe("customer price-list selection", () => {
  const activeList = {
    id: "list-a",
    is_active: true,
    currency_code: "USD",
  };

  it("allows active same-currency lists only", () => {
    expect(usableCustomerPriceList(activeList, "USD")).toBe("list-a");
    expect(usableCustomerPriceList(activeList, "EUR")).toBeNull();
    expect(usableCustomerPriceList({ ...activeList, is_active: false }, "USD")).toBeNull();
    expect(usableCustomerPriceList(null, "USD")).toBeNull();
  });

  it("uses the customer default when the user has not manually selected", () => {
    expect(resolvedDraftPriceList(null, "customer-list")).toBe("customer-list");
    expect(resolvedDraftPriceList(null, null)).toBe("");
  });

  it("keeps manual override even when another customer default is available", () => {
    expect(resolvedDraftPriceList("manual-list", "customer-list")).toBe("manual-list");
    expect(resolvedDraftPriceList("", "customer-list")).toBe("");
  });
});
