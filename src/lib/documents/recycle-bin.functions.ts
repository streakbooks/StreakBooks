import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { assertEntityAccess } from "@/lib/documents/attachments.functions";
import { COMPANY_DOCUMENTS_BUCKET, isAttachmentEntityType } from "@/lib/documents/attachments";
import { DEFAULT_DOCUMENT_RETENTION_DAYS, validateRetentionDays } from "@/lib/documents/recycle-bin-rules";
import { safeFilePage } from "@/lib/documents/file-workspace";

const MIGRATION_HINT =
  "Recycle Bin requires migration 20261106183000_files_recycle_retention_cleanup.";

function databaseError(error: { code?: string; message: string }): never {
  if (error.code === "42P01" || error.code === "42703" || error.code === "42883")
    throw new Error(MIGRATION_HINT);
  throw new Error(error.message);
}

type TrashedFile = {
  id: string;
  entity_type: string;
  file_name: string;
  size_bytes: number | null;
  deleted_at: string;
  deleted_by: string | null;
  purge_after: string;
  retention_hold: boolean;
};

async function assertFileManager(
  supabase: Parameters<typeof assertCompanyMember>[0],
  companyId: string,
  attachmentId: string,
): Promise<void> {
  await assertCompanyMember(supabase, companyId);
  const { data: row, error } = await supabase
    .from("document_attachments" as never)
    .select("entity_type" as never)
    .eq("company_id" as never, companyId as never)
    .eq("id" as never, attachmentId as never)
    .maybeSingle();
  if (error) databaseError(error);
  if (!row) throw new Error("File not found or access denied.");
  const type = (row as { entity_type: string }).entity_type;
  if (!isAttachmentEntityType(type)) throw new Error("Unsupported file entity type.");
  await assertEntityAccess(supabase, companyId, type, "manage");
}

async function audit(
  supabase: Parameters<typeof assertCompanyMember>[0],
  companyId: string,
  action: string,
  attachmentId: string | null,
  details: Record<string, unknown> = {},
) {
  try {
    await (supabase as unknown as {
      rpc: (action: string, args: Record<string, unknown>) => Promise<unknown>;
    }).rpc("record_audit_event", {
      _company_id: companyId,
      _action: action,
      _entity_type: "company",
      _entity_id: companyId,
      _details: { ...(attachmentId ? { attachment_id: attachmentId } : {}), ...details },
    });
  } catch {
    // The core business mutation may have committed; avoid misleading retries.
  }
}

export const getDocumentRetentionSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input.companyId),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: settings, error } = await context.supabase
      .from("document_retention_settings" as never)
      .select("retention_days, updated_at" as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (error) databaseError(error);
    return {
      retentionDays: (settings as { retention_days: number } | null)?.retention_days
        ?? DEFAULT_DOCUMENT_RETENTION_DAYS,
      minDays: 7,
      maxDays: 3650,
    };
  });

export const updateDocumentRetentionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; retentionDays: number }) => {
    const days = validateRetentionDays(input.retentionDays);
    return { companyId: assertUuid(input.companyId), retentionDays: days };
  })
  .handler(async ({ data, context }) => {
    await assertEntityAccess(context.supabase, data.companyId, "company", "manage");
    const { error } = await context.supabase
      .from("document_retention_settings" as never)
      .upsert({
        company_id: data.companyId,
        retention_days: data.retentionDays,
      } as never, { onConflict: "company_id" });
    if (error) databaseError(error);
    await audit(context.supabase, data.companyId, "document.retention.update", null, {
      retention_days: data.retentionDays,
    });
    return { retentionDays: data.retentionDays };
  });

export const listRecycleBinFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; page?: number }) => ({
    companyId: assertUuid(input.companyId),
    page: safeFilePage(input.page),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const size = 25;
    const { data: rows, error, count } = await context.supabase
      .from("document_attachments" as never)
      .select(
        "id, entity_type, file_name, size_bytes, deleted_at, deleted_by, purge_after, retention_hold" as never,
        { count: "exact" },
      )
      .eq("company_id" as never, data.companyId as never)
      .not("deleted_at" as never, "is", null)
      .order("deleted_at" as never, { ascending: false })
      .order("id" as never, { ascending: true })
      .range(data.page * size, (data.page + 1) * size - 1);
    if (error) databaseError(error);
    return {
      rows: (rows ?? []) as unknown as TrashedFile[],
      total: count ?? 0,
      page: data.page,
      pageSize: size,
    };
  });

export const restoreRecycleBinFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; attachmentId: string }) => ({
    companyId: assertUuid(input.companyId),
    attachmentId: assertUuid(input.attachmentId, "file"),
  }))
  .handler(async ({ data, context }) => {
    await assertFileManager(context.supabase, data.companyId, data.attachmentId);
    const { data: rows, error } = await context.supabase
      .from("document_attachments" as never)
      .update({ deleted_at: null } as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.attachmentId as never)
      .not("deleted_at" as never, "is", null)
      .select("id" as never);
    if (error) databaseError(error);
    if ((rows ?? []).length !== 1) throw new Error("File was already restored or access was denied.");
    await audit(context.supabase, data.companyId, "document.recycle.restore", data.attachmentId);
    return { restored: true };
  });

