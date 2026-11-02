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
    expect(() =>
      registerPartner({
        role: "platform_owner",
        name: "North Advisory",
        reason: "Agreed",
        revenueShareMinor: null,
        exists: true,
      }),
    ).toThrow(/already exists/);
    const once = readFileSync(
      new URL("../../../supabase/migrations/20261102560000_partner_name_once.sql", import.meta.url),
      "utf8",
    );
    expect(once).toContain("platform_partners_name_key");
    expect(once).toContain("That partner already exists");
    expect(once).toContain("require_platform('firms.manage')");
    expect(once).not.toContain("billing_plans");
  });
});
