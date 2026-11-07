/**
 * FAIL CLOSED activation gates for marketplace connectors.
 * Real customer data must never flow until every gate passes.
 */

import type { ConnectorImplementationStatus } from "@/lib/app-store/connector-status";
import { isConnectorE2EVerified } from "@/lib/app-store/connector-status";

export type ActivationSecurityGates = {
  implementationStatus: ConnectorImplementationStatus;
  securityReviewPassed: boolean;
  realCustomerDataEnabled: boolean;
  suspended: boolean;
  hasInstallPermission: boolean;
};

export type ActivationDecision = {
  allowed: boolean;
  reason: string;
  gates: {
    e2eVerified: boolean;
    securityReviewPassed: boolean;
    realCustomerDataEnabled: boolean;
    notSuspended: boolean;
    hasInstallPermission: boolean;
  };
};

export function evaluateActivation(gates: ActivationSecurityGates): ActivationDecision {
  const evaluated = {
    e2eVerified: isConnectorE2EVerified(gates.implementationStatus),
    securityReviewPassed: gates.securityReviewPassed === true,
    realCustomerDataEnabled: gates.realCustomerDataEnabled === true,
    notSuspended: gates.suspended !== true,
    hasInstallPermission: gates.hasInstallPermission === true,
  };

  if (!evaluated.notSuspended) {
    return {
      allowed: false,
      reason: "Application is suspended.",
      gates: evaluated,
    };
  }
  if (!evaluated.e2eVerified) {
    return {
      allowed: false,
      reason: "End-to-end synchronization is not verified.",
      gates: evaluated,
    };
  }
  if (!evaluated.securityReviewPassed) {
    return {
      allowed: false,
      reason: "Security review has not passed.",
      gates: evaluated,
    };
  }
  if (!evaluated.realCustomerDataEnabled) {
    return {
      allowed: false,
      reason: "Real customer data access is locked (fail closed).",
      gates: evaluated,
    };
  }
  if (!evaluated.hasInstallPermission) {
    return {
      allowed: false,
      reason: "Caller lacks appstore.install permission.",
      gates: evaluated,
    };
  }

  return {
    allowed: true,
    reason: "All security activation gates passed.",
    gates: evaluated,
  };
}

/** Hard lock used by adapters before any live provider call with customer data. */
export function assertRealDataAccessAllowed(gates: ActivationSecurityGates): void {
  const decision = evaluateActivation(gates);
  if (!decision.allowed) {
    throw new Error(`FAIL CLOSED: ${decision.reason}`);
  }
}

export function marketplaceAppActivationGates(
  app: {
    implementationStatus: ConnectorImplementationStatus;
    securityReviewPassed: boolean;
    realCustomerDataEnabled: boolean;
    suspended: boolean;
  },
  hasInstallPermission: boolean,
): ActivationSecurityGates {
  return {
    implementationStatus: app.implementationStatus,
    securityReviewPassed: app.securityReviewPassed,
    realCustomerDataEnabled: app.realCustomerDataEnabled,
    suspended: app.suspended,
    hasInstallPermission,
  };
}

export function canActivateMarketplaceApp(
  app: {
    implementationStatus: ConnectorImplementationStatus;
    securityReviewPassed: boolean;
    realCustomerDataEnabled: boolean;
    suspended: boolean;
  },
  hasInstallPermission: boolean,
): boolean {
  return evaluateActivation(marketplaceAppActivationGates(app, hasInstallPermission)).allowed;
}
