import { platformRoleAllows, type PlatformRoleName } from "./platform-roles";

export function createAlertRule(input: {
  role: PlatformRoleName;
  name: string;
  threshold: number;
  reason: string;
}): {
  stored: false;
  firesOnMissing: false;
  name: string;
  threshold: number;
  audit: { action: "alert.create"; reason: string };
} {
  if (!platformRoleAllows(input.role, "notifications.manage")) {
    throw new Error("Platform permission required");
  }
  const name = input.name.trim();
  const reason = input.reason.trim();
  if (name.length < 2 || name.length > 80) throw new Error("Name the alert");
  if (!Number.isInteger(input.threshold) || input.threshold < 0) {
    throw new Error("Threshold must be a whole number");
  }
  if (reason.length < 3) throw new Error("A reason is required");
  return {
    stored: false,
    firesOnMissing: false,
    name,
    threshold: input.threshold,
    audit: { action: "alert.create", reason },
  };
}

export function evaluateAlert(input: {
  role: PlatformRoleName;
  observed: number | null;
  threshold: number;
}): { status: "unknown" | "firing" | "quiet"; fired: boolean } {
  if (!platformRoleAllows(input.role, "notifications.view")) {
    throw new Error("Platform permission required");
  }
  if (input.observed === null) return { status: "unknown", fired: false };
  if (!Number.isInteger(input.observed) || !Number.isInteger(input.threshold)) {
    throw new Error("Observed value must be a whole number");
  }
  const fired = input.observed > input.threshold;
  return { status: fired ? "firing" : "quiet", fired };
}
