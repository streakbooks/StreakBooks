/**
 * Split plain text into safe segments for React rendering.
 * Only http(s) URLs become links; everything else stays text.
 */

export type MessagingTextSegment =
  | { type: "text"; value: string }
  | { type: "url"; value: string; href: string }
  | { type: "mention"; value: string };

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

export function sanitiseMessagingHref(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function segmentMessagingBody(body: string): MessagingTextSegment[] {
  const source = body ?? "";
  if (!source) return [{ type: "text", value: "" }];

  const segments: MessagingTextSegment[] = [];
  let cursor = 0;
  const combined = /https?:\/\/[^\s<>"')\]]+|@[^\s@]+/gi;
  for (const match of source.matchAll(combined)) {
    const value = match[0] ?? "";
    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push({ type: "text", value: source.slice(cursor, index) });
    }
    if (value.startsWith("@")) {
      segments.push({ type: "mention", value });
    } else {
      const href = sanitiseMessagingHref(value.replace(/[.,;:!?)]+$/g, ""));
      if (href) segments.push({ type: "url", value, href });
      else segments.push({ type: "text", value });
    }
    cursor = index + value.length;
  }
  if (cursor < source.length) {
    segments.push({ type: "text", value: source.slice(cursor) });
  }
  // Ensure URL_RE is referenced for tree-shaking clarity in tests.
  void URL_RE;
  return segments.length ? segments : [{ type: "text", value: source }];
}
