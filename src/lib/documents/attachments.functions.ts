import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  COMPANY_DOCUMENTS_BUCKET,
  MAX_FILE_BYTES,
  entityLabel,
  entityPath,
  isAttachmentEntityType,
  parseStoragePath,
  validateUpload,
  type AttachmentEntityType,
} from "@/lib/documents/attachments";
import { entityManagePermissions, entityViewPermissions } from "@/lib/documents/record-activity";
import { escapeLikeLiteral } from "@/lib/sales/list-filters";
import {
  fileFormatMimeTypes,
  filePreviewKind,
  fileSortOrder,
  parseFileFormat,
  parseFileSort,
  validateFileRename,
} from "@/lib/documents/file-workspace";
import { folderDescendantIds } from "@/lib/documents/folder-tree";

const MIGRATION_HINT =
  "File storage needs a database update that has not been applied yet (migration 20261025200100). Ask an administrator to apply the latest migrations.";

export type AttachmentRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
  uploaded_by: string | null;
  storage_bucket: string | null;
  folder_id: string | null;
};

const COLUMNS =
  "id, entity_type, entity_id, file_name, content_type, size_bytes, created_at, uploaded_by, storage_bucket, folder_id";

/** View or manage, matching ATTACHMENT_ENTITIES. Any listed permission is enough. */
export async function assertEntityAccess(
  supabase: Parameters<typeof assertCompanyPermission>[0],
  companyId: string,
  entityType: AttachmentEntityType,
  action: "view" | "manage",
): Promise<void> {
  const permissions =
    action === "view" ? entityViewPermissions(entityType) : entityManagePermissions(entityType);
  if (permissions.length === 0) {
    await assertCompanyMember(supabase, companyId);
    return;
  }
  let denied: unknown = null;
  for (const permission of permissions) {
    try {
      await assertCompanyPermission(supabase, companyId, permission);
      return;
    } catch (error) {
      denied = error;
    }
  }
  throw denied instanceof Error
    ? denied
    : new Error("You do not have permission to perform this action for this organisation.");
}

function entityInput(input: { companyId: string; entityType: string; entityId: string }) {
  if (!isAttachmentEntityType(input.entityType))
    throw new Error("Files cannot be attached to this record type.");
  return {
    companyId: assertUuid(input.companyId),
    entityType: input.entityType as AttachmentEntityType,
    entityId: assertUuid(input.entityId, "record"),
  };
}

export const listAttachments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(entityInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertEntityAccess(supabase, data.companyId, data.entityType, "view");
    const { data: rows, error } = await supabase
      .from("document_attachments" as never)
      .select(COLUMNS as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("entity_type" as never, data.entityType as never)
      .eq("entity_id" as never, data.entityId as never)
      .order("created_at" as never, { ascending: false } as never);
    if (error) {
      if (error.code === "42703") throw new Error(MIGRATION_HINT);
      throw new Error(error.message);
    }
    return (rows ?? []) as unknown as AttachmentRow[];
  });

/**
 * Called after the browser has uploaded the object to Storage. Verifies the object really exists
 * (and its real size), then records the metadata row. A failure removes the orphaned object.
 */
