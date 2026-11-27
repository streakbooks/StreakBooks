import { useEffect } from "react";
import { useTheme } from "@/hooks/use-theme";
import {
  personalAppearanceSyncChanges,
  type PersonalAppearancePreferences,
} from "@/lib/settings/personal-appearance";

export function usePersonalAppearanceSync(preferences: {
  isSuccess: boolean;
  data: PersonalAppearancePreferences | undefined;
}) {
  const { preference, palette, customColors, setPreference, setPalette, setCustomColors } =
    useTheme();
  useEffect(() => {
    const saved = preferences.data;
    if (!preferences.isSuccess || !saved) return;
    const changes = personalAppearanceSyncChanges(
      { theme: preference, palette, customPalette: customColors },
      saved,
    );
    if (changes.theme) setPreference(changes.theme);
    if (changes.palette) setPalette(changes.palette);
    if (changes.customPalette) setCustomColors(changes.customPalette);
  }, [
    preferences.isSuccess,
    preferences.data,
    preference,
    palette,
    customColors,
    setPreference,
    setPalette,
    setCustomColors,
  ]);
}
