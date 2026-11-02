import type { ImportDefinition } from "./import-definitions";

export type ImportIssue = { row: number; field: string; message: string };
export type ImportPreview = {
  headers: string[];
  records: Array<{ sourceRow: number; values: Record<string, string> }>;
  issues: ImportIssue[];
  duplicates: number[];
};

/** RFC 4180 reader supporting quoted delimiters, newlines, escaped quotes and UTF-8 BOM. */
export function parseImportCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closedQuote = false;
  const finishCell = () => {
    row.push(cell);
    cell = "";
    closedQuote = false;
  };
  const finishRow = () => {
    finishCell();
    if (row.some((value) => value.trim())) rows.push(row);
    row = [];
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closedQuote = true;
      } else cell += char;
    } else if (char === '"') {
      if (cell !== "" || closedQuote) throw new Error("Unexpected quote in CSV field");
      quoted = true;
    } else if (char === ",") finishCell();
    else if (char === "\r" || char === "\n") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      finishRow();
    } else if (closedQuote) {
      throw new Error("Unexpected characters after closing CSV quote");
    } else cell += char;
  }
  if (quoted) throw new Error("Unclosed quoted CSV field");
  finishRow();
  return rows;
}

/** No writes occur. Server-side domain importers must independently revalidate and authorize. */
export function previewImportCsv(
  text: string,
  definition: ImportDefinition,
  options: { maxRows?: number; uniqueBy?: readonly string[] } = {},
): ImportPreview {
  const maxRows = Math.min(20_000, Math.max(1, options.maxRows ?? 10_000));
  const rows = parseImportCsv(text);
  if (rows.length === 0)
    return {
      headers: [],
      records: [],
      duplicates: [],
      issues: [{ row: 1, field: "", message: "File is empty" }],
    };
  if (rows.length - 1 > maxRows) throw new Error("File exceeds maximum import rows");
  const headers = rows[0]!.map((h) => h.trim());
  const normalized = headers.map((h) => h.toLowerCase());
  const issues: ImportIssue[] = [];
  const seenHeaders = new Set<string>();
  for (const header of normalized) {
    if (!header) issues.push({ row: 1, field: "", message: "Blank column heading" });
    else if (seenHeaders.has(header))
      issues.push({ row: 1, field: header, message: "Duplicate column heading" });
    seenHeaders.add(header);
  }
  for (const field of definition.fields.filter((f) => f.required)) {
    if (!normalized.includes(field.label.toLowerCase()))
      issues.push({
        row: 1,
        field: field.key,
        message: "Required column is missing: " + field.label,
      });
  }
  const records: ImportPreview["records"] = [];
  const duplicates: number[] = [];
  const unique = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]!;
    const values: Record<string, string> = {};
    if (cells.length !== headers.length)
      issues.push({ row: i + 1, field: "", message: "Column count differs from header" });
    for (const field of definition.fields) {
      const column = normalized.indexOf(field.label.toLowerCase());
      const value = column >= 0 ? (cells[column] ?? "").trim() : "";
      values[field.key] = value;
      if (field.required && !value)
        issues.push({ row: i + 1, field: field.key, message: "Required value is missing" });
    }
    if (options.uniqueBy?.length) {
      const parts = options.uniqueBy.map((key) => values[key] ?? "");
      if (parts.every(Boolean)) {
        const key = JSON.stringify(parts);
        if (unique.has(key)) duplicates.push(i + 1);
        unique.add(key);
      }
    }
    records.push({ sourceRow: i + 1, values });
  }
  return { headers, records, issues, duplicates };
}
