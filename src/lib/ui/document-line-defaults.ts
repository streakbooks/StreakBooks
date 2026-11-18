/**
 * Default empty rows for new financial documents.
 * Spreadsheet-style editors open ready for typing — not a single collapsed row.
 */
export const DEFAULT_DOCUMENT_LINE_ROWS = 5;

export function createEmptyDocumentLines<T>(factory: () => T, count = DEFAULT_DOCUMENT_LINE_ROWS): T[] {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : DEFAULT_DOCUMENT_LINE_ROWS;
  return Array.from({ length: n }, () => factory());
}
