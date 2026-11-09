/** CRM territories stay fail-closed until assignment-rule backends exist. */

export type CrmTerritoryPolicy = {
  canManageTerritories: boolean;
  reason: string;
};

export function resolveCrmTerritoryPolicy(input?: {
  backendReady?: boolean;
}): CrmTerritoryPolicy {
  if (input?.backendReady) {
    return {
      canManageTerritories: true,
      reason: "Territory assignment rules are available for this organisation.",
    };
  }
  return {
    canManageTerritories: false,
    reason:
      "Territories and assignment rules stay disabled until rule storage, ownership reassignment, and audit backends ship. Team workload below uses company members only.",
  };
}
