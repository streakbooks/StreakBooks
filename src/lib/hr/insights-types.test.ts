import { describe, expect, it } from "vitest";
import { HR_REPORT_IDS, HR_REPORT_LABELS, HR_AUTOMATION_TRIGGERS } from "@/lib/hr/insights-types";
import { isHrSectionKey } from "@/lib/hr/sections";

describe("HR insights catalogue", () => {
  it("covers report ids with labels", () => {
    for (const id of HR_REPORT_IDS) {
      expect(HR_REPORT_LABELS[id].length).toBeGreaterThan(0);
    }
  });
  it("keeps automation triggers stable", () => {
    expect(HR_AUTOMATION_TRIGGERS).toContain("document_expiry_reminder");
    expect(isHrSectionKey("reports")).toBe(true);
    expect(isHrSectionKey("automations")).toBe(true);
  });
});
