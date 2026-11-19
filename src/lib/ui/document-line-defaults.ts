/**
 * Default empty rows for new financial documents.
 * Prefer one or two starter rows; users add lines as needed (Batch 40 density).
 */
export const DEFAULT_DOCUMENT_LINE_ROWS = 2;

export function createEmptyDocumentLines<T>(factory: () => T, count = DEFAULT_DOCUMENT_LINE_ROWS): T[] {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : DEFAULT_DOCUMENT_LINE_ROWS;
  return Array.from({ length: n }, () => factory());
}
