import { describe, expect, it } from "vitest";
import { resolveCrmPublicFormsPolicy } from "@/lib/crm/public-forms-policy";

describe("resolveCrmPublicFormsPolicy", () => {
  it("fails closed by default", () => {
    const policy = resolveCrmPublicFormsPolicy();
    expect(policy.canPublishForms).toBe(false);
    expect(policy.canAcceptSubmissions).toBe(false);
  });

  it("allows publish when intakeReady", () => {
    expect(resolveCrmPublicFormsPolicy({ intakeReady: true }).canPublishForms).toBe(true);
  });
});
