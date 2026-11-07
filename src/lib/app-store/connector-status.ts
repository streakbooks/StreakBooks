/**
 * Honest connector readiness. Never promote a provider to e2e_verified
 * without a real end-to-end synchronization test against a live or sandbox API.
 * Never offer Install until e2e_verified.
 */

export const CONNECTOR_IMPLEMENTATION_STATUSES = [
  /** Listed in the marketplace; no adapter code. */
  "catalogue_only",
  /** Adapter interface / stubs exist; no live API calls. */
  "adapter_scaffolded",
  /** Blocked on partner credentials, commercial agreement, or API access. */
  "credentials_blocked",
  /** Some sandbox calls work; sync/posting not fully verified. */
  "sandbox_partial",
  /** Real E2E sync verified (orders → LinkBooks → ledger) with evidence. */
  "e2e_verified",
] as const;

export type ConnectorImplementationStatus = (typeof CONNECTOR_IMPLEMENTATION_STATUSES)[number];

export const CONNECTOR_KINDS = [
  /** First-party LinkBooks adapter maintained in-repo. */
  "native",
  /** Third party integrates via LinkBooks public API / OAuth. */
  "partner_api",
  /** Hybrid: native sync plus partner-published listing. */
  "hybrid",
] as const;

export type ConnectorKind = (typeof CONNECTOR_KINDS)[number];

export function isConnectorE2EVerified(status: ConnectorImplementationStatus): boolean {
  return status === "e2e_verified";
}

export function connectorStatusLabel(status: ConnectorImplementationStatus): string {
  switch (status) {
    case "catalogue_only":
      return "Catalogue listing";
    case "adapter_scaffolded":
      return "Adapter scaffolded";
    case "credentials_blocked":
      return "Awaiting credentials";
    case "sandbox_partial":
      return "Sandbox partial";
    case "e2e_verified":
      return "E2E verified";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/**
 * Install is ONLY offered for e2e_verified connectors.
 * Everything else may express interest (request) or is blocked.
 */
export function connectorInstallActionLabel(
  status: ConnectorImplementationStatus,
): "install" | "request" | "blocked" {
  if (status === "e2e_verified") return "install";
  if (
    status === "credentials_blocked" ||
    status === "adapter_scaffolded" ||
    status === "sandbox_partial" ||
    status === "catalogue_only"
  ) {
    return "request";
  }
  return "blocked";
}