export const registerAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      entityType: string;
      entityId: string;
      storagePath: string;
      fileName: string;
      contentType?: string;
      folderId?: string | null;
    }) => {
      const base = entityInput(input);
      const parts = parseStoragePath(input.storagePath ?? "");
      if (
        !parts ||
        parts.companyId.toLowerCase() !== base.companyId.toLowerCase() ||
        parts.entityType !== base.entityType ||
        parts.entityId.toLowerCase() !== base.entityId.toLowerCase()
      ) {
        throw new Error("The uploaded file path does not match the record.");
      }
      const fileName = (input.fileName ?? "").trim().slice(0, 255);
      if (!fileName) throw new Error("File name is required");
      return {
        ...base,
        storagePath: input.storagePath,
        fileName,
        contentType: (input.contentType ?? "").trim().slice(0, 120) || null,
        folder: input.storagePath.slice(0, input.storagePath.lastIndexOf("/")),
        objectName: parts.file,
        folderId: input.folderId ? assertUuid(input.folderId, "folder") : null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const bucket = supabase.storage.from(COMPANY_DOCUMENTS_BUCKET);
    try {
      await assertEntityAccess(supabase, data.companyId, data.entityType, "manage");
    } catch (error) {
      await bucket.remove([data.storagePath]);
      throw error;
    }

    // The object must exist; its real size is what we validate and store.
    const listed = await bucket.list(data.folder, { limit: 5, search: data.objectName });
    const obj = listed.data?.find((o) => o.name === data.objectName);
    if (!obj) throw new Error("The uploaded file was not found. Please try again.");
    const size = Number((obj.metadata as { size?: number } | null)?.size ?? 0);

    const check = validateUpload({
      fileName: data.fileName,
      sizeBytes: size,
      contentType: data.contentType,
    });
    if (!check.ok || size > MAX_FILE_BYTES) {
      await bucket.remove([data.storagePath]);
      throw new Error(check.ok ? "Max file size: 20 MB" : check.error);
    }

    const { data: row, error } = await supabase
      .from("document_attachments" as never)
      .insert({
        company_id: data.companyId,
        entity_type: data.entityType,
        entity_id: data.entityId,
        file_name: data.fileName,
        storage_path: data.storagePath,
        storage_bucket: COMPANY_DOCUMENTS_BUCKET,
        content_type: data.contentType,
        size_bytes: size,
        uploaded_by: context.userId,
        folder_id: data.folderId,
      } as never)
      .select("id" as never)
      .single();
    if (error) {
      await bucket.remove([data.storagePath]);
      if (error.code === "42703") throw new Error(MIGRATION_HINT);
      if (error.code === "42501") throw new Error("You do not have permission to add files here.");
      throw new Error(error.message);
    }
    const id = (row as unknown as { id: string }).id;
    await (
      supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>;
      }
    ).rpc("record_audit_event", {
      _company_id: data.companyId,
      _action: "document.attachment.upload",
      _entity_type: data.entityType,
      _entity_id: data.entityId,
      _details: { attachment_id: id, file_name: data.fileName, size_bytes: size },
    });
    return { id };
  });

