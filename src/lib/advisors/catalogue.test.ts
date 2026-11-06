import { describe, expect, it } from "vitest";
import {
  ADVISORS_EXCLUSIONS,
  ADVISORS_LANDING,
  DEFAULT_ADVISOR_SERVICES,
  formatAdvisorPlanPrice,
  getDefaultAdvisorService,
  isAdvisorServiceCode,
  normalizePublicAdvisorCatalogue,
} from "@/lib/advisors/catalogue";

describe("advisors catalogue", () => {
  it("exposes exactly two customer-facing services", () => {
    expect(DEFAULT_ADVISOR_SERVICES).toHaveLength(2);
    expect(DEFAULT_ADVISOR_SERVICES.map((service) => service.code)).toEqual([
      "bookkeeping",
      "coaching",
    ]);
  });

  it("keeps approved landing copy", () => {
    expect(ADVISORS_LANDING.brandTitle).toBe("LinkBooks Advisors");
    expect(ADVISORS_LANDING.heading).toBe("Your business deserves better financial clarity.");
    expect(DEFAULT_ADVISOR_SERVICES[0]?.ctaLabel).toBe("Choose this service");
    expect(DEFAULT_ADVISOR_SERVICES[0]?.startingLabel).toBe("Starting from $199/month");
    expect(DEFAULT_ADVISOR_SERVICES[1]?.startingLabel).toBe("Starting from $79/session");
  });

  it("seeds three bookkeeping and three coaching plans", () => {
    expect(getDefaultAdvisorService("bookkeeping").plans).toHaveLength(3);
    expect(getDefaultAdvisorService("coaching").plans).toHaveLength(3);
    expect(formatAdvisorPlanPrice(getDefaultAdvisorService("bookkeeping").plans[0]!)).toBe(
      "$199/month",
    );
    expect(formatAdvisorPlanPrice(getDefaultAdvisorService("coaching").plans[0]!)).toBe(
      "$79/session",
    );
  });

  it("lists transparent pricing exclusions", () => {
    expect(ADVISORS_EXCLUSIONS).toContain("Tax return preparation and filing");
    expect(ADVISORS_EXCLUSIONS.length).toBeGreaterThanOrEqual(6);
  });

  it("validates service codes and falls back when RPC payload is empty", () => {
    expect(isAdvisorServiceCode("bookkeeping")).toBe(true);
    expect(isAdvisorServiceCode("payroll")).toBe(false);
    expect(normalizePublicAdvisorCatalogue([])).toEqual(DEFAULT_ADVISOR_SERVICES);
  });

  it("merges published RPC payloads onto defaults", () => {
    const merged = normalizePublicAdvisorCatalogue([
      {
        code: "bookkeeping",
        startingLabel: "Starting from $205/month",
        startingAmountMinor: 20_500,
        plans: [
          {
            code: "essential_books",
            amountMinor: 20_500,
            name: "Essential Books",
          },
        ],
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.startingLabel).toBe("Starting from $205/month");
    expect(merged[0]?.plans[0]?.amountMinor).toBe(20_500);
    expect(merged[0]?.benefits.length).toBeGreaterThan(0);
  });
});
