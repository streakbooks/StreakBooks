import { describe, expect, it } from "vitest";
import { NP_SECTIONS, isNpSectionKey } from "./sections";

describe("nonprofit navigation", () => {
  it("keeps unique section keys and a dashboard at the module root", () => {
    const keys = NP_SECTIONS.map((section) => section.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(NP_SECTIONS[0]).toMatchObject({ key: "overview", path: "/nonprofit", exact: true });
    expect(isNpSectionKey("funds")).toBe(true);
    expect(isNpSectionKey("not-a-section")).toBe(false);
  });
});
