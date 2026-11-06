import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { assertEntityAccess } from "@/lib/documents/attachments.functions";
import {
  COMPANY_DOCUMENTS_BUCKET,
  MAX_FILE_BYTES,
  buildStoragePath,
  validateUpload,
} from "@/lib/documents/attachments";
import {
  downloadReceivedFile,
  getReceivedEmail,
  inboxAddress,
  isForCompanyInbox,
  listReceivedAttachments,
  listReceivedEmails,
  readReceiveConfig,
} from "@/lib/documents/email-inbox-provider.server";

type InboxRow = {
  company_id: string;
  local_token: string;
  enabled: boolean;
};

const MIGRATION_HINT =
  "Email-to-Inbox requires migration 20261106140000_files_email_inbox. Ask an administrator to apply it.";

function handleDbError(error: { code?: string; message: string }): never {
  if (error.code === "42P01" || error.code === "42703")
    throw new Error(MIGRATION_HINT);
  throw new Error(error.message);
}

async function loadInbox(
  supabase: Parameters<typeof assertCompanyMember>[0],
  companyId: string,
): Promise<InboxRow | null> {
  const { data: row, error } = await supabase
    .from("document_email_inboxes" as never)
    .select("company_id, local_token, enabled" as never)
    .eq("company_id" as never, companyId as never)
    .maybeSingle();
  if (error) handleDbError(error);
  return (row ?? null) as InboxRow | null;
}

function requireProvider() {
  const config = readReceiveConfig();
  if (!config.configured)
    throw new Error("Email receiving is not configured by the platform administrator.");
  return config;
}

async function requireEnabledInbox(
  supabase: Parameters<typeof assertCompanyMember>[0],
  companyId: string,
) {
  const config = requireProvider();
  const row = await loadInbox(supabase, companyId);
  if (!row?.enabled) throw new Error("Activate the receiving inbox before checking email.");
  return { config, address: inboxAddress(row.local_token, config.domain) };
}

export const getDocumentInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: assertUuid(input.companyId) }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const settings = await loadInbox(context.supabase, data.companyId);
    const config = readReceiveConfig();
    return {
      configured: config.configured,
      enabled: settings?.enabled ?? false,
      address: settings && config.configured
        ? inboxAddress(settings.local_token, config.domain)
        : null,
      provider: config.configured ? config.provider : null,
      missingConfiguration: config.configured ? [] : config.missing,
    };
  });

export const createDocumentInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: assertUuid(input.companyId) }))
  .handler(async ({ data, context }) => {
    await assertEntityAccess(context.supabase, data.companyId, "company", "manage");
    requireProvider();
    const existing = await loadInbox(context.supabase, data.companyId);
    if (existing) return { created: false };
    const { error } = await context.supabase
      .from("document_email_inboxes" as never)
      .insert({ company_id: data.companyId } as never);
    // Simultaneous setup requests may race on the single company row.
    if (error && error.code !== "23505") handleDbError(error);
    return { created: !error };
  });

export const setDocumentInboxEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; enabled: boolean }) => ({
    companyId: assertUuid(input.companyId),
    enabled: input.enabled === true,
  }))
  .handler(async ({ data, context }) => {
    await assertEntityAccess(context.supabase, data.companyId, "company", "manage");
    if (data.enabled) requireProvider();
    const { data: rows, error } = await context.supabase
      .from("document_email_inboxes" as never)
      .update({ enabled: data.enabled } as never)
      .eq("company_id" as never, data.companyId as never)
      .select("company_id" as never);
    if (error) handleDbError(error);
    if ((rows ?? []).length !== 1) throw new Error("Create the inbox first.");
    return { enabled: data.enabled };
  });

export const listDocumentInboxMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; after?: string }) => ({
    companyId: assertUuid(input.companyId),
    after: input.after ? assertUuid(input.after, "cursor") : undefined,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { config, address } = await requireEnabledInbox(context.supabase, data.companyId);
    const page = await listReceivedEmails(config, data.after);
    const rows = page.data
      .filter((email) => isForCompanyInbox(email, address))
      .slice(0, 50)
      .map((email) => ({
        id: email.id,
        from: email.from,
        subject: email.subject || "(No subject)",
        receivedAt: email.created_at,
      }));
    const last = page.data.at(-1);
    return {
      rows,
      nextCursor: page.has_more && last ? last.id : null,
      scanned: page.data.length,
    };
  });

async function verifyEmailRecipient(
  companyId: string,
  emailId: string,
  supabase: Parameters<typeof assertCompanyMember>[0],
) {
  const { config, address } = await requireEnabledInbox(supabase, companyId);
  const email = await getReceivedEmail(config, emailId);
  if (email.id !== emailId || !isForCompanyInbox(email, address))
    throw new Error("Email not found for this organisation.");
  return { config, email };
}

