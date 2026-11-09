/** CRM automation engine gate — flagged off until job runners exist. */

export type CrmAutomationPolicy = {
  engineEnabled: boolean;
  canCreateRules: boolean;
  canRun: boolean;
  reason: string;
};

export function resolveCrmAutomationPolicy(input?: {
  engineEnabled?: boolean;
}): CrmAutomationPolicy {
  if (input?.engineEnabled) {
    return {
      engineEnabled: true,
      canCreateRules: true,
      canRun: true,
      reason: "CRM automation engine is enabled for this organisation.",
    };
  }
  return {
    engineEnabled: false,
    canCreateRules: false,
    canRun: false,
    reason:
      "Automation stays off until durable job runners, retry budgets, and audit logs ship. No silent triggers execute today.",
  };
}
