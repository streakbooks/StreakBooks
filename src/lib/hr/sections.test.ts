import { describe, expect, it } from "vitest";
import { HR_GROUPS } from "@/lib/hr/groups";
import { HR_SECTIONS, HR_SUBNAV, isHrSectionKey, hrSection } from "@/lib/hr/sections";

describe("HR sections", () => {
  it("registers required navigation keys for the HR directive", () => {
    const keys = new Set(HR_SECTIONS.map((section) => section.key));
    for (const required of [
      "overview",
      "employees",
      "organization",
      "recruitment",
      "onboarding",
      "attendance",
      "shifts",
      "leave",
      "holidays",
      "documents",
      "self-service",
      "manager",
      "performance",
      "training",
      "compensation",
      "assets",
      "relations",
      "transfers",
      "offboarding",
      "reports",
      "approvals",
      "automations",
      "settings",
      "audit",
    ]) {
      expect(keys.has(required as never)).toBe(true);
    }
  });

  it("maps sections into the premium eight-group IA without changing paths", () => {
    const groupKeys = new Set(HR_GROUPS.map((group) => group.key));
    expect([...groupKeys]).toEqual([
      "overview",
      "people",
      "recruitment",
      "time",
      "performance",
      "compensation",
      "reports",
      "admin",
    ]);
    for (const section of HR_SECTIONS) {
      expect(groupKeys.has(section.group as never)).toBe(true);
    }
    expect(hrSection("employees").group).toBe("people");
    expect(hrSection("leave").group).toBe("time");
    expect(hrSection("compensation").group).toBe("compensation");
    expect(hrSection("recruitment").path).toBe("/hr/recruitment");
  });

  it("keeps subnav paths aligned with section definitions", () => {
    expect(HR_SUBNAV).toHaveLength(HR_SECTIONS.length);
    expect(HR_SUBNAV[0]?.to).toBe("/hr");
    expect(isHrSectionKey("employees")).toBe(true);
    expect(isHrSectionKey("not-a-section")).toBe(false);
    expect(hrSection("settings").batch).toBe("HR-01");
  });
});