export const getDocumentInboxAttachments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; emailId: string }) => ({
    companyId: assertUuid(input.companyId),
    emailId: assertUuid(input.emailId, "email"),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { config } = await verifyEmailRecipient(
      data.companyId, data.emailId, context.supabase,
    );
    const attachments = await listReceivedAttachments(config, data.emailId);
    if (attachments.has_more)
      throw new Error("Email exceeds the 100-attachment preview limit.");
    const { data: existing, error } = await context.supabase
      .from("document_attachments" as never)
      .select("inbox_attachment_id" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("inbox_email_id" as never, data.emailId as never);
    if (error) handleDbError(error);
    const imported = new Set(
      ((existing ?? []) as unknown as Array<{ inbox_attachment_id: string }>).map(
        (item) => item.inbox_attachment_id,
      ),
    );
    return {
      rows: attachments.data.map((attachment) => ({
        id: attachment.id,
        name: attachment.filename,
        contentType: attachment.content_type,
        sizeBytes: attachment.size,
        imported: imported.has(attachment.id),
      })),
    };
  });

export const importDocumentInboxAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; emailId: string; attachmentId: string }) => {
    const attachmentId = String(input.attachmentId ?? "");
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(attachmentId))
      throw new Error("Invalid email attachment identifier.");
    return {
      companyId: assertUuid(input.companyId),
      emailId: assertUuid(input.emailId, "email"),
      attachmentId,
    };
  })
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    await assertEntityAccess(supabase, data.companyId, "company", "manage");
    const { config, email } = await verifyEmailRecipient(
      data.companyId, data.emailId, supabase,
    );

    const existingQuery = () => supabase
      .from("document_attachments" as never)
      .select("id" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("inbox_email_id" as never, data.emailId as never)
      .eq("inbox_attachment_id" as never, data.attachmentId as never)
      .maybeSingle();

    const current = await existingQuery();
    if (current.error) handleDbError(current.error);
    if (current.data) return { id: (current.data as { id: string }).id, alreadyImported: true };

    const list = await listReceivedAttachments(config, data.emailId);
    if (list.has_more) throw new Error("Email contains too many attachments to import safely.");
    const attachment = list.data.find((item) => item.id === data.attachmentId);
    if (!attachment) throw new Error("Attachment not found in the verified email.");

    const claimedMime = (attachment.content_type || "").toLowerCase().split(";")[0]!.trim();
    const check = validateUpload({
      fileName: attachment.filename,
      sizeBytes: attachment.size,
      contentType: claimedMime,
    });
    if (!check.ok) throw new Error(check.error);
    const bytes = await downloadReceivedFile(attachment.download_url, MAX_FILE_BYTES);
    const verified = validateUpload({
      fileName: attachment.filename,
      sizeBytes: bytes.byteLength,
      contentType: claimedMime,
    });
    if (!verified.ok) throw new Error(verified.error);

    const storagePath = buildStoragePath({
      companyId: data.companyId,
      entityType: "company",
      entityId: data.companyId,
      uniqueId: crypto.randomUUID(),
      fileName: attachment.filename,
    });
    const bucket = supabase.storage.from(COMPANY_DOCUMENTS_BUCKET);
    const { error: uploadError } = await bucket.upload(storagePath, Buffer.from(bytes), {
      contentType: claimedMime,
      upsert: false,
    });
    if (uploadError) throw new Error(uploadError.message);

    const date = new Date(email.created_at);
    try {
      const { data: created, error } = await supabase
        .from("document_attachments" as never)
        .insert({
          company_id: data.companyId,
          entity_type: "company",
          entity_id: data.companyId,
          file_name: attachment.filename,
          content_type: claimedMime,
          size_bytes: bytes.byteLength,
          storage_path: storagePath,
          storage_bucket: COMPANY_DOCUMENTS_BUCKET,
          uploaded_by: context.userId,
          inbox_email_id: data.emailId,
          inbox_attachment_id: data.attachmentId,
          inbox_sender: email.from.slice(0, 255),
          inbox_received_at: Number.isNaN(date.valueOf()) ? null : date.toISOString(),
        } as never)
        .select("id" as never)
        .single();

      if (error) {
        if (error.code === "23505") {
          const previous = await existingQuery();
          if (previous.error) handleDbError(previous.error);
          if (previous.data)
            return { id: (previous.data as { id: string }).id, alreadyImported: true };
        }
        handleDbError(error);
      }
      return { id: (created as { id: string }).id, alreadyImported: false };
    } finally {
      // An existing idempotency key or any failed insert must not leave a duplicate object.
      const { data: row } = await supabase
        .from("document_attachments" as never)
        .select("id" as never)
        .eq("storage_path" as never, storagePath as never)
        .eq("company_id" as never, data.companyId as never)
        .maybeSingle();
      if (!row) await bucket.remove([storagePath]);
    }
  });
