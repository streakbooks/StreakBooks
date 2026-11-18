import { describe, expect, it } from "vitest";
import {
  isPmSectionKey,
  PM_BASE,
  PM_SECTIONS,
  PM_SUBNAV,
  pmSection,
} from "@/lib/property-management/sections";

describe("property-management sections", () => {
  it("keeps overview at the module root", () => {
    expect(PM_BASE).toBe("/property-management");
    expect(pmSection("overview").path).toBe(PM_BASE);
    expect(PM_SUBNAV[0]?.to).toBe(PM_BASE);
  });

  it("registers required navigation keys", () => {
    const keys = PM_SECTIONS.map((section) => section.key);
    for (const required of [
      "overview",
      "properties",
      "units",
      "owners",
      "leases",
      "reservations",
      "owner-statements",
      "owner-payouts",
      "trust-accounting",
      "owner-portal",
      "tenant-portal",
      "settings",
    ]) {
      expect(keys).toContain(required);
      expect(isPmSectionKey(required)).toBe(true);
    }
    expect(isPmSectionKey("not-a-section")).toBe(false);
  });

  it("assigns every section a batch and permission gate", () => {
    for (const section of PM_SECTIONS) {
      expect(section.batch.startsWith("PM-")).toBe(true);
      expect(section.anyOf.length).toBeGreaterThan(0);
    }
  });
});
