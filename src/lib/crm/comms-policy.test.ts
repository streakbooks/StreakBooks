import { describe, expect, it } from "vitest";
import { resolveCrmCommsPolicy } from "@/lib/crm/comms-policy";

describe("resolveCrmCommsPolicy", () => {
  it("fails closed when no provider is configured", () => {
    const policy = resolveCrmCommsPolicy();
    expect(policy.canSend).toBe(false);
    expect(policy.canCompose).toBe(false);
    expect(policy.providerStatus).toBe("unavailable");
  });

  it("allows send only when providerConfigured is true", () => {
    const policy = resolveCrmCommsPolicy({ providerConfigured: true });
    expect(policy.canSend).toBe(true);
    expect(policy.providerStatus).toBe("configured");
  });
});
