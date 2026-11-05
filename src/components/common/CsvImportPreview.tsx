import { useMemo } from "react";
import { parseImportCsv } from "@/lib/imports/import-preflight";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Read-only preview. The existing server importer remains the authority for validation. */
export function CsvImportPreview({ text }: { text: string }) {
  const preview = useMemo(() => {
    try {
      return { rows: parseImportCsv(text), error: "" };
    } catch (error) {
      return {
        rows: [],
        error: error instanceof Error ? error.message : "This CSV could not be previewed.",
      };
    }
  }, [text]);
  if (preview.error)
    return (
      <p
        role="alert"
        className="mb-4 rounded-lg border border-destructive/30 bg-destructive-soft p-4 text-sm text-destructive-ink"
      >
        Preview unavailable: {preview.error}. Check the CSV format before importing.
      </p>
    );
  const [headers, ...rows] = preview.rows;
  if (!headers || rows.length === 0)
    return (
      <p role="status" className="mb-4 rounded-lg border bg-card p-4 text-sm">
        No data rows to preview. Choose a CSV with a header and at least one contact.
      </p>
    );
  return (
    <section
      aria-label="CSV preview"
      className="mb-4 min-w-0 overflow-hidden rounded-xl border bg-card"
    >
      <div className="border-b p-4">
        <h2 className="text-sm font-semibold">Review your file</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {rows.length} data rows · Showing the first {Math.min(rows.length, 5)}. The import checks
          all rows and reports any errors.
        </p>
      </div>
      <Table aria-label="Contact import preview">
        <TableHeader>
          <TableRow>
            {headers.map((header, i) => (
              <TableHead key={i}>{header || `Column ${i + 1}`}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(0, 5).map((row, i) => (
            <TableRow key={i}>
              {headers.map((_, column) => (
                <TableCell key={column} className="max-w-64 break-words">
                  {row[column] || "—"}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
