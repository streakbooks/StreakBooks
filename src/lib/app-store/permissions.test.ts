import { describe, expect, it } from "vitest";
import { PERMISSIONS, roleHasPermission } from "@/lib/permissions";

const APPSTORE_PERMISSIONS = [
  "appstore.view",
  "appstore.request_install",
  "appstore.install",
  "appstore.manage_connections",
  "appstore.manage_mappings",
  "appstore.view_sync",
  "appstore.resolve_exceptions",
  "appstore.advise",
  "appstore.manage_certification",
  "developer.manage_apps",
  "developer.submit_apps",
  "developer.partner_manage",
  "developer.view_analytics",
  "developer.view_usage",
] as const;

describe("app store permissions", () => {
  it("registers marketplace and developer permissions", () => {
    for (const key of APPSTORE_PERMISSIONS) {
      expect(PERMISSIONS).toContain(key);
    }
  });

  it("grants view to standard roles and install to owners/admins", () => {
    expect(roleHasPermission("read_only", "appstore.view")).toBe(true);
    expect(roleHasPermission("staff", "appstore.request_install")).toBe(true);
    expect(roleHasPermission("staff", "appstore.install")).toBe(false);
    expect(roleHasPermission("admin", "appstore.install")).toBe(true);
    expect(roleHasPermission("owner", "developer.manage_apps")).toBe(true);
    expect(roleHasPermission("accountant", "developer.manage_apps")).toBe(false);
    expect(roleHasPermission("accountant", "appstore.advise")).toBe(true);
    expect(roleHasPermission("staff", "appstore.advise")).toBe(false);
  });
});
