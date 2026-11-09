/** Public lead capture stays fail-closed until spam-protected edge intake exists. */

export type CrmPublicFormsPolicy = {
  canPublishForms: boolean;
  canAcceptSubmissions: boolean;
  reason: string;
};

export function resolveCrmPublicFormsPolicy(input?: {
  intakeReady?: boolean;
}): CrmPublicFormsPolicy {
  if (input?.intakeReady) {
    return {
      canPublishForms: true,
      canAcceptSubmissions: true,
      reason: "Public lead forms intake is enabled with spam protection.",
    };
  }
  return {
    canPublishForms: false,
    canAcceptSubmissions: false,
    reason:
      "Public lead forms stay disabled until a spam-protected edge intake, consent logging, and rate limits ship. No anonymous write path is exposed today.",
  };
}
