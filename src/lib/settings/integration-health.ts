export type IntegrationHealth = {
  key: string;
  name: string;
  status: "configured" | "not_configured" | "restricted" | "unavailable";
  detail: string;
};
export function integrationStatusLabel(status: IntegrationHealth["status"]): string {
  return {
    configured: "Configured",
    not_configured: "Not configured",
    restricted: "Restricted in Demo Company",
    unavailable: "Unavailable",
  }[status];
}
/** Configuration evidence only. Never treat the presence of credentials as a successful delivery. */
export function buildIntegrationHealth({
  emailConfigured,
  isDemo,
}: {
  emailConfigured: boolean;
  isDemo: boolean;
}): IntegrationHealth[] {
  return [
    {
      key: "email",
      name: "Document email",
      status: isDemo ? "restricted" : emailConfigured ? "configured" : "not_configured",
      detail: isDemo
        ? "Outbound document email is disabled in Demo Company. Print and PDF remain available."
        : emailConfigured
          ? "Email transport is configured. Sender verification and successful delivery must be checked under Notifications & Communications; configuration alone does not prove delivery."
          : "Email transport is not configured. Print or save a PDF and send it using your own email program.",
    },
    {
      key: "fx",
      name: "Live FX feed",
      status: "unavailable",
      detail:
        "No live FX provider is implemented. Manual exchange rates remain available; posted transactions keep their recorded rates.",
    },
    {
      key: "banking",
      name: "Bank aggregator",
      status: "unavailable",
      detail:
        "No live bank-feed provider is implemented. Import bank statements through Banking → Import CSV.",
    },
    {
      key: "payments",
      name: "Payment gateway",
      status: "unavailable",
      detail:
        "Online payment collection is not implemented. Record payments through the existing sales and purchasing workflows.",
    },
  ];
}
