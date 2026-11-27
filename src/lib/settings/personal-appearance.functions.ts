import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  PERSONAL_APPEARANCE_KEY,
  normalizePersonalAppearance,
  type PersonalAppearancePreferences,
} from "@/lib/settings/personal-appearance";
import { isPaletteId, isThemePreference } from "@/lib/theme";

export const getPersonalAppearancePreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<PersonalAppearancePreferences> => {
    const { data: row, error } = await context.supabase
      .from("user_global_preferences" as never)
      .select("preference_value" as never)
      .eq("user_id" as never, context.userId as never)
      .eq("preference_key" as never, PERSONAL_APPEARANCE_KEY as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const value = (row as { preference_value?: unknown } | null)?.preference_value;
    return normalizePersonalAppearance(value);
  });

export const savePersonalAppearancePreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { theme: unknown; palette: unknown; customPalette?: unknown }) => {
    if (!isThemePreference(input.theme)) throw new Error("Choose a supported colour mode");
    if (!isPaletteId(input.palette)) {
      throw new Error("Choose a supported named colour palette");
    }
    return {
      preferences: normalizePersonalAppearance(input),
    };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("user_global_preferences" as never).upsert(
      {
        user_id: context.userId,
        preference_key: PERSONAL_APPEARANCE_KEY,
        preference_value: data.preferences,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "user_id,preference_key" } as never,
    );
    if (error) throw new Error(error.message);
    return data.preferences;
  });
