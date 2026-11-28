import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { isAttachmentEntityType } from "@/lib/documents/attachments";
import { assertEntityAccess } from "@/lib/documents/attachments.functions";
import { parseFileCategory, validateDocumentTagName } from "@/lib/documents/file-classification";

const migrationHint =
  "Document classifications and tags need migration 20261118150352_files_document_classification_tags.";

function dbError(error: { code?: string; message: string }): never {
  if (error.code === "42P01" || error.code === "42703") throw new Error(migrationHint);
  if (error.code === "23505") throw new Error("A tag with this name already exists.");
  throw new Error(error.message);
}

type TagRow = { id: string; company_id: string; name: string };

/** Existing audit transport; business mutation remains authoritative if audit delivery fails. */
async function auditMetadata(
  supabase: Parameters<typeof assertCompanyMember>[0],
  companyId: string,
  action: string,
  attachmentId: string | null,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await (
      supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>;
      }
    ).rpc("record_app_audit_event", {
      _company_id: companyId,
      _action: action,
      _entity_type: "company",
      _entity_id: companyId,
      _details: { ...(attachmentId ? { attachment_id: attachmentId } : {}), ...details },
    });
  } catch {
    // A failed best-effort audit must not misreport a committed mutation as a failure.
  }
}

export const listDocumentTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({
    companyId: assertUuid(input.companyId),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const {
      data: rows,
      error,
      count,
    } = await context.supabase
      .from("document_tags" as never)
      .select("id, company_id, name" as never, { count: "exact" })
      .eq("company_id" as never, data.companyId as never)
      .order("name" as never, { ascending: true })
      .limit(250);
    if (error) dbError(error);
    if (count == null || count > 250 || count !== (rows ?? []).length)
      throw new Error("Company tag list is too large or incomplete. Ask your administrator.");
    return (rows ?? []) as unknown as TagRow[];
  });

export const createDocumentTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; name: string }) => ({
    companyId: assertUuid(input.companyId),
    name: validateDocumentTagName(input.name),
  }))
  .handler(async ({ data, context }) => {
    await assertEntityAccess(context.supabase, data.companyId, "company", "manage");
    const { data: row, error } = await context.supabase
      .from("document_tags" as never)
      .insert({ company_id: data.companyId, name: data.name } as never)
      .select("id, name" as never)
      .single();
    if (error) dbError(error);
    await auditMetadata(context.supabase, data.companyId, "document.tag.create", null, {
      tag_id: (row as { id: string }).id,
      tag_name: data.name,
    });
    return row as unknown as { id: string; name: string };
  });

export const deleteDocumentTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; tagId: string }) => ({
    companyId: assertUuid(input.companyId),
    tagId: assertUuid(input.tagId, "tag"),
  }))
  .handler(async ({ data, context }) => {
    await assertEntityAccess(context.supabase, data.companyId, "company", "manage");
    const { data: rows, error } = await context.supabase
      .from("document_tags" as never)
      .delete()
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.tagId as never)
      .select("id" as never);
    if (error) dbError(error);
    if ((rows ?? []).length !== 1) throw new Error("Tag not found or access denied.");
    await auditMetadata(context.supabase, data.companyId, "document.tag.delete", null, {
      tag_id: data.tagId,
    });
    return { ok: true as const };
  });

async function visibleFile(
  supabase: Parameters<typeof assertCompanyMember>[0],
  companyId: string,
  attachmentId: string,
  action: "view" | "manage",
) {
  await assertCompanyMember(supabase, companyId);
  const { data: row, error } = await supabase
    .from("document_attachments" as never)
    .select("id, entity_type, file_name, document_category" as never)
    .eq("company_id" as never, companyId as never)
    .eq("id" as never, attachmentId as never)
    .is("deleted_at" as never, null)
    .maybeSingle();
  if (error) dbError(error);
  if (!row) throw new Error("File not found or access denied.");
  const file = row as {
    id: string;
    entity_type: string;
    file_name: string;
    document_category: string;
  };
  if (!isAttachmentEntityType(file.entity_type))
    throw new Error("This file type cannot be classified.");
  await assertEntityAccess(supabase, companyId, file.entity_type, action);
  return file;
}

