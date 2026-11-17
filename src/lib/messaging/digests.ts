/**
 * Safe messaging digest builders (Phase 6/8).
 * Digests never include payroll figures, bank details, or full message bodies by default.
 */

const SENSITIVE_RE =
  /\b(iban|sort\s*code|account\s*number|routing|swift|payroll|salary|ni\s*number|ssn|bank)\b/i;

export type DigestCandidate = {
  conversationId: string;
  title: string | null;
  preview: string | null;
  unreadCount: number;
  visibility: string;
  lastMessageAt: string | null;
};

export type DigestPreviewItem = {
  conversationId: string;
  title: string;
  summary: string;
  unreadCount: number;
};

export type DigestPreview = {
  subject: string;
  items: DigestPreviewItem[];
  omittedSensitive: number;
  generatedAt: string;
};

export function isSensitiveMessagingPreview(preview: string | null | undefined): boolean {
  if (!preview) return false;
  return SENSITIVE_RE.test(preview);
}

export function buildMessagingDigestPreview(input: {
  companyName: string;
  frequency: "daily" | "weekly";
  candidates: DigestCandidate[];
  maxItems?: number;
}): DigestPreview {
  const maxItems = input.maxItems ?? 8;
  let omittedSensitive = 0;
  const items: DigestPreviewItem[] = [];

  for (const candidate of input.candidates) {
    if (candidate.unreadCount <= 0) continue;
    if (candidate.visibility === "hr_private" || candidate.visibility === "payroll_restricted") {
      omittedSensitive += 1;
      continue;
    }
    if (isSensitiveMessagingPreview(candidate.preview)) {
      omittedSensitive += 1;
      continue;
    }
    items.push({
      conversationId: candidate.conversationId,
      title: candidate.title?.trim() || "Conversation",
      summary:
        candidate.preview && candidate.preview.trim()
          ? candidate.preview.trim().slice(0, 120)
          : `${candidate.unreadCount} unread message${candidate.unreadCount === 1 ? "" : "s"}`,
      unreadCount: candidate.unreadCount,
    });
    if (items.length >= maxItems) break;
  }

  const subject =
    input.frequency === "weekly"
      ? `${input.companyName}: weekly Messages digest`
      : `${input.companyName}: daily Messages digest`;

  return {
    subject,
    items,
    omittedSensitive,
    generatedAt: new Date().toISOString(),
  };
}
