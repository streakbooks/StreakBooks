/**
 * Read-only classification for AI proposals. The provider's label is NOT permission
 * to post: the server still revalidates account ownership and journal balancing.
 */
export type JournalPreviewLine = {
  account_id: string;
  debit_minor: number;
  credit_minor: number;
  description?: string;
};

const KNOWN_TYPES = new Set([
  "journal_draft",
  "category_suggestion",
  "invoice_draft",
  "bill_draft",
  "note",
]);

export function getAiSuggestionKind(
  intent: string,
  payload: Record<string, unknown> | null | undefined,
): string {
  if (!payload) return "other";
  const explicit = payload["_ai_type"];
  if (typeof explicit === "string" && KNOWN_TYPES.has(explicit)) return explicit;
  // Older proposals predate type metadata. Recognise only unmistakable journal lines.
  const lines = payload["lines"];
  if (
    intent === "draft" &&
    Array.isArray(lines) &&
    lines.length >= 2 &&
    lines.every(
      (row) =>
        row !== null &&
        typeof row === "object" &&
        typeof row.account_id === "string" &&
        typeof row.debit_minor === "number" &&
        typeof row.credit_minor === "number",
    )
  ) {
    return "journal_draft";
  }
  return Array.isArray(lines) ? "document_draft" : "other";
}

/**
 * Preview only; posting is independently validated by the accounting engine.
 * Fail closed for missing, unsafe, unbalanced or non-journal payloads.
 */
export function getJournalPreview(suggestion: {
  intent: string;
  status: string;
  payload: Record<string, unknown> | null | undefined;
}): JournalPreviewLine[] | null {
  if (
    suggestion.status !== "validated" ||
    getAiSuggestionKind(suggestion.intent, suggestion.payload) !== "journal_draft"
  ) {
    return null;
  }
  const lines = suggestion.payload?.["lines"];
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 100) return null;
  const preview: JournalPreviewLine[] = [];
  let debit = 0n;
  let credit = 0n;
  for (const raw of lines) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    const account_id = row["account_id"];
    const debit_minor = row["debit_minor"];
    const credit_minor = row["credit_minor"];
    if (
      typeof account_id !== "string" ||
      !account_id.trim() ||
      typeof debit_minor !== "number" ||
      !Number.isSafeInteger(debit_minor) ||
      debit_minor < 0 ||
      typeof credit_minor !== "number" ||
      !Number.isSafeInteger(credit_minor) ||
      credit_minor < 0 ||
      (debit_minor > 0 && credit_minor > 0) ||
      (debit_minor === 0 && credit_minor === 0)
    ) {
      return null;
    }
    debit += BigInt(debit_minor);
    credit += BigInt(credit_minor);
    preview.push({
      account_id,
      debit_minor,
      credit_minor,
      ...(typeof row["description"] === "string"
        ? { description: row["description"].slice(0, 200) }
        : {}),
    });
  }
  return debit > 0n && debit === credit ? preview : null;
}
