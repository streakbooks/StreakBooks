import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  COMPANY_DOCUMENTS_BUCKET,
  isAttachmentEntityType,
  parseStoragePath,
} from "@/lib/documents/attachments";
import { assertEntityAccess } from "@/lib/documents/attachments.functions";
import { filePreviewKind } from "@/lib/documents/file-workspace";
import {
  assertVersionHistory,
  validateVersionReplacement,
  type FileVersionItem,
} from "@/lib/documents/file-versions";

const migrationHint =
  "Document versions require migration 20261106170000_document_attachment_versions.";

type ParentFile = {
  id: string;
  entity_type: string;
  entity_id: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  storage_bucket: string | null;
  storage_path: string | null;
  uploaded_by: string | null;
  created_at: string;
  current_version: number;
};

function dbError(error: { code?: string; message: string }): never {
  if (["42P01", "42703", "42883"].includes(error.code ?? ""))
    throw new Error(migrationHint);
  throw new Error(error.message);
}

async function readParent(
  supabase: Parameters<typeof assertCompanyMember>[0],
  companyId: string,
  attachmentId: string,
  action: "view" | "manage",
): Promise<ParentFile> {
  await assertCompanyMember(supabase, companyId);
  const { data: row, error } = await supabase
    .from("document_attachments" as never)
    .select(
      "id, entity_type, entity_id, file_name, content_type, size_bytes, " +
      "storage_bucket, storage_path, uploaded_by, created_at, current_version" as never,
    )
    .eq("company_id" as never, companyId as never)
    .eq("id" as never, attachmentId as never)
    .maybeSingle();
  if (error) dbError(error);
  if (!row) throw new Error("File not found or access denied.");
  const file = row as unknown as ParentFile;
  if (!isAttachmentEntityType(file.entity_type)) throw new Error("Unsupported attachment type.");
  await assertEntityAccess(supabase, companyId, file.entity_type, action);
  if (
    file.storage_bucket !== COMPANY_DOCUMENTS_BUCKET ||
    !file.storage_path?.startsWith(
      `${companyId}/${file.entity_type}/${file.entity_id}/`,
    )
  ) throw new Error("Version history requires a private Storage-backed document.");
  return file;
}

type StoredVersion = {
  version: number;
  file_name: string;
  content_type: string | null;
  size_bytes: number;
  storage_bucket: string;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
};

