import { describe, expect, it } from "vitest";
import { DEFAULT_PERSONAL_APPEARANCE, normalizePersonalAppearance } from "./personal-appearance";
import { DEFAULT_CUSTOM_PALETTE } from "@/lib/theme";

describe("personal appearance preferences", () => {
  it("uses safe defaults for missing and malformed values", () => {
    expect(normalizePersonalAppearance(null)).toEqual(DEFAULT_PERSONAL_APPEARANCE);
    expect(normalizePersonalAppearance({ theme: "midnight", palette: "unknown" })).toEqual(
      DEFAULT_PERSONAL_APPEARANCE,
    );
  });

  it("normalizes named and custom palettes to validated per-organisation preferences", () => {
    expect(normalizePersonalAppearance({ theme: "dark", palette: "sapphire" })).toEqual({
      theme: "dark",
      palette: "sapphire",
      customPalette: DEFAULT_CUSTOM_PALETTE,
    });
    expect(normalizePersonalAppearance({ theme: "light", palette: "custom" })).toEqual({
      theme: "light",
      palette: "custom",
      customPalette: DEFAULT_CUSTOM_PALETTE,
    });
    expect(
      normalizePersonalAppearance({
        theme: "dark",
        palette: "custom",
        customPalette: {
          primary: "#112233",
          accent: "#445566",
          sidebar: "#778899",
          lightBackground: "#aabbcc",
          darkBackground: "#010203",
        },
      }),
    ).toEqual({
      theme: "dark",
      palette: "custom",
      customPalette: {
        primary: "#112233",
        accent: "#445566",
        sidebar: "#778899",
        lightBackground: "#aabbcc",
        darkBackground: "#010203",
      },
    });
  });
});
