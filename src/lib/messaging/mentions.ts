/**
 * Lightweight @mention helpers. Mentions remain plain text in the body;
 * inbox filtering matches @name / @uuid / @everyone server-side.
 */

const MENTION_RE = /(^|[\s([{"'])@([^\s@]+)/g;

export function extractMentionTokens(body: string): string[] {
  const tokens = new Set<string>();
  const source = body ?? "";
  for (const match of source.matchAll(MENTION_RE)) {
    const token = (match[2] ?? "").replace(/[.,;:!?)]+$/g, "").trim();
    if (token) tokens.add(token.toLowerCase());
  }
  return [...tokens];
}

export function insertMentionToken(body: string, displayName: string): string {
  const token = displayName.trim().replace(/\s+/g, " ");
  if (!token) return body;
  const mention = `@${token}`;
  if (!body.trim()) return `${mention} `;
  if (/\s$/.test(body)) return `${body}${mention} `;
  return `${body} ${mention} `;
}

export function bodyMentionsUser(body: string, labels: string[]): boolean {
  const tokens = new Set(extractMentionTokens(body));
  if (tokens.has("everyone")) return true;
  return labels.some((label) => {
    const normalised = label.trim().toLowerCase();
    return normalised.length > 0 && tokens.has(normalised);
  });
}
