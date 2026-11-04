import { useMemo, useState } from "react";
import { csvFilename, downloadCsv, toCsv, type CsvCell } from "@/lib/reports/csv";
import { DataTableToolbar } from "./data-table-toolbar";

/** Case-insensitive match: every word of the query must appear in the row's searchable text. */
export function matchesQuery(text: string, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = text.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Search box state for a list that is already loaded in the browser. */
export function useListSearch<T>(rows: readonly T[], textOf: (row: T) => string) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => rows.filter((r) => matchesQuery(textOf(r), query)),
    [rows, query, textOf],
  );
  return { query, setQuery, filtered };
}

/**
 * Search plus CSV export for the rows currently shown. The export is exactly the filtered rows, so
 * it can be used to check a list against a statement or reconciliation.
 */
export function ListToolbar({
  query,
  onQuery,
  shown,
  total,
  placeholder,
  exportCsv,
}: {
  query: string;
  onQuery: (q: string) => void;
  shown: number;
  total: number;
  placeholder: string;
  exportCsv?: {
    company: string;
    title: string;
    currency: string;
    headers: string[];
    rows: CsvCell[][];
  };
}) {
  return (
    <DataTableToolbar
      search={query}
      onSearchChange={onQuery}
      searchPlaceholder={placeholder}
      summary={shown === total ? `${total} records` : `${shown} of ${total} records`}
      exportDisabled={shown === 0}
      onExport={
        exportCsv
          ? () => {
              const text = toCsv(
                {
                  company: exportCsv.company,
                  report: exportCsv.title,
                  period: "All dates",
                  currency: exportCsv.currency,
                },
                exportCsv.headers,
                exportCsv.rows,
              );
              downloadCsv(
                csvFilename(exportCsv.title, new Date().toISOString().slice(0, 10)),
                text,
              );
            }
          : undefined
      }
    />
  );
}