export const getAttachmentDownload = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; attachmentId: string }) => ({
    companyId: assertUuid(input.companyId),
    attachmentId: assertUuid(input.attachmentId, "file"),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // RLS applies the per-entity view permission: a hidden file is simply "not found".
    const { data: row, error } = await supabase
      .from("document_attachments" as never)
      .select("id, file_name, content_type, storage_path, storage_bucket, content_base64" as never)
      .eq("id" as never, data.attachmentId as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("File not found");
    const r = row as unknown as {
      file_name: string;
      content_type: string | null;
      storage_path: string;
      storage_bucket: string | null;
      content_base64: string | null;
    };
    if (r.storage_bucket === COMPANY_DOCUMENTS_BUCKET) {
      if (!r.storage_path.startsWith(`${data.companyId}/`)) throw new Error("File not found");
      const { data: signed, error: sErr } = await supabase.storage
        .from(COMPANY_DOCUMENTS_BUCKET)
        .createSignedUrl(r.storage_path, 120, { download: r.file_name });
      if (sErr || !signed) throw new Error(sErr?.message ?? "Could not create a download link");
      return { kind: "url" as const, url: signed.signedUrl, fileName: r.file_name };
    }
    // Older attachments keep their content inside the row.
    if (!r.content_base64) throw new Error("This file's content is not available.");
    return {
      kind: "inline" as const,
      fileName: r.file_name,
      contentType: r.content_type,
      contentBase64: r.content_base64,
    };
  });

/** Short-lived, view-only URL for safe inline formats. No download disposition or public bucket. */
export const getAttachmentPreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; attachmentId: string }) => ({
    companyId: assertUuid(input.companyId),
    attachmentId: assertUuid(input.attachmentId, "file"),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    // Document RLS includes record-level permissions; never use a service-role client here.
    const { data: row, error } = await context.supabase
      .from("document_attachments" as never)
      .select("file_name, content_type, storage_path, storage_bucket, content_base64" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.attachmentId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("File not found");
    const file = row as unknown as {
      file_name: string;
      content_type: string | null;
      storage_path: string | null;
      storage_bucket: string | null;
      content_base64: string | null;
    };
    const previewType = filePreviewKind(file.content_type, file.file_name);
    if (!previewType) return { kind: "unsupported" as const };
    if (file.storage_bucket === COMPANY_DOCUMENTS_BUCKET) {
      if (!file.storage_path?.startsWith(`${data.companyId}/`)) throw new Error("File not found");
      const { data: signed, error: signedError } = await context.supabase.storage
        .from(COMPANY_DOCUMENTS_BUCKET)
        .createSignedUrl(file.storage_path, 120);
      if (signedError || !signed)
        throw new Error(signedError?.message ?? "Could not load the preview");
      return { kind: "url" as const, url: signed.signedUrl, previewType };
    }
    if (!file.content_base64) throw new Error("This file's content is not available.");
    return {
      kind: "inline" as const,
      contentBase64: file.content_base64,
      contentType: file.content_type!,
      previewType,
    };
  });

export const deleteAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; attachmentId: string }) => ({
    companyId: assertUuid(input.companyId),
    attachmentId: assertUuid(input.attachmentId, "file"),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertCompanyMember(supabase, data.companyId);
    const { data: row } = await supabase
      .from("document_attachments" as never)
      .select("id, entity_type, entity_id, file_name, storage_path, storage_bucket" as never)
      .eq("id" as never, data.attachmentId as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (!row) throw new Error("File not found");
    const r = row as unknown as {
      entity_type: string;
      entity_id: string;
      file_name: string;
      storage_path: string;
      storage_bucket: string | null;
    };
    // RLS only lets a user with the right "manage" permission delete: confirm a row went away.
    const { data: deleted, error } = await supabase
      .from("document_attachments" as never)
      .delete()
      .eq("id" as never, data.attachmentId as never)
      .eq("company_id" as never, data.companyId as never)
      .select("id" as never);
    if (error) throw new Error(error.message);
    if (!deleted || (deleted as unknown[]).length === 0) {
      throw new Error("You do not have permission to delete this file.");
    }
    // Storage and Postgres cannot be deleted atomically. Report cleanup failures honestly:
    // the metadata is already gone, so callers must not retry deletion of the same row.
    let storageCleanup: "complete" | "requires_admin" = "complete";
    if (r.storage_bucket === COMPANY_DOCUMENTS_BUCKET) {
      try {
        const { error: storageError } = await supabase.storage
          .from(COMPANY_DOCUMENTS_BUCKET)
          .remove([r.storage_path]);
        if (storageError) storageCleanup = "requires_admin";
      } catch {
        storageCleanup = "requires_admin";
      }
    }
    try {
      await (
        supabase as unknown as {
          rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>;
        }
      ).rpc("record_audit_event", {
        _company_id: data.companyId,
        _action: "document.attachment.delete",
        _entity_type: r.entity_type,
        _entity_id: r.entity_id,
        _details: {
          attachment_id: data.attachmentId,
          file_name: r.file_name,
          storage_cleanup: storageCleanup,
          ...(storageCleanup === "requires_admin" ? { storage_path: r.storage_path } : {}),
        },
      });
    } catch {
      // Audit delivery cannot roll back the metadata delete; surface the cleanup outcome.
    }
    return { ok: true as const, storageCleanup };
  });


/**
 * Rename the displayed/downloaded filename only. The private Storage object stays at
 * its original immutable key; moving objects is not required and existing links survive.
 */
export const renameAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; attachmentId: string; fileName: string }) => ({
    companyId: assertUuid(input.companyId),
    attachmentId: assertUuid(input.attachmentId, "file"),
    fileName: input.fileName ?? "",
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertCompanyMember(supabase, data.companyId);
    const { data: row, error: readError } = await supabase
      .from("document_attachments" as never)
      .select("id, entity_type, entity_id, file_name" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.attachmentId as never)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!row) throw new Error("File not found or access denied");
    const current = row as unknown as {
      entity_type: string;
      entity_id: string;
      file_name: string;
    };
    if (!isAttachmentEntityType(current.entity_type))
      throw new Error("This file type cannot be renamed here.");
    await assertEntityAccess(supabase, data.companyId, current.entity_type, "manage");
    const fileName = validateFileRename(current.file_name, data.fileName);
    if (fileName === current.file_name) return { fileName };

    const { data: updated, error } = await supabase
      .from("document_attachments" as never)
      .update({ file_name: fileName } as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.attachmentId as never)
      .eq("file_name" as never, current.file_name as never)
      .select("id" as never);
    if (error) throw new Error(error.message);
    if (!updated || (updated as unknown[]).length !== 1)
      throw new Error("The file was changed or you do not have permission. Refresh and retry.");

    await (
      supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>;
      }
    ).rpc("record_audit_event", {
      _company_id: data.companyId,
      _action: "document.attachment.rename",
      _entity_type: current.entity_type,
      _entity_id: current.entity_id,
      _details: {
        attachment_id: data.attachmentId,
        old_file_name: current.file_name,
        new_file_name: fileName,
      },
    });
    return { fileName };
  });

