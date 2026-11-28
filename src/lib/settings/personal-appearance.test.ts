import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERSONAL_APPEARANCE,
  normalizePersonalAppearance,
  personalAppearanceSyncChanges,
} from "./personal-appearance";
import { DEFAULT_CUSTOM_PALETTE } from "@/lib/theme";

describe("personal appearance preferences", () => {
  it("uses safe defaults for missing and malformed values", () => {
    expect(normalizePersonalAppearance(null)).toEqual(DEFAULT_PERSONAL_APPEARANCE);
    expect(normalizePersonalAppearance({ theme: "midnight", palette: "unknown" })).toEqual(
      DEFAULT_PERSONAL_APPEARANCE,
    );
  });

  it("normalizes named and custom palettes to validated account preferences", () => {
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

  it("applies the signed-in user's saved palette over stale local custom settings", () => {
    const saved = normalizePersonalAppearance({ theme: "light", palette: "sapphire" });
    const local = normalizePersonalAppearance({ theme: "dark", palette: "custom" });
    expect(personalAppearanceSyncChanges(local, saved)).toEqual({
      theme: "light",
      palette: "sapphire",
    });
  });

  it("loads custom colours when the saved account palette is custom", () => {
    const saved = normalizePersonalAppearance({ theme: "dark", palette: "custom" });
    const local = normalizePersonalAppearance({ theme: "dark", palette: "custom" });
    expect(personalAppearanceSyncChanges(local, saved)).toEqual({});
    const changed = {
      ...local,
      customPalette: { ...local.customPalette, primary: "#123456" },
    };
    expect(personalAppearanceSyncChanges(changed, saved)).toEqual({
      customPalette: saved.customPalette,
    });
  });
});
