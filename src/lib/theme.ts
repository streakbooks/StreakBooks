/**
 * Appearance is two independent choices:
 * - Light / Dark / System: the original LinkBooks mode setting (unchanged key).
 * - A colour palette, including user-defined colours. Local to this browser.
 * Colour changes never affect transaction, status or reporting semantics.
 */
export type ThemePreference = "light" | "dark" | "system";
export type PaletteId = "classic" | "sapphire" | "rose" | "amethyst" | "emerald" |
  "teal" | "champagne" | "graphite" | "custom";

export type CustomPalette = {
  primary: string;
  sidebar: string;
  lightBackground: string;
  darkBackground: string;
};

export const THEME_STORAGE_KEY = "linkbooks-theme";
export const PALETTE_STORAGE_KEY = "linkbooks-theme-palette";
export const CUSTOM_PALETTE_STORAGE_KEY = "linkbooks-theme-custom";

export const DEFAULT_CUSTOM_PALETTE: CustomPalette = {
  primary: "#225eae",
  sidebar: "#101d32",
  lightBackground: "#f7f9fd",
  darkBackground: "#152135",
};

export const PALETTE_OPTIONS: readonly {
  id: Exclude<PaletteId, "custom">;
  name: string;
  description: string;
  primary: string;
  sidebar: string;
  surface: string;
}[] = [
  { id: "classic", name: "LinkBooks Classic", description: "Original signature", primary: "#2460ab", sidebar: "#101d32", surface: "#f7f9fc" },
  { id: "sapphire", name: "Sapphire", description: "Confident blues", primary: "#2554ad", sidebar: "#0c2040", surface: "#f4f8ff" },
  { id: "rose", name: "Rose Blush", description: "Soft pink elegance", primary: "#993b6e", sidebar: "#38243c", surface: "#fff5f9" },
  { id: "amethyst", name: "Amethyst", description: "Refined violet", primary: "#7542a6", sidebar: "#2b2044", surface: "#faf6ff" },
  { id: "emerald", name: "Emerald", description: "Calm green", primary: "#1b7458", sidebar: "#123b35", surface: "#f3fbf6" },
  { id: "teal", name: "Ocean Teal", description: "Modern and clear", primary: "#126d79", sidebar: "#123541", surface: "#f1fbfb" },
  { id: "champagne", name: "Champagne", description: "Warm understated gold", primary: "#825d2b", sidebar: "#332b21", surface: "#fffbf3" },
  { id: "graphite", name: "Graphite", description: "Timeless monochrome", primary: "#394e69", sidebar: "#171f2b", surface: "#f5f7fa" },
];

export function isThemePreference(v: unknown): v is ThemePreference {
  return v === "light" || v === "dark" || v === "system";
}

export function isPaletteId(v: unknown): v is PaletteId {
  return v === "custom" || PALETTE_OPTIONS.some((p) => p.id === v);
}

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

/** Treat incomplete, corrupted or manually edited storage as the safe default. */
export function validateCustomPalette(v: unknown): CustomPalette {
  if (typeof v !== "object" || !v || Array.isArray(v)) return { ...DEFAULT_CUSTOM_PALETTE };
  const r = v as Record<string, unknown>;
  return {
    primary: isHexColor(r["primary"]) ? r["primary"] : DEFAULT_CUSTOM_PALETTE.primary,
    sidebar: isHexColor(r["sidebar"]) ? r["sidebar"] : DEFAULT_CUSTOM_PALETTE.sidebar,
    lightBackground: isHexColor(r["lightBackground"]) ? r["lightBackground"] : DEFAULT_CUSTOM_PALETTE.lightBackground,
    darkBackground: isHexColor(r["darkBackground"]) ? r["darkBackground"] : DEFAULT_CUSTOM_PALETTE.darkBackground,
  };
}

