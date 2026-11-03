import { platformRoleAllows, type PlatformRoleName } from "./platform-roles";

export type IntegrationProbe = "configured" | "missing";

export function integrationHealth(input: {
  role: PlatformRoleName;
  stripeConfigured: boolean;
  razorpayConfigured: boolean;
  reason: string;
}): {
  stripe: IntegrationProbe;
  razorpay: IntegrationProbe;
  providerCalled: false;
  audit: { action: "integrations.health.read"; reason: string };
} {
  if (!platformRoleAllows(input.role, "integrations.view")) {
    throw new Error("Platform permission required");
  }
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("A reason is required");
  return {
    stripe: input.stripeConfigured ? "configured" : "missing",
    razorpay: input.razorpayConfigured ? "configured" : "missing",
    providerCalled: false,
    audit: { action: "integrations.health.read", reason },
  };
}
