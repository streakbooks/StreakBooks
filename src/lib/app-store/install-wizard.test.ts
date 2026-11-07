import { describe, expect, it } from "vitest";
import { canAdvanceInstallWizard, INSTALL_WIZARD_STEPS } from "@/lib/app-store/install-wizard";

const blockedGates = {
  implementationStatus: "adapter_scaffolded" as const,
  securityReviewPassed: false,
  realCustomerDataEnabled: false,
  suspended: false,
  hasInstallPermission: true,
};

describe("install wizard", () => {
  it("defines six XP-03 steps", () => {
    expect(INSTALL_WIZARD_STEPS.map((s) => s.id)).toEqual([
      "organisation",
      "permissions",
      "oauth",
      "mapping",
      "dry_run",
      "activate",
    ]);
  });

  it("blocks OAuth advance when credentials are missing", () => {
    const result = canAdvanceInstallWizard({
      current: "oauth",
      companySelected: true,
      permissionsAcknowledged: true,
      oauthConfigured: false,
      mappingComplete: false,
      dryRunSucceeded: false,
      activationGates: blockedGates,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/OAuth/i);
  });

  it("keeps activate locked until all security gates pass", () => {
    const result = canAdvanceInstallWizard({
      current: "activate",
      companySelected: true,
      permissionsAcknowledged: true,
      oauthConfigured: true,
      mappingComplete: true,
      dryRunSucceeded: true,
      activationGates: blockedGates,
    });
    expect(result.ok).toBe(false);
    expect(result.activation.allowed).toBe(false);
  });
});
