import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { registerPartner } from "./partners";

describe("partner programme", () => {
  it("keeps a missing revenue share empty and creates no plan", () => {
    expect(
      registerPartner({
        role: "platform_owner",
        name: "North Advisory",
        reason: "Agreed",
        revenueShareMinor: null,
      }),
    ).toEqual({
      stored: false,
      planCreated: false,
      name: "North Advisory",
      revenueShareMinor: null,
      audit: { action: "partner.register", reason: "Agreed" },
    });
  });

  it("refuses support and does not insert a billing plan", () => {
    expect(() =>
      registerPartner({
        role: "platform_support",
        name: "North Advisory",
        reason: "Agreed",
        revenueShareMinor: null,
      }),
    ).toThrow(/permission/);
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102310000_partners.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql).not.toContain("billing_plans");
  });
});
