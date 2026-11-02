import { platformRoleAllows, type PlatformRoleName } from "./platform-roles";

export type Customer360 = {
  status: "missing" | "ready";
  companyId: string | null;
  name: string | null;
  planCode: string | null;
  subscriptionStatus: string | null;
  userCount: number | null;
  isDemo: boolean | null;
  ledgerIncluded: false;
};

export function customer360(input: {
  role: PlatformRoleName;
  business: {
    id: string;
    name: string;
    planCode: string | null;
    subscriptionStatus: string | null;
    userCount: number | null;
    isDemo: boolean;
  } | null;
}): Customer360 {
  if (!platformRoleAllows(input.role, "businesses.view")) {
    throw new Error("Platform permission required");
  }
  if (input.business === null) {
    return {
      status: "missing",
      companyId: null,
      name: null,
      planCode: null,
      subscriptionStatus: null,
      userCount: null,
      isDemo: null,
      ledgerIncluded: false,
    };
  }
  return {
    status: "ready",
    companyId: input.business.id,
    name: input.business.name,
    planCode: input.business.planCode,
    subscriptionStatus: input.business.subscriptionStatus,
    userCount: input.business.userCount,
    isDemo: input.business.isDemo,
    ledgerIncluded: false,
  };
}
