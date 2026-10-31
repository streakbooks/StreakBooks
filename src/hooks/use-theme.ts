import { useCallback, useSyncExternalStore } from "react";
import {
  CUSTOM_PALETTE_STORAGE_KEY, CUSTOM_THEME_VARIABLES, DEFAULT_CUSTOM_PALETTE,
  PALETTE_STORAGE_KEY, THEME_STORAGE_KEY, computeCustomTokens,
  isPaletteId, isThemePreference, resolveTheme, validateCustomPalette,
  type CustomPalette, type PaletteId, type ThemePreference,
} from "@/lib/theme";

const listeners = new Set<() => void>();
const storageKeys = new Set([THEME_STORAGE_KEY, PALETTE_STORAGE_KEY, CUSTOM_PALETTE_STORAGE_KEY]);

function stored(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Browser storage might be unavailable; the user can still use the UI this session.
  }
}

function readPreference(): ThemePreference {
  const v = stored(THEME_STORAGE_KEY);
  return isThemePreference(v) ? v : "system";
}

function readPalette(): PaletteId {
  const v = stored(PALETTE_STORAGE_KEY);
  return isPaletteId(v) ? v : "classic";
}

function readCustomRaw(): string {
  return stored(CUSTOM_PALETTE_STORAGE_KEY) ?? "";
}

function readCustom(): CustomPalette {
  let raw: unknown = null;
  try {
    raw = JSON.parse(readCustomRaw());
  } catch {
    // New users and corrupt storage use safe defaults.
  }
  return validateCustomPalette(raw);
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Apply only appearance tokens. Accounting colours and status tokens remain untouched. */
function applyAppearance() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const dark = resolveTheme(readPreference(), systemPrefersDark()) === "dark";
  root.classList.toggle("dark", dark);
  const palette = readPalette();
  root.setAttribute("data-linkbooks-palette", palette);
  for (const name of CUSTOM_THEME_VARIABLES) root.style.removeProperty(name);
  if (palette === "custom") {
    const tokens = computeCustomTokens(readCustom(), dark);
    for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value);
  }
}

function notify() {
  applyAppearance();
  for (const listener of listeners) listener();
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (readPreference() === "system") notify();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || storageKeys.has(e.key)) notify();
  };
  mq.addEventListener("change", onSystem);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    mq.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Light/Dark/System works exactly as before. Each user can additionally select
 * one of eight named palettes or four custom colours saved in this browser.
 */
export function useTheme() {
  const preference = useSyncExternalStore(subscribe, readPreference, () => "system" as const);
  const palette = useSyncExternalStore(subscribe, readPalette, () => "classic" as const);
  const customRaw = useSyncExternalStore(subscribe, readCustomRaw, () => "");
  const systemDark = useSyncExternalStore(subscribe, systemPrefersDark, () => false);
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(customRaw);
  } catch {
    // Empty or malformed saved palette.
  }
  const customColors = validateCustomPalette(parsed);

  const setPreference = useCallback((next: ThemePreference) => {
    if (!isThemePreference(next)) return;
    write(THEME_STORAGE_KEY, next);
    notify();
  }, []);
  const setPalette = useCallback((next: PaletteId) => {
    if (!isPaletteId(next)) return;
    write(PALETTE_STORAGE_KEY, next);
    notify();
  }, []);
  const setCustomColors = useCallback((next: CustomPalette) => {
    write(CUSTOM_PALETTE_STORAGE_KEY, JSON.stringify(validateCustomPalette(next)));
    write(PALETTE_STORAGE_KEY, "custom");
    notify();
  }, []);
  const resetCustomColors = useCallback(() => {
    write(CUSTOM_PALETTE_STORAGE_KEY, JSON.stringify(DEFAULT_CUSTOM_PALETTE));
    write(PALETTE_STORAGE_KEY, "custom");
    notify();
  }, []);

  return {
    preference, resolved: resolveTheme(preference, systemDark),
    palette, customColors, setPreference, setPalette, setCustomColors, resetCustomColors,
  };
}
