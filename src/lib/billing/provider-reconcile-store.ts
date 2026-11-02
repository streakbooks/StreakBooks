import { platformRoleAllows, type PlatformRoleName } from "@/lib/platform/platform-roles";
import type { ProviderReconciliation } from "./provider-reconcile";

export function planStoredReconciliation(input: {
  role: PlatformRoleName;
  result: ProviderReconciliation;
  reason: string;
}): { persist: boolean; providerCalled: false; state: ProviderReconciliation["state"] } {
  if (!platformRoleAllows(input.role, "billing.manage")) {
    throw new Error("Platform permission required");
  }
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("A reason is required");
  if (input.result.providerCalled !== false) throw new Error("A provider was called");
  const persist = input.result.state === "match" || input.result.state === "mismatch";
  return { persist, providerCalled: false, state: input.result.state };
}
