/** CRM territory management policy. */

export type CrmTerritoryPolicy = {
  canManageTerritories: boolean;
  reason: string;
};

export function resolveCrmTerritoryPolicy(input?: { backendReady?: boolean }): CrmTerritoryPolicy {
  if (input?.backendReady) {
    return {
      canManageTerritories: true,
      reason:
        "Territory records can be created and owned by active members. Automatic lead routing rules are not enabled yet.",
    };
  }
  return {
    canManageTerritories: false,
    reason:
      "Territories stay disabled until rule storage ships. Team workload below uses company members only.",
  };
}
