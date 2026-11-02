import { platformRoleAllows, type PlatformRoleName } from "@/lib/platform/platform-roles";

export function planStoredProration(input: {
  role: PlatformRoleName;
  prorationMinor: number;
  providerCalled: false;
  reason: string;
}): { stored: false; providerCalled: false; prorationMinor: number } {
  if (!platformRoleAllows(input.role, "billing.manage")) {
    throw new Error("Platform permission required");
  }
  if (!Number.isInteger(input.prorationMinor)) {
    throw new Error("Proration amount must be an integer.");
  }
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("A reason is required");
  return { stored: false, providerCalled: false, prorationMinor: input.prorationMinor };
}
