/** Permission matrix from private.platform_can in 20261102120000. */
const PLATFORM_PERMISSIONS = [
  "overview.view",
  "businesses.view",
  "businesses.manage",
  "firms.view",
  "firms.manage",
  "users.view",
  "users.manage",
  "roles.view",
  "roles.manage",
  "subscriptions.view",
  "billing.view",
  "billing.manage",
  "accounting.view",
  "accounting.manage",
  "features.view",
  "features.manage",
  "integrations.view",
  "integrations.manage",
  "api.view",
  "api.manage",
  "monitoring.view",
  "audit.view",
  "support.view",
  "support.manage",
  "notifications.view",
  "notifications.manage",
  "settings.view",
  "settings.manage",
  "approvals.view",
  "approvals.manage",
] as const;

const FINANCE = [
  "overview.view",
  "subscriptions.view",
  "billing.view",
  "billing.manage",
  "approvals.view",
] as const;

const SUPPORT = [
  "overview.view",
  "businesses.view",
  "users.view",
  "firms.view",
  "support.view",
  "support.manage",
  "notifications.view",
] as const;

export type PlatformRoleName =
  "platform_owner" | "platform_finance" | "platform_support" | "custom";

export function platformRoleAllows(role: PlatformRoleName, permission: string): boolean {
  if (role === "platform_owner") return permission.trim().length > 0;
  if (role === "platform_finance") return FINANCE.includes(permission as never);
  if (role === "platform_support") return SUPPORT.includes(permission as never);
  return false;
}

export const platformPermissionCatalogue = PLATFORM_PERMISSIONS;
