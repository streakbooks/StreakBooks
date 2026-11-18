/**
 * Helpers for copying a sales quote into a new draft.
 * Quote numbers, conversion links and status history are never copied.
 */

/** Preserve the original quote→expiry day span when both dates are valid ISO dates. */
export function copiedQuoteExpiryDate(
  today: string,
  quoteDate: string | null | undefined,
  expiryDate: string | null | undefined,
): string | null {
  const q = (quoteDate ?? "").trim();
  const e = (expiryDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) return null;
  if (e < q) return null;
  const start = Date.parse(`${q}T00:00:00Z`);
  const end = Date.parse(`${e}T00:00:00Z`);
  const base = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(base)) return null;
  const days = Math.round((end - start) / 86_400_000);
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
