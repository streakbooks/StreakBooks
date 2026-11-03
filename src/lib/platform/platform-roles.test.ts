import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { platformPermissionCatalogue, platformRoleAllows } from "./platform-roles";

describe("platform roles", () => {
  it("matches the November permission lists", () => {
    const sql = readFileSync(
      new URL(
        "../../../supabase/migrations/20261102120000_entitlement_price_book.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(sql).toContain(
      "platform_finance' AND _permission IN ('overview.view', 'subscriptions.view', 'billing.view', 'billing.manage', 'approvals.view')",
    );
    expect(sql).toContain(
      "platform_support' AND _permission IN ('overview.view', 'businesses.view', 'users.view', 'firms.view', 'support.view', 'support.manage', 'notifications.view')",
    );
  });

  it("keeps finance away from support and support away from billing", () => {
    expect(platformRoleAllows("platform_owner", "approvals.manage")).toBe(true);
    expect(platformRoleAllows("platform_owner", "not.a.catalogue.key")).toBe(true);
    expect(platformRoleAllows("platform_finance", "approvals.manage")).toBe(false);
    expect(platformRoleAllows("platform_finance", "billing.manage")).toBe(true);
    expect(platformRoleAllows("platform_finance", "support.manage")).toBe(false);
    expect(platformRoleAllows("platform_support", "billing.manage")).toBe(false);
    expect(platformRoleAllows("platform_support", "support.manage")).toBe(true);
    expect(platformRoleAllows("custom", "overview.view")).toBe(false);
    expect(platformPermissionCatalogue).toHaveLength(30);
  });
});