export const getFileClassification = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; attachmentId: string }) => ({
    companyId: assertUuid(input.companyId),
    attachmentId: assertUuid(input.attachmentId, "file"),
  }))
  .handler(async ({ data, context }) => {
    const file = await visibleFile(context.supabase, data.companyId, data.attachmentId, "view");
    const { data: rows, error } = await context.supabase
      .from("document_attachment_tags" as never)
      .select("tag_id" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("attachment_id" as never, data.attachmentId as never);
    if (error) dbError(error);
    return {
      category: parseFileCategory(file.document_category),
      tagIds: ((rows ?? []) as unknown as Array<{ tag_id: string }>).map((item) => item.tag_id),
      fileName: file.file_name,
      entityType: file.entity_type,
    };
  });

export const updateFileCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      attachmentId: string;
      expectedCategory: string;
      category: string;
    }) => {
      const category = parseFileCategory(input.category);
      const expectedCategory = parseFileCategory(input.expectedCategory);
      if (category !== input.category || expectedCategory !== input.expectedCategory)
        throw new Error("Invalid document category.");
      return {
        companyId: assertUuid(input.companyId),
        attachmentId: assertUuid(input.attachmentId, "file"),
        category,
        expectedCategory,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const file = await visibleFile(context.supabase, data.companyId, data.attachmentId, "manage");
    if (file.document_category !== data.expectedCategory)
      throw new Error("Category changed. Refresh and retry.");
    const { data: rows, error } = await context.supabase
      .from("document_attachments" as never)
      .update({ document_category: data.category } as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.attachmentId as never)
      .eq("document_category" as never, data.expectedCategory as never)
      .select("id" as never);
    if (error) dbError(error);
    if ((rows ?? []).length !== 1)
      throw new Error("Category changed, or you do not have permission. Refresh and retry.");
    await auditMetadata(
      context.supabase,
      data.companyId,
      "document.category.update",
      data.attachmentId,
      {
        previous_category: data.expectedCategory,
        category: data.category,
      },
    );
    return { category: data.category };
  });

export const setDocumentFileTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { companyId: string; attachmentId: string; tagId: string; enabled: boolean }) => ({
      companyId: assertUuid(input.companyId),
      attachmentId: assertUuid(input.attachmentId, "file"),
      tagId: assertUuid(input.tagId, "tag"),
      enabled: input.enabled === true,
    }),
  )
  .handler(async ({ data, context }) => {
    await visibleFile(context.supabase, data.companyId, data.attachmentId, "manage");
    const { data: tag, error: tagError } = await context.supabase
      .from("document_tags" as never)
      .select("id" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.tagId as never)
      .maybeSingle();
    if (tagError) dbError(tagError);
    if (!tag) throw new Error("Tag not found in this organisation.");
    if (data.enabled) {
      const { error } = await context.supabase.from("document_attachment_tags" as never).insert({
        company_id: data.companyId,
        attachment_id: data.attachmentId,
        tag_id: data.tagId,
      } as never);
      // Two simultaneous tag additions may both be authorized; treat the second as success.
      if (error && error.code !== "23505") dbError(error);
    } else {
      const { error } = await context.supabase
        .from("document_attachment_tags" as never)
        .delete()
        .eq("company_id" as never, data.companyId as never)
        .eq("attachment_id" as never, data.attachmentId as never)
        .eq("tag_id" as never, data.tagId as never);
      if (error) dbError(error);
    }
    await auditMetadata(
      context.supabase,
      data.companyId,
      "document.tag.assign",
      data.attachmentId,
      {
        tag_id: data.tagId,
        enabled: data.enabled,
      },
    );
    return { ok: true as const, enabled: data.enabled };
  });
