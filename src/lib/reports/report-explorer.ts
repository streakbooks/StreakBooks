import type { CsvCell } from "./csv";
import type { ReportDocument } from "./report-document";

export type ExplorerCsv = { headers: string[]; rows: CsvCell[][]; basis?: string };
export type ExplorerOptions = {
  columns?: string | undefined;
  query?: string | undefined;
  field?: number | undefined;
  match?: string | undefined;
  group?: number | undefined;
  sort?: number | undefined;
  direction?: "asc" | "desc" | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
};
export type ExplorerRow =
  | { kind: "group"; label: string; count: number; key: string }
  | { kind: "data"; cells: CsvCell[]; key: number };

const numeric = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function selectedExplorerColumns(headers: string[], saved?: string): number[] {
  const all = headers.map((_, i) => i);
  if (!saved) return all;
  const items = saved.split(",").map(Number);
  const unique = [...new Set(items)].filter(
    (n) => Number.isInteger(n) && n >= 0 && n < headers.length,
  );
  return unique.length ? unique : all;
}

function displayCell(cell: CsvCell): string {
  return cell === null || cell === undefined ? "" : String(cell);
}

function compareCells(a: CsvCell, b: CsvCell): number {
  const x = displayCell(a);
  const y = displayCell(b);
  if (numeric.test(x) && numeric.test(y)) {
    // Compare decimal strings exactly: journal amounts can exceed Number.MAX_SAFE_INTEGER.
    const minusX = x.startsWith("-");
    const minusY = y.startsWith("-");
    if (minusX !== minusY) return minusX ? -1 : 1;
    const [integerX = "0", fractionX = ""] = (minusX ? x.slice(1) : x).split(".");
    const [integerY = "0", fractionY = ""] = (minusY ? y.slice(1) : y).split(".");
    const absolute =
      Math.sign(integerX.length - integerY.length) ||
      integerX.localeCompare(integerY) ||
      fractionX
        .padEnd(Math.max(fractionX.length, fractionY.length), "0")
        .localeCompare(fractionY.padEnd(Math.max(fractionX.length, fractionY.length), "0"));
    return minusX ? -absolute : absolute;
  }
  return collator.compare(x, y);
}

/**
 * Presentation-only exploration of already-loaded report rows.
 * Never changes ledger amounts, statement calculations or server-side report filters.
 * Source total/heading rows are intentionally preserved and never recomputed.
 */
export function prepareReportExplorer(data: ExplorerCsv, options: ExplorerOptions = {}) {
  const headers = data.headers;
  const columns = selectedExplorerColumns(headers, options.columns);
  const field =
    options.field !== undefined && options.field >= 0 && options.field < headers.length
      ? options.field
      : undefined;
  const group =
    options.group !== undefined && options.group >= 0 && options.group < headers.length
      ? options.group
      : undefined;
  const sort =
    options.sort !== undefined && options.sort >= 0 && options.sort < headers.length
      ? options.sort
      : undefined;
  const query = (options.query ?? "").trim().toLocaleLowerCase();
  const match = (options.match ?? "").trim().toLocaleLowerCase();
  const rows = data.rows
    .map((source, index) => ({ source, index }))
    .filter(({ source }) => {
      const text = (cell: CsvCell) => displayCell(cell).toLocaleLowerCase();
      if (query && !source.some((cell) => text(cell).includes(query))) return false;
      if (match && (field === undefined || !text(source[field]).includes(match))) return false;
      return true;
    });
  if (sort !== undefined) {
    const multiplier = options.direction === "desc" ? -1 : 1;
    rows.sort(
      (a, b) => multiplier * compareCells(a.source[sort], b.source[sort]) || a.index - b.index,
    );
  }
  const groups = new Map<string, typeof rows>();
  if (group !== undefined) {
    for (const row of rows) {
      const name = displayCell(row.source[group]).trim() || "(blank)";
      const items = groups.get(name) ?? [];
      items.push(row);
      groups.set(name, items);
    }
  }
  const ordered =
    group === undefined
      ? rows.map((row) => ({ ...row, groupName: undefined as string | undefined }))
      : [...groups.keys()]
          .sort(collator.compare)
          .flatMap((groupName) => groups.get(groupName)!.map((row) => ({ ...row, groupName })));
  const requestedPageSize = options.pageSize ?? 50;
  const pageSize = [25, 50, 100, 200].includes(requestedPageSize) ? requestedPageSize : 50;
  const totalPages = Math.max(1, Math.ceil(ordered.length / pageSize));
  const page = Math.min(Math.max(1, options.page ?? 1), totalPages);
  const shown = ordered.slice((page - 1) * pageSize, page * pageSize);
  const presentationRows: ExplorerRow[] = [];
  let previousGroup: string | undefined;
  for (const row of shown) {
    if (row.groupName !== undefined && row.groupName !== previousGroup) {
      presentationRows.push({
        kind: "group",
        label: row.groupName,
        count: groups.get(row.groupName)?.length ?? 0,
        key: row.groupName,
      });
      previousGroup = row.groupName;
    }
    presentationRows.push({
      kind: "data",
      cells: columns.map((index) => row.source[index] ?? ""),
      key: row.index,
    });
  }
  const projectedHeaders = columns.map((index) => headers[index] ?? "");
  const exportRows: CsvCell[][] = presentationRows.map((row) =>
    row.kind === "group"
      ? ["Group: " + row.label + " (" + row.count + " rows)", ...columns.slice(1).map(() => "")]
      : row.cells,
  );
  return {
    columns,
    headers: projectedHeaders,
    rows: presentationRows,
    exportRows,
    total: rows.length,
    sourceTotal: data.rows.length,
    page,
    pageSize,
    totalPages,
    groupCount: groups.size,
    basis: (() => {
      const disclosure =
        "Customized loaded-row view; filters and grouping do not recalculate accounting totals.";
      const source = (data.basis ?? "").slice(0, 300 - disclosure.length - 1);
      return [source, disclosure].filter(Boolean).join(" ");
    })(),
  };
}

/** Convert native standard statement sections without losing section/row semantics. */
export function standardDocumentExplorerCsv(document: ReportDocument): ExplorerCsv {
  const financialColumns = [...new Set(document.sections.flatMap((section) => section.columns))];
  const headers = ["Section", "Line", "Row type", ...financialColumns];
  const rows: CsvCell[][] = [];
  for (const section of document.sections) {
    const positions = new Map(section.columns.map((column, i) => [column, i]));
    for (const row of section.rows) {
      rows.push([
        section.title,
        row.label,
        row.kind,
        ...financialColumns.map((column) => {
          const index = positions.get(column);
          return index === undefined ? "" : (row.values[index] ?? "");
        }),
      ]);
    }
  }
  return {
    headers,
    rows,
    basis: `${document.basis === "cash" ? "Cash basis. " : document.basis === "accrual" ? "Accrual basis. " : ""}Standard statement source rows and sections; totals are taken from the captured statement.`,
  };
}
