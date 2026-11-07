import { amazonSellerAdapter } from "@/lib/app-store/adapters/amazon-seller";
import { shopifyAdapter } from "@/lib/app-store/adapters/shopify";
import { stripePaymentsAdapter } from "@/lib/app-store/adapters/stripe-payments";
import type { ProviderAdapter } from "@/lib/app-store/adapters/types";
import { isConnectorE2EVerified } from "@/lib/app-store/connector-status";

const NATIVE_ADAPTERS: readonly ProviderAdapter[] = [
  shopifyAdapter,
  amazonSellerAdapter,
  stripePaymentsAdapter,
];

export function listNativeAdapters(): readonly ProviderAdapter[] {
  return NATIVE_ADAPTERS;
}

export function getProviderAdapter(code: string): ProviderAdapter | null {
  return NATIVE_ADAPTERS.find((a) => a.code === code) ?? null;
}

/** True only when adapter exists and E2E sync status is verified. */
export function isInstallableNativeConnector(code: string): boolean {
  const adapter = getProviderAdapter(code);
  if (!adapter) return false;
  return adapter.installEligible && isConnectorE2EVerified(adapter.implementationStatus);
}

export function nativePriorityRoadmap(): {
  code: string;
  displayName: string;
  status: ProviderAdapter["implementationStatus"];
  e2eVerified: boolean;
}[] {
  return NATIVE_ADAPTERS.map((a) => ({
    code: a.code,
    displayName: a.displayName,
    status: a.implementationStatus,
    e2eVerified: isConnectorE2EVerified(a.implementationStatus),
  }));
}
