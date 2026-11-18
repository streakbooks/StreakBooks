import { supabase } from "@/integrations/supabase/client";
import {
  MESSAGING_ATTACHMENTS_BUCKET,
  buildMessagingAttachmentPath,
  validateMessagingUpload,
} from "./attachments";

export async function uploadMessagingAttachment(input: {
  file: File;
  companyId: string;
  conversationId: string;
  messageId?: string | null;
  maxBytes?: number;
  register: (args: {
    data: {
      companyId: string;
      conversationId: string;
      messageId?: string | null;
      storagePath: string;
      fileName: string;
      mimeType: string;
      byteSize: number;
    };
  }) => Promise<{ id: string }>;
}): Promise<{ id: string; storagePath: string }> {
  const check = validateMessagingUpload({
    fileName: input.file.name,
    sizeBytes: input.file.size,
    contentType: input.file.type || "application/octet-stream",
    ...(input.maxBytes ? { maxBytes: input.maxBytes } : {}),
  });
  if (!check.ok) throw new Error(check.error);

  const storagePath = buildMessagingAttachmentPath({
    companyId: input.companyId,
    conversationId: input.conversationId,
    uniqueId: crypto.randomUUID(),
    fileName: input.file.name,
  });

  const { error } = await supabase.storage
    .from(MESSAGING_ATTACHMENTS_BUCKET)
    .upload(storagePath, input.file, {
      ...(input.file.type ? { contentType: input.file.type } : {}),
      upsert: false,
    });
  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new Error("Messaging file storage is not set up yet. Apply the messaging migrations.");
    }
    if (/row-level security|not authorized|unauthorized/i.test(error.message)) {
      throw new Error("You do not have permission to share files in this conversation.");
    }
    throw new Error(error.message);
  }

  try {
    const registered = await input.register({
      data: {
        companyId: input.companyId,
        conversationId: input.conversationId,
        messageId: input.messageId ?? null,
        storagePath,
        fileName: input.file.name,
        mimeType: input.file.type || "application/octet-stream",
        byteSize: input.file.size,
      },
    });
    return { id: registered.id, storagePath };
  } catch (error) {
    await supabase.storage.from(MESSAGING_ATTACHMENTS_BUCKET).remove([storagePath]);
    throw error;
  }
}

export async function createMessagingAttachmentSignedUrl(
  storagePath: string,
  downloadName?: string,
) {
  const { data, error } = await supabase.storage
    .from(MESSAGING_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, 120, downloadName ? { download: downloadName } : undefined);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
