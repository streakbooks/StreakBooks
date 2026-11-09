/** CRM outbound communications policy — fail-closed until a provider is configured. */

export type CrmCommsProviderStatus = "unavailable" | "configured";

export type CrmCommsPolicy = {
  canCompose: boolean;
  canSend: boolean;
  providerStatus: CrmCommsProviderStatus;
  reason: string;
};

export function resolveCrmCommsPolicy(input?: {
  providerConfigured?: boolean;
}): CrmCommsPolicy {
  if (input?.providerConfigured) {
    return {
      canCompose: true,
      canSend: true,
      providerStatus: "configured",
      reason: "Outbound email provider is configured.",
    };
  }
  return {
    canCompose: false,
    canSend: false,
    providerStatus: "unavailable",
    reason:
      "Outbound CRM email stays disabled until an App Store–approved email provider is connected. No silent send path exists.",
  };
}
