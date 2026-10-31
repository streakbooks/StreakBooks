/** Explicit editor contracts. Field discovery never depends on DOM text or synthetic clicks. */
export type VoiceFieldKey =
  | "contactId"
  | "date"
  | "dueDate"
  | "number"
  | "memo"
  | "currency"
  | "description"
  | "quantity"
  | "unitPrice"
  | "discount"
  | "accountId"
  | "taxCodeId";
export type VoiceFieldSpec = {
  key: VoiceFieldKey;
  label: string;
  aliases?: string[];
  line?: number;
  order: number;
};
export type RegisteredVoiceField = VoiceFieldSpec & {
  id: string;
  token: string;
  focus(): void;
  close?(): void;
};
export function fieldMatches(query: string, field: VoiceFieldSpec) {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(?:the|field)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  let text = normalize(query);
  const line = /\bline (\d+)\b/.exec(text);
  if (line && field.line !== Number(line[1]) - 1) return false;
  text = text.replace(/\bline \d+\b/, "").trim();
  return [field.label, ...(field.aliases ?? [])].some((label) => normalize(label) === text);
}
