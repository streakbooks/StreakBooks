import { describe, expect, it } from "vitest";
import { integrationHealth } from "./integration-health";

describe("integration health", () => {
  it("reports configuration without calling a provider", () => {
    const health = integrationHealth({
      role: "platform_owner",
      stripeConfigured: false,
      razorpayConfigured: false,
      reason: "Daily check",
    });
    expect(health).toEqual({
      stripe: "missing",
      razorpay: "missing",
      providerCalled: false,
      audit: { action: "integrations.health.read", reason: "Daily check" },
    });
  });

  it("refuses a role that cannot view integrations", () => {
    expect(() =>
      integrationHealth({
        role: "platform_finance",
        stripeConfigured: true,
        razorpayConfigured: false,
        reason: "Daily check",
      }),
    ).toThrow(/permission/);
  });
});
