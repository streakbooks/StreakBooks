/**
 * Sync job enqueue helpers — fail closed without E2E + vault.
 * Does not invent job rows; callers must persist via authorized RPCs when available.
 */

import { isConnectorE2EVerified } from "@/lib/app-store/connector-status";
import type { ConnectorImplementationStatus } from "@/lib/app-store/connector-status";
import { evaluateActivation } from "@/lib/app-store/security/activation";

export type EnqueueSyncRequest = {
  companyId: string;
  appCode: string;
  connectionId: string | null;
  trigger: "manual" | "scheduled" | "webhook";
  implementationStatus: ConnectorImplementationStatus;
  securityReviewPassed: boolean;
  realCustomerDataEnabled: boolean;
  suspended: boolean;
  hasInstallPermission: boolean;
  oauthVaultConfigured: boolean;
};

export type EnqueueSyncDecision =
  | {
      allowed: true;
      correlationId: string;
      mode: "dry_run" | "live";
    }
  | {
      allowed: false;
      reason: string;
    };

function newCorrelationId(appCode: string): string {
  const stamp = Date.now().toString(36);
  return `sync:${appCode}:${stamp}`;
}

/** Decide whether a sync job may be enqueued. Live mode requires every gate. */
export function decideEnqueueSyncJob(input: EnqueueSyncRequest): EnqueueSyncDecision {
  const activation = evaluateActivation({
    implementationStatus: input.implementationStatus,
    securityReviewPassed: input.securityReviewPassed,
    realCustomerDataEnabled: input.realCustomerDataEnabled,
    suspended: input.suspended,
    hasInstallPermission: input.hasInstallPermission,
  });

  if (!activation.gates.notSuspended) {
    return { allowed: false, reason: activation.reason };
  }

  if (!isConnectorE2EVerified(input.implementationStatus)) {
    return {
      allowed: false,
      reason: "FAIL CLOSED: sync enqueue blocked until E2E synchronization is verified.",
    };
  }

  if (!input.oauthVaultConfigured) {
    return {
      allowed: false,
      reason: "FAIL CLOSED: OAuth token vault is not configured.",
    };
  }

  if (!activation.allowed) {
    return { allowed: false, reason: `FAIL CLOSED: ${activation.reason}` };
  }

  return {
    allowed: true,
    correlationId: newCorrelationId(input.appCode),
    mode: "live",
  };
}

/** Dry-run enqueue is still blocked without E2E — avoids fake success paths. */
export function decideDryRunEnqueue(input: Pick<EnqueueSyncRequest, "implementationStatus" | "suspended">): EnqueueSyncDecision {
  if (input.suspended) {
    return { allowed: false, reason: "Application is suspended." };
  }
  if (!isConnectorE2EVerified(input.implementationStatus)) {
    return {
      allowed: false,
      reason: "Dry-run enqueue stays blocked until the connector is E2E verified.",
    };
  }
  return {
    allowed: true,
    correlationId: newCorrelationId("dry-run"),
    mode: "dry_run",
  };
}
