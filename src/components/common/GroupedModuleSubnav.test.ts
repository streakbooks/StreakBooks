import { describe, expect, it } from "vitest";
import { buildGroupedModuleNav } from "@/components/common/GroupedModuleSubnav";

const groups = [
  { key: "people", label: "People" },
  { key: "time", label: "Time & Leave" },
] as const;

const sections = [
  { key: "employees", label: "Employees", group: "people" },
  { key: "organization", label: "Organization", group: "people" },
  { key: "leave", label: "Leave", group: "time" },
] as const;

describe("buildGroupedModuleNav", () => {
  it("defaults to the current section's group and can switch without dropping destinations", () => {
    const initial = buildGroupedModuleNav(groups, sections, "employees");
    expect(initial.selectedGroup).toBe("people");
    expect(initial.displayed?.sections.map((section) => section.key)).toEqual([
      "employees",
      "organization",
    ]);

    const switched = buildGroupedModuleNav(groups, sections, "employees", "time");
    expect(switched.selectedGroup).toBe("time");
    expect(switched.displayed?.sections.map((section) => section.key)).toEqual(["leave"]);
    expect(switched.populated).toHaveLength(2);
  });
});
