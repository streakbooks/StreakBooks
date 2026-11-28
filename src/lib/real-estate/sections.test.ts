import { describe, expect, it } from "vitest";
import { MODULE_REGISTRY } from "@/lib/modules/registry";
import { RE_SECTIONS, isReSectionKey } from "./sections";
import { isRealEstateRouteSection } from "./route-search";

describe("real estate navigation", () => {
  it("starts at the overview and keeps section keys unique", () => {
    expect(RE_SECTIONS[0]).toMatchObject({ key: "overview", path: "/real-estate", exact: true });
    expect(new Set(RE_SECTIONS.map((section) => section.key)).size).toBe(RE_SECTIONS.length);
    expect(isReSectionKey("inventory")).toBe(true);
    expect(isReSectionKey("portal")).toBe(false);
    for (const section of RE_SECTIONS) {
      expect(isRealEstateRouteSection(section.key)).toBe(true);
    }
  });

  it("registers the module without copying the section list into the shell catalogue", () => {
    const module = MODULE_REGISTRY.find((entry) => entry.id === "real-estate");
    expect(module?.path).toBe("/real-estate");
    expect(module?.subnav).toBeUndefined();
  });
});
