import { describe, expect, it } from "vitest";
import { buildIntegrationHealth, integrationStatusLabel, integrationStatusTone } from "./integration-health";
describe("integration configuration evidence", () => {
  it.each([
    [false, false, "not_configured"],
    [true, false, "configured"],
    [false, true, "restricted"],
    [true, true, "restricted"],
  ] as const)("email configured=%s demo=%s has status %s", (emailConfigured, isDemo, expected) => {
    const health = buildIntegrationHealth({ emailConfigured, isDemo });
    const email = health.find((integration) => integration.key === "email")!;
    expect(email.status).toBe(expected);
    expect(integrationStatusLabel(email.status)).not.toBe("Unavailable");
    expect(
      health
        .filter((integration) => integration.key !== "email")
        .every((integration) => integration.status === "unavailable"),
    ).toBe(true);
  });
  it("distinguishes configuration, missing setup, restricted and unavailable without claiming connection", () => {
    expect(integrationStatusTone("configured")).toBe("info");
    expect(integrationStatusTone("not_configured")).toBe("warning");
    expect(integrationStatusTone("restricted")).toBe("neutral");
    expect(integrationStatusTone("unavailable")).toBe("neutral");
    expect(integrationStatusLabel("configured")).toBe("Configured");
    expect(integrationStatusLabel("configured")).not.toBe("Connected");
  });
  it("does not claim delivery verification from credential presence", () => {
    const email = buildIntegrationHealth({ emailConfigured: true, isDemo: false })[0]!;
    expect(email.detail).toContain("configuration alone does not prove delivery");
    expect(email.name).toBe("Document email");
  });
});
