import { isAllowedMessagingMime } from "./validation";

export const MESSAGING_ATTACHMENTS_BUCKET = "messaging-attachments";

export function buildMessagingAttachmentPath(input: {
  companyId: string;
  conversationId: string;
  uniqueId: string;
  fileName: string;
}): string {
  const safeName = input.fileName.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 120);
  return `${input.companyId}/${input.conversationId}/${input.uniqueId}-${safeName}`;
}

export function validateMessagingUpload(input: {
  fileName: string;
  sizeBytes: number;
  contentType: string;
  maxBytes?: number;
}): { ok: true } | { ok: false; error: string } {
  const max = input.maxBytes ?? 5_242_880;
  if (!input.fileName.trim()) return { ok: false, error: "File name is required" };
  if (input.sizeBytes < 1) return { ok: false, error: "File is empty" };
  if (input.sizeBytes > max) {
    return { ok: false, error: `File exceeds the ${Math.floor(max / 1024 / 1024)} MB limit` };
  }
  if (!isAllowedMessagingMime(input.contentType)) {
    return { ok: false, error: "This file type is not allowed in Messages" };
  }
  return { ok: true };
}