export const listFileVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; attachmentId: string }) => ({
    companyId: assertUuid(input.companyId),
    attachmentId: assertUuid(input.attachmentId, "file"),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const file = await readParent(supabase, data.companyId, data.attachmentId, "view");
    if (file.current_version === 1) {
      const current: FileVersionItem = {
        version: 1,
        isCurrent: true,
        fileName: file.file_name,
        contentType: file.content_type,
        sizeBytes: file.size_bytes,
        uploadedBy: file.uploaded_by,
        createdAt: file.created_at,
      };
      return { currentVersion: 1, versions: [current] };
    }
    const { data: rows, error } = await supabase
      .from("document_attachment_versions" as never)
      .select(
        "version, file_name, content_type, size_bytes, storage_bucket, " +
        "storage_path, uploaded_by, created_at" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("attachment_id" as never, data.attachmentId as never)
      .order("version" as never, { ascending: false })
      .limit(50);
    if (error) dbError(error);
    const items = (rows ?? []) as unknown as StoredVersion[];
    const versions: FileVersionItem[] = items.map((item) => ({
      version: item.version,
      isCurrent: item.version === file.current_version,
      fileName: item.version === file.current_version ? file.file_name : item.file_name,
      contentType: item.content_type,
      sizeBytes: item.size_bytes,
      uploadedBy: item.uploaded_by,
      createdAt: item.created_at,
    }));
    assertVersionHistory(versions, file.current_version);
    return { currentVersion: file.current_version, versions };
  });

export const registerFileVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    attachmentId: string;
    expectedVersion: number;
    storagePath: string;
    fileName: string;
    sizeBytes: number;
    contentType: string;
  }) => {
    const expectedVersion = Number(input.expectedVersion);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || expectedVersion >= 50)
      throw new Error("Invalid or exhausted document version.");
    const companyId = assertUuid(input.companyId);
    const attachmentId = assertUuid(input.attachmentId, "file");
    const parsed = parseStoragePath(input.storagePath ?? "");
    if (!parsed || parsed.companyId !== companyId)
      throw new Error("Invalid company Storage path.");
    return {
      companyId, attachmentId, expectedVersion,
      storagePath: input.storagePath,
      fileName: input.fileName,
      sizeBytes: input.sizeBytes,
      contentType: input.contentType,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const file = await readParent(supabase, data.companyId, data.attachmentId, "manage");
    if (file.current_version !== data.expectedVersion)
      throw new Error("A newer file version already exists. Refresh before trying again.");
    const validated = validateVersionReplacement(file.file_name, {
      name: data.fileName, size: data.sizeBytes, type: data.contentType,
    }, file.current_version);
    const parsed = parseStoragePath(data.storagePath);
    if (
      !parsed ||
      parsed.companyId !== data.companyId ||
      parsed.entityType !== file.entity_type ||
      parsed.entityId !== file.entity_id ||
      data.storagePath === file.storage_path
    ) throw new Error("Replacement Storage path is not part of this document.");

    // Confirm the browser uploaded the exact file through its own scoped Storage session.
    const folder = data.storagePath.slice(0, data.storagePath.lastIndexOf("/"));
    const objectName = parsed.file;
    const { data: objects, error: objectError } = await supabase.storage
      .from(COMPANY_DOCUMENTS_BUCKET)
      .list(folder, { search: objectName, limit: 10 });
    if (objectError) throw new Error(objectError.message);
    const object = objects?.find((entry) => entry.name === objectName);
    if (!object) throw new Error("Replacement upload was not found.");
    const size = Number((object.metadata as { size?: unknown } | null)?.size);
    if (size !== validated.sizeBytes)
      throw new Error("Uploaded replacement does not match its recorded size.");

    const { data: version, error } = await supabase.rpc(
      "commit_document_attachment_version" as never,
      {
        _company_id: data.companyId,
        _attachment_id: data.attachmentId,
        _expected_version: data.expectedVersion,
        _new_storage_path: data.storagePath,
        _new_size_bytes: validated.sizeBytes,
        _new_content_type: validated.contentType,
      } as never,
    );
    if (error) dbError(error);
    if (version !== data.expectedVersion + 1)
      throw new Error("Could not verify the new document version.");
    try {
      await (
        supabase as unknown as {
          rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>;
        }
      ).rpc("record_audit_event", {
        _company_id: data.companyId,
        _action: "document.version.create",
        _entity_type: file.entity_type,
        _entity_id: file.entity_id,
        _details: {
          attachment_id: data.attachmentId,
          version,
          previous_version: data.expectedVersion,
        },
      });
    } catch {
      // A failed audit delivery does not undo the committed version transaction.
    }
    return { version };
  });

export const downloadFileVersion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; attachmentId: string; version: number }) => {
    const version = Number(input.version);
    if (!Number.isSafeInteger(version) || version < 1 || version > 50)
      throw new Error("Invalid version number.");
    return {
      companyId: assertUuid(input.companyId),
      attachmentId: assertUuid(input.attachmentId, "file"),
      version,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const file = await readParent(supabase, data.companyId, data.attachmentId, "view");
    if (data.version > file.current_version)
      throw new Error("Requested document version does not exist.");
    let path = file.storage_path!;
    let name = file.file_name;
    let mime = file.content_type;
    if (data.version !== file.current_version) {
      const { data: row, error } = await supabase
        .from("document_attachment_versions" as never)
        .select("file_name, content_type, storage_path, storage_bucket" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("attachment_id" as never, data.attachmentId as never)
        .eq("version" as never, data.version as never)
        .maybeSingle();
      if (error) dbError(error);
      if (!row) throw new Error("Requested historical version was not found.");
      const previous = row as unknown as StoredVersion;
      if (previous.storage_bucket !== COMPANY_DOCUMENTS_BUCKET)
        throw new Error("Unavailable historical version.");
      path = previous.storage_path;
      name = previous.file_name;
      mime = previous.content_type;
    }
    if (!path.startsWith(`${data.companyId}/${file.entity_type}/${file.entity_id}/`))
      throw new Error("Historical version has an invalid Storage location.");
    const { data: signed, error: signedError } = await supabase.storage
      .from(COMPANY_DOCUMENTS_BUCKET)
      .createSignedUrl(path, 120, { download: name });
    if (signedError || !signed)
      throw new Error(signedError?.message ?? "Could not download historical version.");
    return {
      kind: "url" as const,
      url: signed.signedUrl,
      fileName: name,
      contentType: mime,
    };
  });
