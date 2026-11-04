/** A bounded offset prevents accidental unbounded journal scans and invalid PostgREST ranges. */
export function journalPageRange(
  offset: number | undefined,
  limit: number | undefined,
): { from: number; to: number; limit: number } {
  const from = offset ?? 0;
  if (!Number.isSafeInteger(from) || from < 0 || from > 100_000) {
    throw new Error("Invalid journal page offset.");
  }
  const requested = limit ?? 100;
  if (!Number.isFinite(requested)) throw new Error("Invalid journal page size.");
  const count = Math.min(500, Math.max(1, Math.floor(requested)));
  return { from, to: from + count - 1, limit: count };
}

/** Request one additional row so page navigation never suggests a phantom final page. */
export function journalPageInfo(rowCount: number, pageSize: number, page: number) {
  return {
    hasNext: rowCount > pageSize,
    first: page * pageSize + (rowCount > 0 ? 1 : 0),
    last: rowCount > 0 ? page * pageSize + Math.min(rowCount, pageSize) : 0,
  };
}
