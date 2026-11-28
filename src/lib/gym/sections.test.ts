import { describe, expect, it } from "vitest";
import { GYM_SECTION_KEYS } from "@/lib/gym/section-keys";
import { GYM_SECTIONS, isGymSectionKey } from "@/lib/gym/sections";

describe("gym navigation", () => {
  it("keeps section keys unique and routable", () => {
    const keys = GYM_SECTIONS.map((section) => section.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(isGymSectionKey("deferred")).toBe(true);
    expect(isGymSectionKey("workout-videos")).toBe(false);
    expect(GYM_SECTIONS.find((section) => section.key === "overview")?.path).toBe("/gym");
    expect([...GYM_SECTION_KEYS]).toEqual(keys);
  });
});
