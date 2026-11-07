/**
 * Third-party app security verification + administrator approval gates.
 * Public listing / real-data activation stays locked until every check passes.
 */

export const SECURITY_REVIEW_CHECKLIST = [
  {
    key: "data_minimization",
    label: "Least-privilege scopes and data minimization documented",
  },
  {
    key: "tenant_isolation",
    label: "Company-specific authorization and no cross-tenant data paths",
  },
  {
    key: "credential_handling",
    label: "Credentials stored server-side only; no client secret exposure",
  },
  {
    key: "webhook_security",
    label: "Webhook signatures, replay protection and payload validation",
  },
  {
    key: "audit_logging",
    label: "Audit events for install, sync, consent and revoke",
  },
  {
    key: "incident_response",
    label: "Revocation and emergency suspension path verified",
  },
] as const;

export type SecurityChecklistKey = (typeof SECURITY_REVIEW_CHECKLIST)[number]["key"];

export type SecurityReviewDecisionInput = {
  checklist: Partial<Record<SecurityChecklistKey, boolean>>;
  adminApproved: boolean;
  e2eVerified: boolean;
  suspended: boolean;
};

export type SecurityReviewDecision = {
  canPublish: boolean;
  canEnableRealCustomerData: boolean;
  missingChecklist: SecurityChecklistKey[];
  reason: string;
};

export function evaluateSecurityReview(input: SecurityReviewDecisionInput): SecurityReviewDecision {
  const missingChecklist = SECURITY_REVIEW_CHECKLIST.map((item) => item.key).filter(
    (key) => input.checklist[key] !== true,
  );

  if (input.suspended) {
    return {
      canPublish: false,
      canEnableRealCustomerData: false,
      missingChecklist,
      reason: "Application is suspended.",
    };
  }

  if (missingChecklist.length > 0) {
    return {
      canPublish: false,
      canEnableRealCustomerData: false,
      missingChecklist,
      reason: `Security checklist incomplete: ${missingChecklist.join(", ")}.`,
    };
  }

  if (!input.adminApproved) {
    return {
      canPublish: false,
      canEnableRealCustomerData: false,
      missingChecklist,
      reason: "Administrator security approval is required before public listing.",
    };
  }

  if (!input.e2eVerified) {
    return {
      canPublish: true,
      canEnableRealCustomerData: false,
      missingChecklist,
      reason:
        "May be listed after approval, but real customer data stays locked until E2E verification.",
    };
  }

  return {
    canPublish: true,
    canEnableRealCustomerData: true,
    missingChecklist,
    reason: "Security verification and administrator approval satisfied.",
  };
}
