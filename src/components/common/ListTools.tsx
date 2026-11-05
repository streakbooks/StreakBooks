import { csvFilename, downloadCsv, toCsv, type CsvCell } from "@/lib/reports/csv";
import { DataTableToolbar } from "./data-table-toolbar";

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
