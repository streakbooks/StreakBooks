import { isPaletteId, isThemePreference, type PaletteId, type ThemePreference } from "@/lib/theme";

export type SyncedPaletteId = Exclude<PaletteId, "custom">;

export type PersonalAppearancePreferences = {
  theme: ThemePreference;
  palette: SyncedPaletteId;
};

export const PERSONAL_APPEARANCE_KEY = "personal_appearance";

export const DEFAULT_PERSONAL_APPEARANCE: PersonalAppearancePreferences = {
  theme: "system",
  palette: "classic",
};

/** Invalid or older stored values fall back safely; custom colour values stay device-local. */
export function normalizePersonalAppearance(value: unknown): PersonalAppearancePreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_PERSONAL_APPEARANCE;
  }
  const record = value as Record<string, unknown>;
  const theme = isThemePreference(record["theme"])
    ? record["theme"]
    : DEFAULT_PERSONAL_APPEARANCE.theme;
  const paletteValue = record["palette"];
  const palette =
    isPaletteId(paletteValue) && paletteValue !== "custom"
      ? paletteValue
      : DEFAULT_PERSONAL_APPEARANCE.palette;
  return { theme, palette };
}
