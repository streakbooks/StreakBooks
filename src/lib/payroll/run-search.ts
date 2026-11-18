/** URL search is display state, not an authorization boundary. */
export function normalizePayrollRunSearch(raw: unknown): string {
  if (typeof raw !== "string") return "";
  // Reject control, directional and zero-width formatting characters in deep links.
  if (/[\p{Cc}\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/u.test(raw))
    return "";
  const q = raw.trim();
  return q.length <= 120 ? q : "";
}
