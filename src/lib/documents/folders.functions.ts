import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";

const cleanName = (name: string) => {
  const value = name.trim();
  if (!value || value.length > 120 || /[\x00-\x1f\x7f]/.test(value))
    throw new Error("Folder name must contain 1–120 printable characters");
  return value;
};
const manage = async (supabase: Parameters<typeof assertCompanyPermission>[0], companyId: string) => {
  // Match the existing company-attachment manage permission set.
  for (const permission of ["sales.draft", "purchases.draft", "accounting.post"] as const) {
    try { await assertCompanyPermission(supabase, companyId, permission); return; } catch { /* next */ }
  }
  throw new Error("You do not have permission to manage document folders");
};
export const listDocumentFolders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { companyId: string }) => ({ companyId: assertUuid(v.companyId) }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: rows, error } = await context.supabase.from("document_folders" as never)
      .select("id, name, parent_id, created_at, updated_at" as never)
      .eq("company_id" as never, data.companyId as never)
      .order("name" as never, { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
export const createDocumentFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { companyId: string; name: string; parentId?: string | null }) => ({
    companyId: assertUuid(v.companyId), name: cleanName(v.name),
    parentId: v.parentId ? assertUuid(v.parentId) : null,
  }))
  .handler(async ({ data, context }) => {
    await manage(context.supabase, data.companyId);
    const { data: row, error } = await context.supabase.from("document_folders" as never)
      .insert({ company_id: data.companyId, name: data.name, parent_id: data.parentId,
        created_by: context.userId } as never).select("id" as never).single();
    if (error) throw new Error(error.message);
    return row;
  });
export const updateDocumentFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { companyId: string; folderId: string; name: string; parentId?: string | null }) => ({
    companyId: assertUuid(v.companyId), folderId: assertUuid(v.folderId), name: cleanName(v.name),
    parentId: v.parentId ? assertUuid(v.parentId) : null,
  }))
  .handler(async ({ data, context }) => {
    await manage(context.supabase, data.companyId);
    const { data: rows, error } = await context.supabase.from("document_folders" as never)
      .update({ name: data.name, parent_id: data.parentId, updated_at: new Date().toISOString() } as never)
      .eq("company_id" as never, data.companyId as never).eq("id" as never, data.folderId as never)
      .select("id" as never);
    if (error) throw new Error(error.message);
    if (!rows || (rows as unknown[]).length !== 1) throw new Error("Folder not found or access denied");
    return { ok: true as const };
  });
export const deleteDocumentFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { companyId: string; folderId: string }) => ({
    companyId: assertUuid(v.companyId), folderId: assertUuid(v.folderId),
  }))
  .handler(async ({ data, context }) => {
    await manage(context.supabase, data.companyId);
    // RESTRICT FKs prevent deletion of folders containing documents or subfolders.
    const { data: rows, error } = await context.supabase.from("document_folders" as never)
      .delete().eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.folderId as never).select("id" as never);
    if (error) throw new Error(error.message);
    if (!rows || (rows as unknown[]).length !== 1) throw new Error("Folder not found or access denied");
    return { ok: true as const };
  });
export const moveDocumentToFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { companyId: string; attachmentId: string; folderId?: string | null }) => ({
    companyId: assertUuid(v.companyId), attachmentId: assertUuid(v.attachmentId),
    folderId: v.folderId ? assertUuid(v.folderId) : null,
  }))
  .handler(async ({ data, context }) => {
    await manage(context.supabase, data.companyId);
    // DB RLS enforces entity-specific permissions on the attachment update.
    const { data: rows, error } = await context.supabase.from("document_attachments" as never)
      .update({ folder_id: data.folderId } as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.attachmentId as never).select("id" as never);
    if (error) throw new Error(error.message);
    if (!rows || (rows as unknown[]).length !== 1) throw new Error("Document not found or access denied");
    return { ok: true as const };
  });
