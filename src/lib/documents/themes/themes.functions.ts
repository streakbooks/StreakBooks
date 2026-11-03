import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember } from "@/lib/assert-company-access";
import {
  THEME_KINDS,
  themeInput,
  normalizeTheme,
  type DocumentTheme,
  type ThemeKind,
} from "./contracts";
const company = z.object({ companyId: z.string().uuid() });
export const listDocumentThemes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => company.parse(input))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const themes = await context.supabase
      .from("document_themes" as never)
      .select("id,company_id,name,config,revision" as never)
      .eq("company_id" as never, data.companyId as never)
      .order("name" as never);
    if (themes.error) throw new Error(themes.error.message);
    const defaults = await context.supabase
      .from("document_theme_defaults" as never)
      .select("kind,theme_id" as never)
      .eq("company_id" as never, data.companyId as never);
    if (defaults.error) throw new Error(defaults.error.message);
    const logoUrls: Record<string, string> = {};
    await Promise.all(
      ((themes.data ?? []) as DocumentTheme[]).map(async (t) => {
        const path = t.config.logo_path;
        if (path && path.startsWith(`${data.companyId}/`)) {
          const r = await context.supabase.storage.from("org-logos").createSignedUrl(path, 3600);
          if (r.error) throw new Error(r.error.message);
          logoUrls[t.id] = r.data.signedUrl;
        }
      }),
    );
    return {
      logoUrls,
      themes: ((themes.data ?? []) as DocumentTheme[]).map((t) => ({
        ...t,
        config: normalizeTheme(t.config),
      })),
      defaults: (defaults.data ?? []) as Array<{ kind: ThemeKind; theme_id: string }>,
    };
  });
export const saveDocumentTheme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => themeInput.parse(input))
  .handler(async ({ data, context }) => {
    const r = await context.supabase.rpc(
      "save_document_theme" as never,
      {
        _company_id: data.companyId,
        _id: data.id,
        _revision: data.revision,
        _name: data.name,
        _config: data.config,
      } as never,
    );
    if (r.error) throw new Error(r.error.message);
    return r.data as DocumentTheme;
  });
export const setDocumentThemeDefault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    company
      .extend({ kind: z.enum(THEME_KINDS), themeId: z.string().uuid().nullable() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const r = await context.supabase.rpc(
      "set_document_theme_default" as never,
      { _company_id: data.companyId, _kind: data.kind, _theme_id: data.themeId } as never,
    );
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });
export const deleteDocumentTheme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    company.extend({ id: z.string().uuid(), revision: z.number().int().positive() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const r = await context.supabase.rpc(
      "delete_document_theme" as never,
      { _company_id: data.companyId, _id: data.id, _revision: data.revision } as never,
    );
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });
