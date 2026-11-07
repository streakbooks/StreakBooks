import type { ProviderAdapter } from "@/lib/app-store/adapters/types";
import { assertRealDataAccessAllowed } from "@/lib/app-store/security/activation";

/** Native Amazon SP-API adapter scaffold — credentials blocked, not E2E verified. Fail closed. */
export const amazonSellerAdapter: ProviderAdapter = {
  code: "amazon_seller",
  kind: "native",
  displayName: "Amazon Seller Central",
  implementationStatus: "credentials_blocked",
  supportedSync: ["one_way_import", "scheduled", "historical_import", "incremental"],
  installEligible: false,
  async beginAuthorization() {
    assertRealDataAccessAllowed({
      implementationStatus: "credentials_blocked",
      securityReviewPassed: false,
      realCustomerDataEnabled: false,
      suspended: false,
      hasInstallPermission: true,
    });
    return {
      type: "oauth2",
      authorizeUrl: null,
      instructions:
        "Amazon Selling Partner API developer registration, app approval and regional credentials are required before authorization can start.",
    };
  },
  async validateConnection() {
    return {
      ok: false,
      externalAccountLabel: null,
      message: "Amazon SP-API validation blocked pending credentials and E2E verification.",
      probedAt: new Date().toISOString(),
    };
  },
  async dryRunSync() {
    return {
      discovered: 0,
      wouldImport: 0,
      wouldSkip: 0,
      wouldFail: 0,
      notes: ["Amazon settlement sync has not been E2E verified."],
    };
  },
};
