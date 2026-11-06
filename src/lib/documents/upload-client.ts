/**
 * Browser-side upload to the private company-documents bucket, then metadata registration.
 * The user's own session uploads the object, so Storage policies (company + permission) apply.
 */
import { supabase } from "@/integrations/supabase/client";
import { validateVersionReplacement } from "@/lib/documents/file-versions";
import {
  COMPANY_DOCUMENTS_BUCKET,
  buildStoragePath,
  validateUpload,
  type AttachmentEntityType,
} from "@/lib/documents/attachments";

export type RegisterFn = (args: {
  data: {
    companyId: string;
    entityType: string;
    entityId: string;
    storagePath: string;
    fileName: string;
    contentType?: string;
    folderId?: string | null;
  };
}) => Promise<{ id: string }>;

export async function uploadCompanyDocument(input: {
  file: File;
  companyId: string;
  entityType: AttachmentEntityType;
  entityId: string;
  register: RegisterFn;
  folderId?: string | null;
}): Promise<{ id: string }> {
  const { file } = input;
  const check = validateUpload({
    fileName: file.name,
    sizeBytes: file.size,
    contentType: file.type,
  });
  if (!check.ok) throw new Error(check.error);

  const storagePath = buildStoragePath({
    companyId: input.companyId,
    entityType: input.entityType,
    entityId: input.entityId,
    uniqueId: crypto.randomUUID(),
    fileName: file.name,
  });
  const { error } = await supabase.storage
    .from(COMPANY_DOCUMENTS_BUCKET)
    .upload(storagePath, file, {
      ...(file.type ? { contentType: file.type } : {}),
      upsert: false,
    });
  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new Error(
        "File storage is not set up yet (migration 20261025200100). Ask an administrator to apply the latest migrations.",
      );
    }
    if (/row-level security|not authorized|unauthorized/i.test(error.message)) {
      throw new Error("You do not have permission to add files here.");
    }
    throw new Error(error.message);
  }
  try {
    return await input.register({
      data: {
        companyId: input.companyId,
        entityType: input.entityType,
        entityId: input.entityId,
        storagePath,
        fileName: file.name,
        ...(file.type ? { contentType: file.type } : {}),
        folderId: input.folderId ?? null,
      },
    });
  } catch (e) {
    // The server removes the object on most failures; try again in case it could not.
    await supabase.storage.from(COMPANY_DOCUMENTS_BUCKET).remove([storagePath]);
    throw e;
  }
}

/** Trigger a browser download for base64 content (legacy inline attachments). */
export function downloadBase64(fileName: string, contentType: string | null, base64: string): void {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(
    new Blob([bytes], { type: contentType || "application/octet-stream" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


/**
 * Upload a fresh immutable object for an existing document; only the server RPC
 * advances its current-version pointer. Never overwrite an earlier Storage key.
 */
export type RegisterVersionFn = (args: {
  data: {
    companyId: string;
    attachmentId: string;
    expectedVersion: number;
    storagePath: string;
    fileName: string;
    sizeBytes: number;
    contentType: string;
  };
}) => Promise<{ version: number }>;

export async function uploadDocumentVersion(input: {
  file: File;
  companyId: string;
  attachmentId: string;
  entityType: AttachmentEntityType;
  entityId: string;
  currentName: string;
  expectedVersion: number;
  register: RegisterVersionFn;
}): Promise<{ version: number }> {
  const validated = validateVersionReplacement(
    input.currentName,
    input.file,
    input.expectedVersion,
  );
  const storagePath = buildStoragePath({
    companyId: input.companyId,
    entityType: input.entityType,
    entityId: input.entityId,
    uniqueId: crypto.randomUUID(),
    fileName: input.file.name,
  });
  const { error } = await supabase.storage
    .from(COMPANY_DOCUMENTS_BUCKET)
    .upload(storagePath, input.file, {
      contentType: validated.contentType,
      upsert: false,
    });
  if (error) {
    if (/row-level security|not authorized|unauthorized/i.test(error.message))
      throw new Error("You do not have permission to upload a replacement.");
    throw new Error(error.message);
  }

  // Important: a lost network response can occur after the RPC commits.
  // Do not delete the newly uploaded object on an ambiguous error: doing so could
  // destroy the current committed version. Report a possible orphan for later
  // administrator cleanup instead.
  try {
    return await input.register({
      data: {
        companyId: input.companyId,
        attachmentId: input.attachmentId,
        expectedVersion: input.expectedVersion,
        storagePath,
        fileName: validated.fileName,
        sizeBytes: validated.sizeBytes,
        contentType: validated.contentType,
      },
    });
  } catch (error) {
    throw new Error(
      "Version could not be confirmed. Refresh the file history before retrying. " +
      "An unlinked uploaded object may need administrator cleanup. " +
      (error instanceof Error ? error.message : "Upload failed."),
    );
  }
}
