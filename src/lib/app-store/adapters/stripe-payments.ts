import type { ProviderAdapter } from "@/lib/app-store/adapters/types";

/**
 * Native merchant Stripe connector scaffold.
 * Separate from LinkBooks SaaS billing Stripe integration.
 * Not E2E verified for merchant payout reconciliation.
 */
export const stripePaymentsAdapter: ProviderAdapter = {
  code: "stripe_payments",
  kind: "native",
  displayName: "Stripe",
  implementationStatus: "adapter_scaffolded",
  supportedSync: ["one_way_import", "webhook", "scheduled", "incremental"],
  installEligible: false,
  async beginAuthorization() {
    return {
      type: "oauth2",
      authorizeUrl: null,
      instructions:
        "Merchant Stripe Connect OAuth is not configured for App Store installs. Platform billing Stripe keys must not be reused as merchant connector credentials.",
    };
  },
  async validateConnection() {
    return {
      ok: false,
      externalAccountLabel: null,
      message:
        "Merchant Stripe connection validation requires Connect OAuth and E2E payout sync verification.",
      probedAt: new Date().toISOString(),
    };
  },
  async dryRunSync() {
    return {
      discovered: 0,
      wouldImport: 0,
      wouldSkip: 0,
      wouldFail: 0,
      notes: ["Merchant Stripe charge/fee/payout sync has not been E2E verified."],
    };
  },
};
