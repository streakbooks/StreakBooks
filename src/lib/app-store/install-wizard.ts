/**
 * Install wizard step model (XP-03). Activate remains fail-closed until gates pass.
 */

import {
  evaluateActivation,
  type ActivationDecision,
  type ActivationSecurityGates,
} from "@/lib/app-store/security/activation";

export type InstallWizardStepId =
  "organisation" | "permissions" | "oauth" | "mapping" | "dry_run" | "activate";

export type InstallWizardStep = {
  id: InstallWizardStepId;
  label: string;
  description: string;
};

export const INSTALL_WIZARD_STEPS: readonly InstallWizardStep[] = [
  {
    id: "organisation",
    label: "Organisation",
    description: "Confirm the target company and country eligibility.",
  },
  {
    id: "permissions",
    label: "Permissions",
    description: "Review module scopes the connector may access.",
  },
  {
    id: "oauth",
    label: "Authorization",
    description: "Provider OAuth / API credentials (blocked until configured).",
  },
  {
    id: "mapping",
    label: "Mapping",
    description: "Map accounts, tax and products before sync.",
  },
  {
    id: "dry_run",
    label: "Dry run",
    description: "Preview imports without posting to the ledger.",
  },
  {
    id: "activate",
    label: "Activate",
    description: "Enable live sync only when every security gate passes.",
  },
] as const;

export function installWizardStepIndex(id: InstallWizardStepId): number {
  return INSTALL_WIZARD_STEPS.findIndex((s) => s.id === id);
}

export function canAdvanceInstallWizard(input: {
  current: InstallWizardStepId;
  companySelected: boolean;
  permissionsAcknowledged: boolean;
  oauthConfigured: boolean;
  mappingComplete: boolean;
  dryRunSucceeded: boolean;
  activationGates: ActivationSecurityGates;
}): { ok: boolean; reason: string; activation: ActivationDecision } {
  const activation = evaluateActivation(input.activationGates);

  switch (input.current) {
    case "organisation":
      return input.companySelected
        ? { ok: true, reason: "Organisation confirmed.", activation }
        : { ok: false, reason: "Select an organisation first.", activation };
    case "permissions":
      return input.permissionsAcknowledged
        ? { ok: true, reason: "Permissions acknowledged.", activation }
        : { ok: false, reason: "Acknowledge required permissions.", activation };
    case "oauth":
      return input.oauthConfigured
        ? { ok: true, reason: "Authorization ready.", activation }
        : {
            ok: false,
            reason: "Provider OAuth is not configured for this connector.",
            activation,
          };
    case "mapping":
      return input.mappingComplete
        ? { ok: true, reason: "Mappings complete.", activation }
        : { ok: false, reason: "Complete required field mappings.", activation };
    case "dry_run":
      return input.dryRunSucceeded
        ? { ok: true, reason: "Dry run succeeded.", activation }
        : { ok: false, reason: "Dry run has not succeeded.", activation };
    case "activate":
      return activation.allowed
        ? { ok: true, reason: activation.reason, activation }
        : { ok: false, reason: activation.reason, activation };
    default:
      return { ok: false, reason: "Unknown wizard step.", activation };
  }
}
