import { platformRoleAllows, type PlatformRoleName } from "./platform-roles";

export type AiGovernance = {
  status: "killed" | "denied" | "capped" | "no_cap" | "allowed";
  allowed: boolean;
  spendMinor: number | null;
  providerCalled: false;
};

/** A missing unit price stays null. A missing usage counter is zero, matching usage_counters. */
export function governAiQuery(input: {
  role: PlatformRoleName;
  source: string;
  allowed: boolean;
  cap: number | null;
  used: number | null;
  unitCostMinor: number | null;
}): AiGovernance {
  if (!platformRoleAllows(input.role, "features.view")) {
    throw new Error("Platform permission required");
  }
  const used = input.used ?? 0;
  if (!Number.isInteger(used) || used < 0) throw new Error("Usage must be a whole number");
  const spendMinor =
    input.unitCostMinor === null
      ? null
      : Number.isInteger(input.unitCostMinor) && input.unitCostMinor >= 0
        ? used * input.unitCostMinor
        : null;
  if (input.source === "kill_switch" && !input.allowed) {
    return { status: "killed", allowed: false, spendMinor, providerCalled: false };
  }
  if (!input.allowed) {
    return { status: "denied", allowed: false, spendMinor, providerCalled: false };
  }
  if (input.cap === null) {
    return { status: "no_cap", allowed: true, spendMinor, providerCalled: false };
  }
  if (!Number.isInteger(input.cap) || input.cap < 0) throw new Error("Cap must be a whole number");
  if (used >= input.cap) {
    return { status: "capped", allowed: false, spendMinor, providerCalled: false };
  }
  return { status: "allowed", allowed: true, spendMinor, providerCalled: false };
}
