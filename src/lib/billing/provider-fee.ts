import { netRevenueMinor, type StoredAmount } from "@/lib/billing/stored-revenue";
import { platformRoleAllows, type PlatformRoleName } from "@/lib/platform/platform-roles";

export function recordProviderFee(input: {
  role: PlatformRoleName;
  grossMinor: number | null;
  feeMinor: number | null;
  reason: string;
}): {
  stored: false;
  providerCalled: false;
  net: StoredAmount;
  audit: { action: "fee.record"; reason: string };
} {
  if (!platformRoleAllows(input.role, "billing.manage")) {
    throw new Error("Platform permission required");
  }
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("A reason is required");
  if (
    input.grossMinor != null &&
    input.feeMinor != null &&
    input.feeMinor > input.grossMinor
  ) {
    throw new Error("A fee cannot exceed the charge");
  }
  return {
    stored: false,
    providerCalled: false,
    net: netRevenueMinor(input.grossMinor, input.feeMinor),
    audit: { action: "fee.record", reason },
  };
}
