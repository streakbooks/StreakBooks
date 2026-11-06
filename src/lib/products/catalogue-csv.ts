import { fromMinorUnits } from "@/lib/accounting/money";

export type CatalogueCsvItem = {
  code: string | null;
  name: string;
  kind: string;
  description: string | null;
  unit: string;
  sales_price_minor: number;
  purchase_cost_minor: number;
  sales_tax_rate_bps: number;
  purchase_tax_rate_bps: number;
  is_active: boolean;
  income_account_id: string | null;
  expense_account_id: string | null;
  category_id?: string | null;
};

/** Escape RFC 4180 CSV and neutralise leading spreadsheet formulas, including after whitespace. */
export function catalogueCsvCell(value: string | number | null | undefined): string {
  let cell = value == null ? "" : String(value);
  if (/^[\s\uFEFF]*[=+\-@]/.test(cell) && !/^\s*-?\d+(?:\.\d+)?\s*$/.test(cell)) {
    cell = `'${cell}`;
  }
  return `"${cell.replace(/"/g, '""')}"`;
}

/** Reporting export only: existing CSV importer accepts five fields and is not lossless. */
export function productsToCsv(rows: readonly CatalogueCsvItem[], currency: string): string {
  const records: Array<Array<string | number | null>> = [
    [
      "SKU",
      "Name",
      "Type",
      "Description",
      "Unit",
      "Sale Price",
      "Purchase Price",
      "Sales Tax (%)",
      "Purchase Tax (%)",
      "Status",
      "Income Account ID",
      "Expense Account ID",
      "Category ID",
    ],
    ...rows.map((row) => [
      row.code,
      row.name,
      row.kind,
      row.description,
      row.unit,
      fromMinorUnits(BigInt(row.sales_price_minor), currency),
      fromMinorUnits(BigInt(row.purchase_cost_minor), currency),
      (row.sales_tax_rate_bps / 100).toFixed(2),
      (row.purchase_tax_rate_bps / 100).toFixed(2),
      row.is_active ? "Active" : "Archived",
      row.income_account_id,
      row.expense_account_id,
      row.category_id ?? null,
    ]),
  ];
  return records.map((record) => record.map(catalogueCsvCell).join(",")).join("\r\n") + "\r\n";
}