export const setRecycleBinRetentionHold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; attachmentId: string; enabled: boolean }) => ({
    companyId: assertUuid(input.companyId),
    attachmentId: assertUuid(input.attachmentId, "file"),
    enabled: input.enabled === true,
  }))
  .handler(async ({ data, context }) => {
    await assertFileManager(context.supabase, data.companyId, data.attachmentId);
    const { data: rows, error } = await context.supabase
      .from("document_attachments" as never)
      .update({ retention_hold: data.enabled } as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.attachmentId as never)
      .select("id" as never);
    if (error) databaseError(error);
    if ((rows ?? []).length !== 1) throw new Error("File not found or access denied.");
    await audit(context.supabase, data.companyId, "document.retention.hold", data.attachmentId, {
      enabled: data.enabled,
    });
    return { enabled: data.enabled };
  });

type CleanupJob = {
  id: string;
  company_id: string;
  storage_paths: string[];
  completed_at: string | null;
  created_at: string;
};

async function retryCleanup(
  supabase: Parameters<typeof assertCompanyMember>[0],
  companyId: string,
  jobId: string,
): Promise<{ completed: boolean; objects: number }> {
  await assertEntityAccess(supabase, companyId, "company", "manage");
  const { data, error } = await supabase
    .from("document_storage_cleanup_jobs" as never)
    .select("id, company_id, storage_paths, completed_at, created_at" as never)
    .eq("company_id" as never, companyId as never)
    .eq("id" as never, jobId as never)
    .maybeSingle();
  if (error) databaseError(error);
  if (!data) throw new Error("Cleanup job not found or access denied.");
  const job = data as unknown as CleanupJob;
  if (job.completed_at) return { completed: true, objects: job.storage_paths.length };
  if (!Array.isArray(job.storage_paths) || job.storage_paths.length > 50 ||
      job.storage_paths.some((path) => !path.startsWith(`${companyId}/`))) {
    throw new Error("Storage cleanup needs administrator review.");
  }
  // All files are in a private bucket. The requesting user still needs the
  // Storage object's original entity permissions to remove these paths.
  if (job.storage_paths.length) {
    const { error: removalError } = await supabase.storage
      .from(COMPANY_DOCUMENTS_BUCKET)
      .remove(job.storage_paths);
    if (removalError) return { completed: false, objects: job.storage_paths.length };
  }
  const { data: finished, error: finishError } = await supabase.rpc(
    "finish_document_storage_cleanup" as never,
    { _company_id: companyId, _job_id: jobId } as never,
  );
  if (finishError) databaseError(finishError);
  return { completed: finished === true, objects: job.storage_paths.length };
}

export const purgeRecycleBinFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; attachmentId: string }) => ({
    companyId: assertUuid(input.companyId),
    attachmentId: assertUuid(input.attachmentId, "file"),
  }))
  .handler(async ({ data, context }) => {
    await assertFileManager(context.supabase, data.companyId, data.attachmentId);
    await assertEntityAccess(context.supabase, data.companyId, "company", "manage");
    const { data: jobId, error } = await context.supabase.rpc(
      "purge_document_from_recycle_bin" as never,
      { _company_id: data.companyId, _attachment_id: data.attachmentId } as never,
    );
    if (error) databaseError(error);
    if (typeof jobId !== "string") throw new Error("Could not identify the Storage cleanup job.");
    let outcome: { completed: boolean; objects: number };
    try {
      outcome = await retryCleanup(context.supabase, data.companyId, jobId);
    } catch {
      outcome = { completed: false, objects: 0 };
    }
    await audit(context.supabase, data.companyId, "document.recycle.purge", data.attachmentId, {
      cleanup_job_id: jobId,
      cleanup_completed: outcome.completed,
    });
    return { purged: true, cleanupComplete: outcome.completed, cleanupJobId: jobId };
  });

export const listStorageCleanupJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; page?: number }) => ({
    companyId: assertUuid(input.companyId),
    page: safeFilePage(input.page),
  }))
  .handler(async ({ data, context }) => {
    await assertEntityAccess(context.supabase, data.companyId, "company", "manage");
    const pageSize = 25;
    const { data: rows, error, count } = await context.supabase
      .from("document_storage_cleanup_jobs" as never)
      .select("id, storage_paths, created_at" as never, { count: "exact" })
      .eq("company_id" as never, data.companyId as never)
      .is("completed_at" as never, null)
      .order("created_at" as never, { ascending: true })
      .order("id" as never, { ascending: true })
      .range(data.page * pageSize, (data.page + 1) * pageSize - 1);
    if (error) databaseError(error);
    if (count == null) throw new Error("Storage cleanup count is unavailable. Retry.");
    return {
      jobs: ((rows ?? []) as unknown as Array<{
        id: string; storage_paths: string[]; created_at: string;
      }>).map((job) => ({
        id: job.id,
        createdAt: job.created_at,
        objects: job.storage_paths.length,
      })),
      total: count,
      page: data.page,
      pageSize,
    };
  });

export const retryDocumentStorageCleanup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; jobId: string }) => ({
    companyId: assertUuid(input.companyId),
    jobId: assertUuid(input.jobId, "job"),
  }))
  .handler(async ({ data, context }) =>
    retryCleanup(context.supabase, data.companyId, data.jobId),
  );
