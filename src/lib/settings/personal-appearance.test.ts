import { describe, expect, it } from "vitest";
import { DEFAULT_PERSONAL_APPEARANCE, normalizePersonalAppearance } from "./personal-appearance";

describe("personal appearance preferences", () => {
  it("uses safe defaults for missing and malformed values", () => {
    expect(normalizePersonalAppearance(null)).toEqual(DEFAULT_PERSONAL_APPEARANCE);
    expect(normalizePersonalAppearance({ theme: "midnight", palette: "unknown" })).toEqual(
      DEFAULT_PERSONAL_APPEARANCE,
    );
  });

  it("keeps only supported synced values and never stores custom palette colors here", () => {
    expect(normalizePersonalAppearance({ theme: "dark", palette: "sapphire" })).toEqual({
      theme: "dark",
      palette: "sapphire",
    });
    expect(normalizePersonalAppearance({ theme: "light", palette: "custom" })).toEqual({
      theme: "light",
      palette: "classic",
    });
  });
});
