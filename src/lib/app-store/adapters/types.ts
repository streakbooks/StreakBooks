import type {
  ConnectorImplementationStatus,
  ConnectorKind,
} from "@/lib/app-store/connector-status";
import type { SyncCapability } from "@/lib/app-store/catalogue";

/**
 * Provider adapter contract. Native connectors implement this interface.
 * Partner apps use the public API instead of an in-repo adapter.
 *
 * A connector is never considered complete until real E2E synchronization
 * is verified and implementationStatus is set to e2e_verified with evidence.
 */

export type AdapterAuthChallenge = {
  type: "oauth2" | "api_key" | "none";
  authorizeUrl: string | null;
  instructions: string;
};

export type AdapterConnectionProbe = {
  ok: boolean;
  externalAccountLabel: string | null;
  message: string;
  probedAt: string;
};

export type AdapterSyncDryRunResult = {
  discovered: number;
  wouldImport: number;
  wouldSkip: number;
  wouldFail: number;
  notes: string[];
};

export type ProviderAdapter = {
  code: string;
  kind: ConnectorKind;
  displayName: string;
  implementationStatus: ConnectorImplementationStatus;
  supportedSync: readonly SyncCapability[];
  /** Whether Install may start a real authorization flow. */
  installEligible: boolean;
  beginAuthorization(input: {
    companyId: string;
    redirectUri: string;
  }): Promise<AdapterAuthChallenge>;
  validateConnection(input: {
    companyId: string;
    connectionId: string;
  }): Promise<AdapterConnectionProbe>;
  dryRunSync(input: { companyId: string; connectionId: string }): Promise<AdapterSyncDryRunResult>;
};

export function assertNotE2EVerified(adapter: ProviderAdapter): void {
  if (adapter.implementationStatus === "e2e_verified" && !adapter.installEligible) {
    throw new Error(`${adapter.code}: e2e_verified adapters must be installEligible`);
  }
}
