import { platformRoleAllows, type PlatformRoleName } from "./platform-roles";

export function backupVisibility(input: {
  role: PlatformRoleName;
  pitrEnabled: boolean | null;
  backupCount: number | null;
}): { status: "unknown" | "no_restore_point" | "listed"; restorePoint: boolean } {
  if (!platformRoleAllows(input.role, "monitoring.view")) {
    throw new Error("Platform permission required");
  }
  if (input.pitrEnabled === null || input.backupCount === null) {
    return { status: "unknown", restorePoint: false };
  }
  if (!input.pitrEnabled && input.backupCount === 0) {
    return { status: "no_restore_point", restorePoint: false };
  }
  return { status: "listed", restorePoint: input.pitrEnabled || input.backupCount > 0 };
}
