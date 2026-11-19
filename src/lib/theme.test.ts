import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import {
  isThemePreference,
  isPaletteId,
  isHexColor,
  validateCustomPalette,
  resolveTheme,
  computeCustomTokens,
  DEFAULT_CUSTOM_PALETTE,
  PALETTE_OPTIONS,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  PALETTE_STORAGE_KEY,
  CUSTOM_PALETTE_STORAGE_KEY,
} from "./theme";

describe("appearance modes and palettes", () => {
  it("keeps text and focus readable for custom midtones, extreme colours and both modes", () => {
    const luminance = (hex: string) => {
      const channels = [1, 3, 5]
        .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
        .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
      return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
    };
    const contrast = (a: string, b: string) => {
      const x = luminance(a),
        y = luminance(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    for (const primary of [
      "#777777",
      "#747474",
      "#ff0000",
      "#00ff00",
      "#0000ff",
      "#ffffff",
      "#000000",
    ]) {
      for (const canvas of ["#777777", "#ffffff", "#000000", "#123456"]) {
        for (const dark of [false, true]) {
          const tokens = computeCustomTokens(
            {
              primary,
              accent: "#168393",
              sidebar: canvas,
              lightBackground: canvas,
              darkBackground: canvas,
            },
            dark,
          );
          for (const [foreground, background] of [
            ["--primary-foreground", "--primary"],
            ["--foreground", "--background"],
            ["--card-foreground", "--card"],
            ["--secondary-foreground", "--secondary"],
            ["--accent-foreground", "--accent"],
            ["--muted-foreground", "--muted"],
            ["--sidebar-accent-foreground", "--sidebar-accent"],
            ["--sidebar-foreground", "--sidebar"],
            ["--sidebar-active-foreground", "--sidebar-active"],
            ["--link-ink", "--background"],
            ["--link-ink", "--card"],
            ["--muted-foreground", "--background"],
            ["--muted-foreground", "--card"],
          ]) {
            expect(
              contrast(tokens[foreground!]!, tokens[background!]!),
              `${primary} / ${canvas} / ${dark}: ${foreground}`,
            ).toBeGreaterThanOrEqual(4.5);
          }
          expect(contrast(tokens["--ring"]!, canvas)).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });
  it("retains the original light, dark and system behaviour", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("blue")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it("offers eight distinctive presets plus custom and keeps Classic as default", () => {
    expect(PALETTE_OPTIONS).toHaveLength(8);
    expect(PALETTE_OPTIONS[0]?.id).toBe("classic");
    expect(new Set(PALETTE_OPTIONS.map((p) => p.id)).size).toBe(8);
    expect(new Set(PALETTE_OPTIONS.map((p) => p.primary)).size).toBe(8);
    expect(PALETTE_OPTIONS.some((p) => p.id === "rose")).toBe(true);
    expect(PALETTE_OPTIONS.some((p) => p.id === "sapphire")).toBe(true);
    for (const p of PALETTE_OPTIONS) expect(isPaletteId(p.id)).toBe(true);
    expect(isPaletteId("custom")).toBe(true);
    expect(isPaletteId("__proto__")).toBe(false);
  });

  it("rejects CSS injection and corrupt colour values", () => {
    expect(isHexColor("#123abc")).toBe(true);
    expect(isHexColor("#123")).toBe(false);
    expect(isHexColor("red; background: url(http://example.com)")).toBe(false);
    expect(
      validateCustomPalette({
        primary: "red; background: url(http://example.com)",
        sidebar: "#123456",
        lightBackground: "#fefefe",
        darkBackground: 23,
      }),
    ).toEqual({
      primary: DEFAULT_CUSTOM_PALETTE.primary,
      accent: DEFAULT_CUSTOM_PALETTE.accent,
      sidebar: "#123456",
      lightBackground: "#fefefe",
      darkBackground: DEFAULT_CUSTOM_PALETTE.darkBackground,
    });
    expect(validateCustomPalette(null)).toEqual(DEFAULT_CUSTOM_PALETTE);
  });

  it("derives complete readable tokens for arbitrary custom palettes in both modes", () => {
    const colors = {
      primary: "#ffffff",
      accent: "#227f8b",
      sidebar: "#ffffff",
      lightBackground: "#101010",
      darkBackground: "#ffffff",
    };
    const light = computeCustomTokens(colors, false);
    const dark = computeCustomTokens(colors, true);
    expect(light["--foreground"]).toBe("#ffffff");
    expect(dark["--foreground"]).toBe("#142033");
    expect(light["--primary-foreground"]).toBe("#142033");
    // Light sidebars use soft secondary ink rather than pure navy on white.
    expect(light["--sidebar-foreground"]).toBe("#5b6b7f");
    expect(light["--sidebar-active-foreground"]).toBe("#142033");
    expect(light["--background"]).toBe("#101010");
    expect(light["--chart-2"]).toBe("#227f8b");

    expect(dark["--background"]).toBe("#ffffff");
    expect(light["--money-in"]).toBeUndefined();
    expect(dark["--success"]).toBeUndefined();
    for (const [name, value] of Object.entries(light)) {
      expect(name).toMatch(/^--[a-z0-9-]+$/);
      expect(value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("exposes the requested professional palette labels without changing persisted IDs", () => {
    for (const name of [
      "LinkBooks Signature",
      "Executive Slate",
      "Emerald Professional",
      "Royal Indigo",
      "Modern Teal",
      "Rose Professional",
      "Warm Sand",
    ]) {
      expect(PALETTE_OPTIONS.some((option) => option.name === name)).toBe(true);
    }
  });

  it("validates a separate custom accent and coordinates chart colours", () => {
    const palette = validateCustomPalette({
      ...DEFAULT_CUSTOM_PALETTE,
      accent: "#28a3b1",
    });
    const tokens = computeCustomTokens(palette, false);
    expect(tokens["--chart-1"]).toBe(palette.primary);
    expect(tokens["--chart-2"]).toBe("#28a3b1");
    expect(tokens["--chart-3"]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(tokens["--chart-4"]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(tokens["--chart-5"]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(validateCustomPalette({ accent: "javascript:alert(1)" }).accent).toBe(
      DEFAULT_CUSTOM_PALETTE.accent,
    );
  });

  it("prepaint initializer retains the original mode key and applies chosen palette", () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_INIT_SCRIPT).toContain(PALETTE_STORAGE_KEY);
    expect(THEME_INIT_SCRIPT).toContain(CUSTOM_PALETTE_STORAGE_KEY);

    const attrs: Record<string, string> = {};
    const styles: Record<string, string> = {};
    const classes: Record<string, boolean> = {};
    const storage: Record<string, string> = {
      [THEME_STORAGE_KEY]: "dark",
      [PALETTE_STORAGE_KEY]: "custom",
      [CUSTOM_PALETTE_STORAGE_KEY]: JSON.stringify({
        primary: "#c24174",
        accent: "#387f85",
        sidebar: "#402138",
        lightBackground: "#fff2f7",
        darkBackground: "#241a29",
      }),
    };
    const document = {
      documentElement: {
        classList: {
          toggle: (name: string, enabled: boolean) => {
            classes[name] = enabled;
          },
        },
        setAttribute: (name: string, value: string) => {
          attrs[name] = value;
        },
        style: {
          setProperty: (name: string, value: string) => {
            styles[name] = value;
          },
        },
      },
    };
    runInNewContext(THEME_INIT_SCRIPT, {
      document,
      localStorage: { getItem: (key: string) => storage[key] ?? null },
      window: { matchMedia: () => ({ matches: false }) },
    });
    expect(classes["dark"]).toBe(true);
    expect(attrs["data-linkbooks-palette"]).toBe("custom");
    expect(styles["--primary"]).toBe("#c24174");
    expect(styles["--chart-2"]).toBe("#387f85");
    expect(styles["--background"]).toBe("#241a29");
  });

  it("falls back to Classic safely for invalid stored palette selections", () => {
    const attrs: Record<string, string> = {};
    runInNewContext(THEME_INIT_SCRIPT, {
      document: {
        documentElement: {
          classList: { toggle: () => {} },
          setAttribute: (k: string, v: string) => {
            attrs[k] = v;
          },
          style: { setProperty: () => {} },
        },
      },
      localStorage: { getItem: (key: string) => (key === PALETTE_STORAGE_KEY ? "invalid" : null) },
      window: { matchMedia: () => ({ matches: false }) },
    });
    expect(attrs["data-linkbooks-palette"]).toBe("classic");
  });
});