export function resolveTheme(pref: ThemePreference, systemDark: boolean): "light" | "dark" {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

/**
 * Self-contained function so the same exact colour derivation can run in the
 * pre-paint <head> script AND in the live theme hook. Always choose readable
 * foregrounds; never allow raw text/CSS from storage into style properties.
 */
export function computeCustomTokens(colors: CustomPalette, dark: boolean): Record<string, string> {
  const rgb = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16),
  ];
  const blend = (a: string, b: string, ratio: number): string => {
    const aa = rgb(a), bb = rgb(b);
    return "#" + aa.map((v, i) => Math.round(v * (1 - ratio) + bb[i]! * ratio)
      .toString(16).padStart(2, "0")).join("");
  };
  const luminance = (hex: string): number => {
    const channels = rgb(hex).map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  };
  const ink = (hex: string): string => {
    const l = luminance(hex);
    return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#142033" : "#ffffff";
  };
  const primary = colors.primary;
  const sidebar = colors.sidebar;
  const canvas = dark ? colors.darkBackground : colors.lightBackground;
  const foreground = ink(canvas);
  const card = blend(canvas, foreground === "#ffffff" ? "#ffffff" : "#ffffff", dark ? 0.075 : 0.5);
  const cardInk = ink(card);
  const active = primary;
  return {
    "--primary": primary,
    "--primary-foreground": ink(primary),
    "--ring": primary,
    "--chart-1": primary,
    "--background": canvas,
    "--foreground": foreground,
    "--card": card,
    "--card-foreground": cardInk,
    "--popover": card,
    "--popover-foreground": cardInk,
    "--secondary": blend(canvas, foreground, 0.06),
    "--secondary-foreground": foreground,
    "--muted": blend(canvas, foreground, 0.065),
    "--muted-foreground": blend(foreground, canvas, 0.30),
    "--accent": blend(canvas, primary, 0.12),
    "--accent-foreground": foreground,
    "--border": blend(canvas, foreground, 0.20),
    "--input": blend(canvas, foreground, 0.28),
    "--sidebar": sidebar,
    "--sidebar-top": blend(sidebar, "#ffffff", 0.05),
    "--sidebar-bottom": blend(sidebar, "#000000", 0.09),
    "--sidebar-foreground": ink(sidebar),
    "--sidebar-primary": primary,
    "--sidebar-primary-foreground": ink(primary),
    "--sidebar-accent": blend(sidebar, ink(sidebar), 0.12),
    "--sidebar-accent-foreground": ink(sidebar),
    "--sidebar-border": blend(sidebar, ink(sidebar), 0.25),
    "--sidebar-ring": primary,
    "--sidebar-active": blend(active, sidebar, 0.13),
    "--sidebar-active-strong": active,
    "--sidebar-active-foreground": ink(active),
    "--sidebar-active-border": blend(active, ink(active), 0.22),
    "--sidebar-active-indicator": blend(active, ink(active), 0.30),
  };
}

/** Inline custom properties are only applied to the explicitly chosen custom palette. */
export const CUSTOM_THEME_VARIABLES = Object.keys(computeCustomTokens(DEFAULT_CUSTOM_PALETTE, false));

/** Retain the existing original light/dark/system storage key for all existing users. */
export const THEME_INIT_SCRIPT =
  "(function(){try{" +
  "var mode=localStorage.getItem(" + JSON.stringify(THEME_STORAGE_KEY) + ");" +
  "if(mode!=='light'&&mode!=='dark')mode='system';" +
  "var dark=mode==='dark'||(mode==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);" +
  "var el=document.documentElement;el.classList.toggle('dark',dark);" +
  "var p=localStorage.getItem(" + JSON.stringify(PALETTE_STORAGE_KEY) + ");" +
  "var allowed=" + JSON.stringify(PALETTE_OPTIONS.map((v) => v.id).concat("custom")) + ";" +
  "if(allowed.indexOf(p)<0)p='classic';el.setAttribute('data-linkbooks-palette',p);" +
  "if(p==='custom'){" +
  "var saved;try{saved=JSON.parse(localStorage.getItem(" + JSON.stringify(CUSTOM_PALETTE_STORAGE_KEY) + "));}catch(_){}" +
  "var defaults=" + JSON.stringify(DEFAULT_CUSTOM_PALETTE) + ";" +
  "var valid=/^#[0-9a-fA-F]{6}$/;var colors={};" +
  "Object.keys(defaults).forEach(function(k){colors[k]=saved&&typeof saved[k]==='string'&&valid.test(saved[k])?saved[k]:defaults[k];});" +
  "var tokens=(" + computeCustomTokens.toString() + ")(colors,dark);" +
  "Object.keys(tokens).forEach(function(k){el.style.setProperty(k,tokens[k]);});" +
  "}" +
  "}catch(_){}})();";
