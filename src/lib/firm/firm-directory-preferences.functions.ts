import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertUuid } from "@/lib/company-validation";
import {
  FIRM_DIRECTORY_PREFERENCE_KEYS,
  normalizeFirmDirectoryPreference,
  readFirmDirectoryPreferences,
  type FirmDirectoryPreferenceKind,
} from "./firm-directory-preferences";

/**
 * Firm preferences are private to a user and firm. No client records are
 * selected, modified or exported by these endpoints.
 */
async function assertFirmMember(
  supabase: Parameters<typeof import("@/lib/assert-company-access").assertCompanyMember>[0],
  firmId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("firm_members" as never)
    .select("id" as never)
    .eq("firm_id" as never, firmId as never)
    .eq("user_id" as never, userId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Active firm membership required");
}

export const getFirmDirectoryPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firmId: string }) => ({
    firmId: assertUuid(input.firmId),
  }))
  .handler(async ({ data, context }) => {
    await assertFirmMember(context.supabase, data.firmId, context.userId);
    const { data: rows, error } = await context.supabase
      .from("firm_ui_preferences" as never)
      .select("preference_key,preference_value" as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("user_id" as never, context.userId as never)
      .in("preference_key" as never, Object.values(FIRM_DIRECTORY_PREFERENCE_KEYS) as never);
    if (error) throw new Error(error.message);
    return readFirmDirectoryPreferences(
      (rows ?? []) as Array<{ preference_key: string; preference_value: unknown }>,
    );
  });

export const saveFirmDirectoryPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    firmId: string;
    kind: FirmDirectoryPreferenceKind;
    value: unknown;
  }) => {
    if (input.kind !== "columns" && input.kind !== "views") {
      throw new Error("Unsupported firm preference");
    }
    return {
      firmId: assertUuid(input.firmId),
      kind: input.kind,
      value: normalizeFirmDirectoryPreference(input.kind, input.value),
    };
  })
  .handler(async ({ data, context }) => {
    await assertFirmMember(context.supabase, data.firmId, context.userId);
    const { error } = await context.supabase
      .from("firm_ui_preferences" as never)
      .upsert(
        {
          firm_id: data.firmId,
          user_id: context.userId,
          preference_key: FIRM_DIRECTORY_PREFERENCE_KEYS[data.kind],
          preference_value: data.value,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "firm_id,user_id,preference_key" },
      );
    if (error) throw new Error(error.message);
    return { kind: data.kind, value: data.value };
  });
