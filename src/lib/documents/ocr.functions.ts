import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertUuid } from "@/lib/company-validation";
import { assertEntityAccess } from "@/lib/documents/attachments.functions";
import { COMPANY_DOCUMENTS_BUCKET } from "@/lib/documents/attachments";
import { isOcrDocument, OCR_MAX_FILE_BYTES } from "@/lib/documents/ocr-model";
import {
  checkAzureInvoiceOcr,
  readOcrConfig,
  signOcrJob,
  submitAzureInvoiceOcr,
  verifyOcrJob,
} from "@/lib/documents/ocr-provider.server";

const migrationHint =
  "OCR requires the existing document review workflow migration 20261104054143.";

type Attachment = {
  id: string;
  entity_type: string;
  file_name: string;
  storage_path: string | null;
  storage_bucket: string | null;
  size_bytes: number | null;
  content_type: string | null;
};

function configuredOcr() {
  const config = readOcrConfig();
  if (!config.configured)
    throw new Error("OCR is not configured. Ask your administrator to set the Azure Document Intelligence server credentials.");
  return config;
}

async function eligibleDocument(
  supabase: Parameters<typeof assertEntityAccess>[0],
  companyId: string,
  attachmentId: string,
): Promise<Attachment> {
  // A third-party data transfer requires the user's existing company file MANAGE right.
  await assertEntityAccess(supabase, companyId, "company", "manage");
  const { data: file, error: fileError } = await supabase
    .from("document_attachments" as never)
    .select("id, entity_type, file_name, storage_path, storage_bucket, size_bytes, content_type" as never)
    .eq("company_id" as never, companyId as never)
    .eq("id" as never, attachmentId as never)
    .eq("entity_type" as never, "company" as never)
    .is("deleted_at" as never, null)
    .maybeSingle();
  if (fileError) throw new Error(fileError.message);
  if (!file) throw new Error("Document not found or access denied.");
  const attachment = file as Attachment;
  if (
    attachment.storage_bucket !== COMPANY_DOCUMENTS_BUCKET ||
    !attachment.storage_path?.startsWith(`${companyId}/company/${companyId}/`)
  ) throw new Error("OCR requires a private uploaded document.");
  if (
    !attachment.size_bytes ||
    attachment.size_bytes <= 0 ||
    attachment.size_bytes > OCR_MAX_FILE_BYTES ||
    !isOcrDocument(attachment.content_type, attachment.file_name)
  ) throw new Error("OCR supports PDF, PNG and JPEG files up to 8 MB.");
  const { data: review, error: reviewError } = await supabase
    .from("document_reviews" as never)
    .select("status" as never)
    .eq("company_id" as never, companyId as never)
    .eq("attachment_id" as never, attachmentId as never)
    .maybeSingle();
  if (reviewError) {
    if (reviewError.code === "42P01") throw new Error(migrationHint);
    throw new Error(reviewError.message);
  }
  if (!review) throw new Error("Document must be added to the review queue before extraction.");
  const status = (review as { status: string }).status;
  if (status !== "needs_review" && status !== "ready")
    throw new Error("OCR is only available for documents awaiting review.");
  return attachment;
}

export const getDocumentOcrAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input.companyId),
  }))
  .handler(async ({ data, context }) => {
    await assertEntityAccess(context.supabase, data.companyId, "company", "manage");
    const config = readOcrConfig();
    return {
      configured: config.configured,
      provider: config.configured ? "azure-document-intelligence" : null,
      model: "prebuilt-invoice",
      pageLimit: 3,
      fileLimitMB: 8,
      missing: config.configured ? [] : config.missing,
    };
  });

export const startDocumentOcr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; attachmentId: string; consent: boolean }) => ({
    companyId: assertUuid(input.companyId),
    attachmentId: assertUuid(input.attachmentId, "file"),
    consent: input.consent === true,
  }))
  .handler(async ({ data, context }) => {
    if (!data.consent) throw new Error("Confirm third-party processing before extraction.");
    const config = configuredOcr();
    const attachment = await eligibleDocument(context.supabase, data.companyId, data.attachmentId);
    const { data: blob, error } = await context.supabase.storage
      .from(COMPANY_DOCUMENTS_BUCKET)
      .download(attachment.storage_path!);
    if (error || !blob) throw new Error("Could not access the private document.");
    if (blob.size <= 0 || blob.size > OCR_MAX_FILE_BYTES)
      throw new Error("OCR document size exceeds 8 MB.");

    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength !== attachment.size_bytes || bytes.byteLength > OCR_MAX_FILE_BYTES)
      throw new Error("Document changed or exceeded the OCR size limit.");
    const resultId = await submitAzureInvoiceOcr(config, bytes);
    const jobToken = signOcrJob(config, {
      companyId: data.companyId,
      attachmentId: data.attachmentId,
      userId: context.userId,
      resultId,
      issuedAt: Date.now(),
    });
    try {
      await (
        context.supabase as unknown as {
          rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>;
        }
      ).rpc("record_audit_event", {
        _company_id: data.companyId,
        _action: "document.ocr.start",
        _entity_type: "company",
        _entity_id: data.companyId,
        _details: {
          attachment_id: data.attachmentId,
          provider: "azure-document-intelligence",
          model: "prebuilt-invoice",
          pages: "1-3",
        },
      });
    } catch {
      // Provider submission cannot be undone by a logging outage.
    }
    return { jobToken };
  });

export const checkDocumentOcr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string; attachmentId: string; jobToken: string;
  }) => ({
    companyId: assertUuid(input.companyId),
    attachmentId: assertUuid(input.attachmentId, "file"),
    jobToken: String(input.jobToken ?? "").slice(0, 1600),
  }))
  .handler(async ({ data, context }) => {
    const config = configuredOcr();
    const claims = verifyOcrJob(config, data.jobToken, {
      companyId: data.companyId,
      attachmentId: data.attachmentId,
      userId: context.userId,
    });
    // A user revoked during processing must not see the provider result.
    await eligibleDocument(context.supabase, data.companyId, data.attachmentId);
    return checkAzureInvoiceOcr(config, claims.resultId);
  });
