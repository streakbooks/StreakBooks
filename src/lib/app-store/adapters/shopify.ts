import type { ProviderAdapter } from "@/lib/app-store/adapters/types";
import { assertRealDataAccessAllowed } from "@/lib/app-store/security/activation";

/** Native Shopify adapter scaffold — not E2E verified. Fail closed for real data. */
export const shopifyAdapter: ProviderAdapter = {
  code: "shopify",
  kind: "native",
  displayName: "Shopify",
  implementationStatus: "adapter_scaffolded",
  supportedSync: ["one_way_import", "webhook", "scheduled", "historical_import", "incremental"],
  installEligible: false,
  async beginAuthorization() {
    assertRealDataAccessAllowed({
      implementationStatus: "adapter_scaffolded",
      securityReviewPassed: false,
      realCustomerDataEnabled: false,
      suspended: false,
      hasInstallPermission: true,
    });
    return {
      type: "oauth2",
      authorizeUrl: null,
      instructions:
        "Shopify OAuth client credentials are not configured. Register a Shopify app and set SHOPIFY_API_KEY / SHOPIFY_API_SECRET before authorization can start.",
    };
  },
  async validateConnection() {
    return {
      ok: false,
      externalAccountLabel: null,
      message:
        "Shopify connection validation is not available until credentials and E2E sync are verified.",
      probedAt: new Date().toISOString(),
    };
  },
  async dryRunSync() {
    return {
      discovered: 0,
      wouldImport: 0,
      wouldSkip: 0,
      wouldFail: 0,
      notes: ["Dry-run unavailable. Shopify Admin API sync has not been E2E verified."],
    };
  },
};
