import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  CONTACT_PREFERENCE_KEYS,
  normalizeContactPreference,
  readCloudContactPreferences,
  type ContactPreferenceKind,
} from "@/lib/contacts/contact-directory-preferences";

/**
 * Cloud preferences are private to the authenticated user AND the active company.
 * Reuses the existing user_ui_preferences table and its RLS policies.
 */
export const getContactDirectoryPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input.companyId),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: rows, error } = await context.supabase
      .from("user_ui_preferences" as never)
      .select("preference_key,preference_value" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("user_id" as never, context.userId as never)
      .in("preference_key" as never, Object.values(CONTACT_PREFERENCE_KEYS) as never);
    if (error) throw new Error(error.message);
    return readCloudContactPreferences(
      (rows ?? []) as Array<{ preference_key: string; preference_value: unknown }>,
    );
  });

/**
 * The client never supplies user_id or the database preference_key.
 * Values are normalized on the server before storage.
 */
export const saveContactDirectoryPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; kind: ContactPreferenceKind; value: unknown }) => {
    if (input.kind !== "columns" && input.kind !== "views") {
      throw new Error("Unsupported Contacts preference");
    }
    return {
      companyId: assertUuid(input.companyId),
      kind: input.kind,
      value: normalizeContactPreference(input.kind, input.value),
    };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { error } = await context.supabase.from("user_ui_preferences" as never).upsert(
      {
        company_id: data.companyId,
        user_id: context.userId,
        preference_key: CONTACT_PREFERENCE_KEYS[data.kind],
        preference_value: data.value,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "company_id,user_id,preference_key" },
    );
    if (error) throw new Error(error.message);
    return { kind: data.kind, value: data.value };
  });
