/**
 * Appearance is two independent choices:
 * - Light / Dark / System: the original LinkBooks mode setting (unchanged key).
 * - A colour palette, including user-defined colours. Local to this browser.
 * Colour changes never affect transaction, status or reporting semantics.
 */
export type ThemePreference = "light" | "dark" | "system";
export type PaletteId =
  | "classic"
  | "sapphire"
  | "rose"
  | "amethyst"
  | "emerald"
  | "teal"
  | "champagne"
  | "graphite"
  | "custom";

export type CustomPalette = {
  primary: string;
  /** Independent accent for selected surfaces and the second chart series. */
  accent: string;
  sidebar: string;
  lightBackground: string;
  darkBackground: string;
};

export const THEME_STORAGE_KEY = "linkbooks-theme";
export const PALETTE_STORAGE_KEY = "linkbooks-theme-palette";
export const CUSTOM_PALETTE_STORAGE_KEY = "linkbooks-theme-custom";

export const DEFAULT_CUSTOM_PALETTE: CustomPalette = {
  primary: "#4f7df3",
  accent: "#2aa5a0",
  sidebar: "#ffffff",
  lightBackground: "#f7fafc",
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
  {
    id: "classic",
    name: "LinkBooks Signature",
    description: "Soft premium blue",
    primary: "#4f7df3",
    sidebar: "#ffffff",
    surface: "#f7fafc",
  },
  {
    id: "sapphire",
    name: "Sapphire Focus",
    description: "Soft pastel blues",
    primary: "#3b6de0",
    sidebar: "#ffffff",
    surface: "#f4f8ff",
  },
  {
    id: "rose",
    name: "Rose Professional",
    description: "Soft pink elegance",
    primary: "#993b6e",
    sidebar: "#ffffff",
    surface: "#fff5f9",
  },
  {
    id: "amethyst",
    name: "Royal Indigo",
    description: "Soft indigo accents",
    primary: "#7542a6",
    sidebar: "#ffffff",
    surface: "#faf6ff",
  },
  {
    id: "emerald",
    name: "Emerald Professional",
    description: "Calm green",
    primary: "#1b7458",
    sidebar: "#ffffff",
    surface: "#f3fbf6",
  },
  {
    id: "teal",
    name: "Modern Teal",
    description: "Modern and clear",
    primary: "#126d79",
    sidebar: "#ffffff",
    surface: "#f1fbfb",
  },
  {
    id: "champagne",
    name: "Warm Sand",
    description: "Warm natural canvas",
    primary: "#825d2b",
    sidebar: "#ffffff",
    surface: "#fffbf3",
  },
  {
    id: "graphite",
    name: "Executive Slate",
    description: "Soft slate accents",
    primary: "#394e69",
    sidebar: "#ffffff",
    surface: "#f5f7fa",
  },
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
    accent: isHexColor(r["accent"]) ? r["accent"] : DEFAULT_CUSTOM_PALETTE.accent,
    sidebar: isHexColor(r["sidebar"]) ? r["sidebar"] : DEFAULT_CUSTOM_PALETTE.sidebar,
    lightBackground: isHexColor(r["lightBackground"])
      ? r["lightBackground"]
      : DEFAULT_CUSTOM_PALETTE.lightBackground,
    darkBackground: isHexColor(r["darkBackground"])
      ? r["darkBackground"]
      : DEFAULT_CUSTOM_PALETTE.darkBackground,
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
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const blend = (a: string, b: string, ratio: number): string => {
    const aa = rgb(a),
      bb = rgb(b);
    return (
      "#" +
      aa
        .map((v, i) =>
          Math.round(v * (1 - ratio) + bb[i]! * ratio)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
    );
  };
  const luminance = (hex: string): number => {
    const channels = rgb(hex).map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  };
  const ink = (hex: string): string => {
    const ratio = (foreground: string) => {
      const a = luminance(hex),
        b = luminance(foreground);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    // Compare the actual navy ink, rather than the luminance of pure black.
    if (ratio("#142033") >= 4.5) return "#142033";
    if (ratio("#ffffff") >= 4.5) return "#ffffff";
    return "#000000";
  };
  const readable = (preferred: string, background: string, minimum = 4.5): string => {
    const ratio = (a: string, b: string) => {
      const x = luminance(a),
        y = luminance(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    if (ratio(preferred, background) >= minimum) return preferred;
    const target = ink(background);
    for (let step = 1; step <= 20; step++) {
      const candidate = blend(preferred, target, step / 20);
      if (ratio(candidate, background) >= minimum) return candidate;
    }
    return target;
  };
  const primary = colors.primary;
  const accentColor = colors.accent;
  const sidebar = colors.sidebar;
  const canvas = dark ? colors.darkBackground : colors.lightBackground;
  const foreground = ink(canvas);
  // Keep surfaces on the same side of the contrast boundary, including unusual
  // custom canvases. A bright card on a black light-mode canvas cannot share ink.
  const card = blend(canvas, foreground === "#ffffff" ? "#000000" : "#ffffff", 0.04);
  const cardInk = ink(card);
  const active = primary;
  const lightSidebar = luminance(sidebar) > 0.55;
  // Light sidebars use soft selected tints; dark sidebars keep solid accent selection.
  const activeBackground = lightSidebar
    ? blend(sidebar, primary, 0.14)
    : blend(active, sidebar, 0.13);
  const secondary = blend(canvas, foreground === "#ffffff" ? "#000000" : "#ffffff", 0.06);
  const muted = blend(canvas, foreground === "#ffffff" ? "#000000" : "#ffffff", 0.065);
  // Hover surfaces inherit the page's text in tables and links. Reduce the tint
  // when it would cross the contrast boundary for a custom midtone canvas.
  const tint = (background: string, accent: string, text: string): string => {
    for (let step = 12; step >= 0; step--) {
      const candidate = blend(background, accent, step / 100);
      const a = luminance(candidate),
        b = luminance(text);
      if ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5) return candidate;
    }
    return background;
  };
  return {
    "--primary": primary,
    "--primary-foreground": ink(primary),
    "--ring": readable(readable(primary, canvas, 3), card, 3),
    "--link-ink": readable(readable(primary, canvas), card),
    "--chart-1": primary,
    "--chart-2": accentColor,
    "--chart-3": blend(primary, "#d89748", 0.54),
    "--chart-4": blend(accentColor, "#d36d69", 0.5),
    "--chart-5": blend(primary, "#ab79c3", 0.48),
    "--background": canvas,
    "--foreground": foreground,
    "--card": card,
    "--card-foreground": cardInk,
    "--popover": card,
    "--popover-foreground": cardInk,
    "--secondary": secondary,
    "--secondary-foreground": ink(secondary),
    "--muted": muted,
    "--muted-foreground": readable(
      readable(readable(blend(foreground, canvas, 0.3), canvas), card),
      muted,
    ),
    "--accent": tint(canvas, accentColor, foreground),
    "--accent-foreground": foreground,
    "--border": blend(canvas, foreground, 0.2),
    "--input": readable(readable(blend(canvas, foreground, 0.28), canvas, 3), card, 3),
    "--sidebar": sidebar,
    "--sidebar-top": lightSidebar
      ? blend(sidebar, "#ffffff", 0.35)
      : blend(sidebar, "#ffffff", 0.05),
    "--sidebar-bottom": lightSidebar
      ? blend(sidebar, canvas, 0.35)
      : blend(sidebar, "#000000", 0.09),
    "--sidebar-foreground": lightSidebar
      ? readable("#5b6b7f", sidebar, 4.5)
      : ink(sidebar),
    "--sidebar-primary": primary,
    "--sidebar-primary-foreground": ink(primary),
    "--sidebar-accent": lightSidebar
      ? tint(sidebar, primary, readable("#1f2a37", sidebar, 4.5))
      : tint(sidebar, ink(sidebar), ink(sidebar)),
    "--sidebar-accent-foreground": lightSidebar
      ? readable("#1f2a37", sidebar, 4.5)
      : ink(sidebar),
    "--sidebar-border": lightSidebar
      ? blend(sidebar, "#1f2a37", 0.1)
      : blend(sidebar, ink(sidebar), 0.25),
    "--sidebar-ring": readable(primary, sidebar, 3),
    "--sidebar-active": activeBackground,
    "--sidebar-active-strong": active,
    "--sidebar-active-foreground": ink(activeBackground),
    "--sidebar-active-border": lightSidebar
      ? blend(activeBackground, primary, 0.28)
      : blend(active, ink(active), 0.22),
    "--sidebar-active-indicator": primary,
  };
}

/** Inline custom properties are only applied to the explicitly chosen custom palette. */
export const CUSTOM_THEME_VARIABLES = Object.keys(
  computeCustomTokens(DEFAULT_CUSTOM_PALETTE, false),
);

/** Retain the existing original light/dark/system storage key for all existing users. */
export const THEME_INIT_SCRIPT =
  "(function(){try{" +
  "var mode=localStorage.getItem(" +
  JSON.stringify(THEME_STORAGE_KEY) +
  ");" +
  "if(mode!=='light'&&mode!=='dark')mode='system';" +
  "var dark=mode==='dark'||(mode==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);" +
  "var el=document.documentElement;el.classList.toggle('dark',dark);" +
  "var p=localStorage.getItem(" +
  JSON.stringify(PALETTE_STORAGE_KEY) +
  ");" +
  "var allowed=" +
  JSON.stringify([...PALETTE_OPTIONS.map((v) => v.id), "custom"]) +
  ";" +
  "if(allowed.indexOf(p)<0)p='classic';el.setAttribute('data-linkbooks-palette',p);" +
  "if(p==='custom'){" +
  "var saved;try{saved=JSON.parse(localStorage.getItem(" +
  JSON.stringify(CUSTOM_PALETTE_STORAGE_KEY) +
  "));}catch(_){}" +
  "var defaults=" +
  JSON.stringify(DEFAULT_CUSTOM_PALETTE) +
  ";" +
  "var valid=/^#[0-9a-fA-F]{6}$/;var colors={};" +
  "Object.keys(defaults).forEach(function(k){colors[k]=saved&&typeof saved[k]==='string'&&valid.test(saved[k])?saved[k]:defaults[k];});" +
  "var tokens=(" +
  computeCustomTokens.toString() +
  ")(colors,dark);" +
  "Object.keys(tokens).forEach(function(k){el.style.setProperty(k,tokens[k]);});" +
  "}" +
  "}catch(_){}})();";
