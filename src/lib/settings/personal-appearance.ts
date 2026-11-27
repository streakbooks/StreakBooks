import {
  DEFAULT_CUSTOM_PALETTE,
  isPaletteId,
  isThemePreference,
  validateCustomPalette,
  type CustomPalette,
  type PaletteId,
  type ThemePreference,
} from "@/lib/theme";

export type SyncedPaletteId = Exclude<PaletteId, "custom">;

export type PersonalAppearancePreferences = {
  theme: ThemePreference;
  palette: PaletteId;
  customPalette: CustomPalette;
};

export const PERSONAL_APPEARANCE_KEY = "personal_appearance";

export const DEFAULT_PERSONAL_APPEARANCE: PersonalAppearancePreferences = {
  theme: "system",
  palette: "classic",
  customPalette: { ...DEFAULT_CUSTOM_PALETTE },
};

/** Older records and malformed custom colors normalize to a safe supported palette. */
export function normalizePersonalAppearance(value: unknown): PersonalAppearancePreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_PERSONAL_APPEARANCE;
  }
  const record = value as Record<string, unknown>;
  const theme = isThemePreference(record["theme"])
    ? record["theme"]
    : DEFAULT_PERSONAL_APPEARANCE.theme;
  const paletteValue = record["palette"];
  const palette = isPaletteId(paletteValue) ? paletteValue : DEFAULT_PERSONAL_APPEARANCE.palette;
  const customPalette = validateCustomPalette(record["customPalette"]);
  return { theme, palette, customPalette };
}

export function personalAppearanceSyncChanges(
  current: PersonalAppearancePreferences,
  saved: PersonalAppearancePreferences,
): Partial<PersonalAppearancePreferences> {
  const changes: Partial<PersonalAppearancePreferences> = {};
  if (current.theme !== saved.theme) changes.theme = saved.theme;
  if (current.palette !== saved.palette) changes.palette = saved.palette;
  if (
    saved.palette === "custom" &&
    JSON.stringify(current.customPalette) !== JSON.stringify(saved.customPalette)
  ) {
    changes.customPalette = saved.customPalette;
  }
  return changes;
}
