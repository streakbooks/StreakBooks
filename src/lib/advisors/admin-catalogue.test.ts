import { describe, expect, it } from "vitest";
import {
  archivePlanInPayload,
  defaultAdminCatalogue,
  formatStartingLabel,
  upsertPlanInPayload,
  validateAdminPayload,
} from "@/lib/advisors/admin-catalogue";

describe("advisors admin catalogue", () => {
  it("seeds editable bookkeeping and coaching plans with limits", () => {
    const catalogue = defaultAdminCatalogue();
    expect(catalogue.services).toHaveLength(2);
    const books = catalogue.services.find((service) => service.code === "bookkeeping");
    const coaching = catalogue.services.find((service) => service.code === "coaching");
    expect(books?.plans).toHaveLength(3);
    expect(coaching?.plans).toHaveLength(3);
    expect(books?.plans[0]?.transactionLimit).toBe(100);
    expect(coaching?.plans[0]?.sessionDurationMinutes).toBe(45);
    expect(coaching?.plans[0]?.sessionsIncluded).toBe(1);
  });

  it("validates required plan fields and durations", () => {
    const catalogue = defaultAdminCatalogue();
    expect(validateAdminPayload(catalogue)).toEqual([]);
    catalogue.services[0]!.plans[0]!.sessionDurationMinutes = 5;
    expect(validateAdminPayload(catalogue)[0]).toMatch(/15–240/);
  });

  it("updates plan prices and refreshes starting labels without removing siblings", () => {
    const base = defaultAdminCatalogue();
    const updated = upsertPlanInPayload(base, "bookkeeping", {
      ...base.services[0]!.plans[0]!,
      amountMinor: 20_500,
    });
    expect(updated.services[0]?.plans).toHaveLength(3);
    expect(updated.services[0]?.plans[0]?.amountMinor).toBe(20_500);
    expect(updated.services[0]?.startingLabel).toBe(formatStartingLabel(20_500, "USD", "month"));
  });

  it("archives a plan without deleting history from the draft payload", () => {
    const base = defaultAdminCatalogue();
    const archived = archivePlanInPayload(base, "coaching", "quick_guidance");
    const plan = archived.services
      .find((service) => service.code === "coaching")
      ?.plans.find((row) => row.code === "quick_guidance");
    expect(plan?.isArchived).toBe(true);
    expect(plan?.isEnabled).toBe(false);
    expect(plan?.isPublished).toBe(false);
  });
});
