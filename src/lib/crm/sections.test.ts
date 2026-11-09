import { describe, expect, it } from "vitest";
import { CRM_SECTIONS, isCrmSectionKey } from "@/lib/crm/sections";

describe("CRM sections", () => {
  it("registers the required top-level CRM destinations", () => {
    const keys = CRM_SECTIONS.map((s) => s.key);
    for (const required of [
      "overview",
      "leads",
      "opportunities",
      "pipelines",
      "accounts",
      "contacts",
      "activities",
      "tasks",
      "calendar",
      "communications",
      "quotes",
      "campaigns",
      "products",
      "forecasting",
      "relationships",
      "automation",
      "reports",
      "team",
      "imports",
      "settings",
    ]) {
      expect(keys).toContain(required);
      expect(isCrmSectionKey(required)).toBe(true);
    }
  });

  it("keeps every section permission-gated", () => {
    for (const section of CRM_SECTIONS) {
      expect(section.anyOf.length).toBeGreaterThan(0);
    }
  });
});
