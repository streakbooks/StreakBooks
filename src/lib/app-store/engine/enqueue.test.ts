import { describe, expect, it } from "vitest";
import { decideDryRunEnqueue, decideEnqueueSyncJob } from "@/lib/app-store/engine/enqueue";

describe("decideEnqueueSyncJob", () => {
  it("blocks enqueue when connector is not E2E verified", () => {
    const decision = decideEnqueueSyncJob({
      companyId: "00000000-0000-4000-8000-000000000001",
      appCode: "shopify",
      connectionId: null,
      trigger: "manual",
      implementationStatus: "adapter_scaffolded",
      securityReviewPassed: true,
      realCustomerDataEnabled: true,
      suspended: false,
      hasInstallPermission: true,
      oauthVaultConfigured: true,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/E2E/i);
  });

  it("blocks dry-run enqueue without E2E", () => {
    const decision = decideDryRunEnqueue({
      implementationStatus: "sandbox_partial",
      suspended: false,
    });
    expect(decision.allowed).toBe(false);
  });
});
