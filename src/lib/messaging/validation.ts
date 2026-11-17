const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isMessagingUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function assertMessagingUuid(value: unknown, label = "id"): string {
  if (!isMessagingUuid(value)) throw new Error(`Invalid ${label}`);
  return value;
}

export function normaliseMessageBody(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("Message body is required");
  const body = raw.replaceAll("\u0000", "").trim();
  if (body.length < 1) throw new Error("Message cannot be empty");
  if (body.length > 8000) throw new Error("Message is too long (8000 characters max)");
  return body;
}

export function normaliseGroupTitle(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("Group title is required");
  const title = raw.trim();
  if (title.length < 1 || title.length > 120) {
    throw new Error("Group title must be between 1 and 120 characters");
  }
  return title;
}

/** Escape text for safe plain rendering (no HTML). */
export function escapeMessagingText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function compareMessageSeq(a: { seq: number }, b: { seq: number }): number {
  return a.seq - b.seq;
}

export function isAllowedMessagingMime(mime: string): boolean {
  return [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "text/plain",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ].includes(mime);
}