const REF_TABLES: Record<string, { table: string; column: string }> = {
  sales_invoice: { table: "sales_invoices", column: "invoice_number" },
  sales_quote: { table: "sales_quotes", column: "quote_number" },
  sales_credit_note: { table: "sales_credit_notes", column: "credit_number" },
  purchase_bill: { table: "purchase_bills", column: "bill_number" },
  purchase_order: { table: "purchase_orders", column: "order_number" },
  purchase_credit_note: { table: "purchase_credit_notes", column: "credit_number" },
  contact: { table: "contacts", column: "name" },
  purchase_expense: { table: "purchase_expenses", column: "payee_name" },
  product: { table: "products", column: "name" },
  project: { table: "projects", column: "name" },
};

export type CompanyFileRow = AttachmentRow & {
  entityLabel: string;
  entityRef: string | null;
  entityPath: string | null;
};


/** Resolve one file independently of pagination; RLS still gates record-level visibility. */
export const getCompanyFile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; attachmentId: string }) => ({
    companyId: assertUuid(input.companyId),
    attachmentId: assertUuid(input.attachmentId, "file"),
  }))
  .handler(async ({ data, context }): Promise<CompanyFileRow> => {
    const { supabase } = context;
    await assertCompanyMember(supabase, data.companyId);
    const { data: row, error } = await supabase
      .from("document_attachments" as never)
      .select(COLUMNS as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.attachmentId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("File not found or access denied");
    const attachment = row as unknown as AttachmentRow;
    let entityRef: string | null = null;
    const ref = REF_TABLES[attachment.entity_type];
    if (ref) {
      const { data: record, error: refError } = await supabase
        .from(ref.table as never)
        .select(`id, ${ref.column}` as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("id" as never, attachment.entity_id as never)
        .maybeSingle();
      if (refError) throw new Error(refError.message);
      const name = (record as unknown as Record<string, string | null> | null)?.[ref.column];
      entityRef = name || null;
    }
    return {
      ...attachment,
      entityLabel: entityLabel(attachment.entity_type),
      entityRef,
      entityPath: entityPath(attachment.entity_type, attachment.entity_id),
    };
  });

/** Organisation-wide Files list (RLS limits it to what the user may view). */
export const listCompanyFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      search?: string;
      entityType?: string;
      sort?: string;
      format?: string;
      includeSubfolders?: boolean;
      page?: number;
      pageSize?: number;
      folderId?: string | null;
      unfiledOnly?: boolean;
    }) => ({
      companyId: assertUuid(input.companyId),
      search: (input.search ?? "").trim().slice(0, 80),
      sort: parseFileSort(input.sort),
      format: parseFileFormat(input.format),
      includeSubfolders: input.includeSubfolders === true,
      entityType: input.entityType && input.entityType !== "all" ? input.entityType : null,
      folderId: input.folderId ? assertUuid(input.folderId) : null,
      unfiledOnly: input.unfiledOnly === true,
      page: Math.max(0, Math.floor(Number(input.page) || 0)),
      pageSize: Math.min(100, Math.max(5, Math.floor(Number(input.pageSize) || 25))),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertCompanyMember(supabase, data.companyId);
    let q = supabase
      .from("document_attachments" as never)
      .select(COLUMNS as never, { count: "exact" })
      .eq("company_id" as never, data.companyId as never);
    if (data.entityType) q = q.eq("entity_type" as never, data.entityType as never);
    const mimeTypes = fileFormatMimeTypes(data.format);
    if (mimeTypes.length) q = q.in("content_type" as never, [...mimeTypes] as never);
    if (data.folderId && data.includeSubfolders) {
      // Never trust a client-provided list of descendants or traverse outside this company.
      const { data: folderRows, error: folderError, count: folderCount } = await supabase
        .from("document_folders" as never)
        .select("id, parent_id" as never, { count: "exact" })
        .eq("company_id" as never, data.companyId as never)
        .limit(1000);
      if (folderError) throw new Error(folderError.message);
      if (
        folderCount == null ||
        folderCount > 1000 ||
        folderCount !== (folderRows ?? []).length
      )
        throw new Error("Folder list is too large or incomplete for a recursive search.");
      const ids = folderDescendantIds(
        (folderRows ?? []) as unknown as Array<{ id: string; parent_id: string | null }>,
        data.folderId,
      );
      if (!ids.length) throw new Error("Folder not found in this organisation.");
      q = q.in("folder_id" as never, ids as never);
    } else if (data.folderId) {
      q = q.eq("folder_id" as never, data.folderId as never);
    } else if (data.unfiledOnly) {
      q = q.is("folder_id" as never, null);
    }
    if (data.search)
      q = q.ilike("file_name" as never, `%${escapeLikeLiteral(data.search)}%` as never);
    const from = data.page * data.pageSize;
    // Order before pagination. Sorting only the returned page gives incorrect global results.
    const order = fileSortOrder(data.sort);
    const {
      data: rows,
      error,
      count,
    } = await q
      .order(
        order.column as never,
        {
          ascending: order.ascending,
          nullsFirst: false,
        } as never,
      )
      .order("id" as never, { ascending: true } as never)
      .range(from, from + data.pageSize - 1);
    if (error) {
      if (error.code === "42703") throw new Error(MIGRATION_HINT);
      throw new Error(error.message);
    }
    const list = (rows ?? []) as unknown as AttachmentRow[];

    // Resolve a readable reference (invoice number, contact name...) per entity type.
    const refs = new Map<string, string>();
    const byType = new Map<string, string[]>();
    for (const r of list) {
      if (REF_TABLES[r.entity_type])
        byType.set(r.entity_type, [...(byType.get(r.entity_type) ?? []), r.entity_id]);
    }
    for (const [type, ids] of byType) {
      const t = REF_TABLES[type]!;
      const res = await supabase
        .from(t.table as never)
        .select(`id, ${t.column}` as never)
        .eq("company_id" as never, data.companyId as never)
        .in("id" as never, [...new Set(ids)] as never);
      for (const rec of (res.data ?? []) as unknown as Array<Record<string, string | null>>) {
        const v = rec[t.column];
        if (v) refs.set(`${type}:${rec["id"]}`, v);
      }
    }
    const files: CompanyFileRow[] = list.map((r) => ({
      ...r,
      entityLabel: entityLabel(r.entity_type),
      entityRef: refs.get(`${r.entity_type}:${r.entity_id}`) ?? null,
      entityPath: entityPath(r.entity_type, r.entity_id),
    }));
    return { files, total: count ?? files.length, page: data.page, pageSize: data.pageSize };
  });
