import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware() {
      return this;
    },
    inputValidator() {
      return this;
    },
    handler(fn: unknown) {
      return fn;
    },
  }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: {},
}));

import { saveFirmOnboardingCapacityInput } from "./firm-onboarding-workload.functions";

const input = {
  firmId: "9e39add8-d585-46cb-ac80-f38b67e6397f",
  userId: "cc46c97b-1772-4d70-93cf-58b71eb64fef",
  expectedVersion: 0,
  maxOpenSteps: 20,
};

describe("firm onboarding staff capacity input", () => {
  it("accepts valid new and versioned staff capacity settings", () => {
    expect(saveFirmOnboardingCapacityInput.safeParse(input).success).toBe(true);
    expect(
      saveFirmOnboardingCapacityInput.safeParse({
        ...input,
        expectedVersion: 3,
        maxOpenSteps: 200,
      }).success,
    ).toBe(true);
  });
  it("rejects invalid and unsafe capacity limits", () => {
    for (const limit of [0, 201, -1, 2.5, Number.NaN]) {
      expect(
        saveFirmOnboardingCapacityInput.safeParse({
          ...input,
          maxOpenSteps: limit,
        }).success,
      ).toBe(false);
    }
  });
  it("requires valid identities and a nonnegative optimistic version", () => {
    expect(
      saveFirmOnboardingCapacityInput.safeParse({
        ...input,
        expectedVersion: -1,
      }).success,
    ).toBe(false);
    expect(
      saveFirmOnboardingCapacityInput.safeParse({
        ...input,
        userId: "unknown",
      }).success,
    ).toBe(false);
    expect(
      saveFirmOnboardingCapacityInput.safeParse({
        ...input,
        actorId: "forged",
      }).success,
    ).toBe(false);
  });
});
