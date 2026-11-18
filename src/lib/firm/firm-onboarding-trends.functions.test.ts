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

import { firmOnboardingTrendInput } from "./firm-onboarding-trends.functions";

describe("firm onboarding historical query input", () => {
  const firmId = "9e39add8-d585-46cb-ac80-f38b67e6397f";
  it("accepts only supported 30, 60 and 90 day reporting windows", () => {
    for (const days of [30, 60, 90]) {
      expect(firmOnboardingTrendInput.safeParse({ firmId, days }).success).toBe(true);
    }
  });
  it("rejects unauthorized shapes, unsupported windows and malformed IDs", () => {
    expect(firmOnboardingTrendInput.safeParse({ firmId, days: 365 }).success).toBe(false);
    expect(firmOnboardingTrendInput.safeParse({ firmId, days: 15 }).success).toBe(false);
    expect(firmOnboardingTrendInput.safeParse({ firmId, days: "30" }).success).toBe(false);
    expect(
      firmOnboardingTrendInput.safeParse({
        firmId,
        days: 30,
        userId: firmId,
      }).success,
    ).toBe(false);
    expect(
      firmOnboardingTrendInput.safeParse({
        firmId: "not-a-firm",
        days: 30,
      }).success,
    ).toBe(false);
  });
});
