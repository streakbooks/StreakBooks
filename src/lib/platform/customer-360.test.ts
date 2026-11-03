import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { customer360 } from "./customer-360";

describe("customer 360", () => {
  it("returns subscription identity and no ledger", () => {
    const view = customer360({
      role: "platform_support",
      business: {
        id: "company-1",
        name: "Northwind",
        planCode: "growth",
        subscriptionStatus: "trialing",
        userCount: null,
        isDemo: false,
      },
    });
    expect(view.ledgerIncluded).toBe(false);
    expect(view.userCount).toBeNull();
    expect(view).not.toHaveProperty("balanceMinor");
  });

  it("refuses finance and does not read journals", () => {
    expect(() => customer360({ role: "platform_finance", business: null })).toThrow(/permission/);
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102240000_customer_360.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql).toContain("private.require_platform('businesses.view')");
    expect(sql).not.toContain("journal_lines");
    expect(sql).not.toContain("sales_invoices");
  });
});
