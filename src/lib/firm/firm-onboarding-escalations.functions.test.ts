import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware() { return this; },
    inputValidator() { return this; },
    handler(fn: unknown) { return fn; },
  }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: {},
}));

import { saveFirmEscalationPolicyInput } from "./firm-onboarding-escalations.functions";

const valid = {
  firmId: "9e39add8-d585-46cb-ac80-f38b67e6397f",
  expectedVersion: 0,
  enabled: false,
  firstOverdueDays: 3,
  repeatEveryDays: 7,
};

describe("firm onboarding escalation policy input", () => {
  it("accepts explicit opt-in, opt-out and versioned updates", () => {
    expect(saveFirmEscalationPolicyInput.safeParse(valid).success).toBe(true);
    expect(saveFirmEscalationPolicyInput.safeParse({
      ...valid, enabled: true, firstOverdueDays: 1,
      repeatEveryDays: 30, expectedVersion: 2,
    }).success).toBe(true);
  });
  it("rejects thresholds outside the allowable range", () => {
    for (const firstOverdueDays of [0, 31, -1, 1.5]) {
      expect(saveFirmEscalationPolicyInput.safeParse({
        ...valid, firstOverdueDays,
      }).success).toBe(false);
    }
    for (const repeatEveryDays of [0, 31, -5, 2.1]) {
      expect(saveFirmEscalationPolicyInput.safeParse({
        ...valid, repeatEveryDays,
      }).success).toBe(false);
    }
  });
  it("rejects forged actor fields, bad identities and stale input shapes", () => {
    expect(saveFirmEscalationPolicyInput.safeParse({
      ...valid, updated_by: valid.firmId,
    }).success).toBe(false);
    expect(saveFirmEscalationPolicyInput.safeParse({
      ...valid, firmId: "foreign",
    }).success).toBe(false);
    expect(saveFirmEscalationPolicyInput.safeParse({
      ...valid, expectedVersion: -1,
    }).success).toBe(false);
  });
});
