import type { ImportDefinition } from "./import-definitions";
import { parseImportCsv, previewImportCsv } from "./import-preflight";
import { prepareTransactionCsv } from "./transaction-import-validation";
import { prepareProductsCsv } from "./products-import";
import { prepareProjectsCsv } from "./projects-import";
import { toCsv } from "@/lib/sales/csv";

export const MIGRATION_SOURCES = [
  "Linkbooks",
  "Xero",
  "QuickBooks Online",
  "Zoho Books",
  "MYOB",
  "Akaunting",
  "Wave",
  "FreshBooks",
  "Sage Accounting",
  "Odoo",
  "NetSuite",
  "Business Central",
  "Sage Intacct",
  "FreeAgent",
  "Kashoo",
  "Manager",
  "Patriot",
  "ERPNext",
  "Other CSV",
] as const;
export type MigrationDateFormat = "ISO" | "DMY" | "MDY";
export type MigrationMapping = Record<string, string>;
const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const aliases: Record<string, string[]> = {
  invoice_number: ["InvoiceNumber", "InvoiceNo", "Invoice #"],
  bill_number: ["BillNumber", "BillNo", "Bill #", "Purchase No."],
  customer: ["ContactName", "CustomerName", "Customer"],
  supplier: ["ContactName", "SupplierName", "Vendor", "VendorName"],
  invoice_date: ["InvoiceDate", "Date"],
  bill_date: ["BillDate", "Date"],
  due_date: ["DueDate"],
  account_code: ["AccountCode", "Account Code", "AccountNumber"],
  description: ["Description", "ItemDescription", "LineDescription"],
  quantity: ["Quantity", "Qty"],
  unit_price: ["UnitAmount", "UnitPrice", "Rate", "Price"],
  tax_code: ["TaxType", "TaxCode"],
  sku: ["ItemCode", "ItemNumber", "ProductCode"],
  name: ["Name", "ItemName", "ContactName"],
  sale_price: ["SalesPrice", "SellingPrice"],
  purchase_price: ["PurchasePrice", "CostPrice"],
};

export function migrationHeaders(text: string): string[] {
  if (new TextEncoder().encode(text).length > 5 * 1024 * 1024) throw new Error("File exceeds 5 MB");
  const rows = parseImportCsv(text);
  if (rows.length < 2) throw new Error("Upload a CSV with a header and at least one data row");
  if (rows.length > 10_001) throw new Error("File exceeds 10,000 rows; split the export");
  const headers = rows[0]!.map((h) => h.trim());
  const seen = new Set<string>();
  for (const header of headers) {
    const key = normalise(header);
    if (!key || seen.has(key)) throw new Error("Source headings must be non-empty and unique");
    seen.add(key);
  }
  if (rows.slice(1).some((row) => row.length !== headers.length))
    throw new Error("Source row column count differs from header");
  return headers;
}

/** Ambiguous aliases are deliberately left unmapped for explicit review. */
export function suggestMigrationMapping(
  headers: string[],
  definition: ImportDefinition,
): MigrationMapping {
  return Object.fromEntries(
    definition.fields.map((field) => {
      const exact = headers.filter(
        (h) => normalise(h) === normalise(field.label) || normalise(h) === normalise(field.key),
      );
      const matches = exact.length
        ? exact
        : headers.filter((h) =>
            (aliases[field.key] ?? []).some((alias) => normalise(alias) === normalise(h)),
          );
      return [field.key, matches.length === 1 ? matches[0]! : ""];
    }),
  );
}

function convertDate(value: string, format: MigrationDateFormat): string {
  if (!value || /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (format === "ISO")
    throw new Error("Dates must be YYYY-MM-DD, or select the source date format");
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  if (!match) throw new Error("Source date must contain a four-digit year");
  return `${match[3]}-${(format === "DMY" ? match[2]! : match[1]!).padStart(2, "0")}-${(format === "DMY" ? match[1]! : match[2]!).padStart(2, "0")}`;
}

// Transport CSV must preserve original values. Spreadsheet neutralisation belongs
// only in downloadable reports, otherwise contact names such as +Partners change.
const transportCell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
export function mapMigrationCsv(
  text: string,
  definition: ImportDefinition,
  mapping: MigrationMapping,
  format: MigrationDateFormat,
): string {
  const headers = migrationHeaders(text);
  const assigned = new Set<string>();
  for (const field of definition.fields) {
    const source = mapping[field.key];
    if (!source && field.required) throw new Error(`Map required field: ${field.label}`);
    if (source && !headers.includes(source))
      throw new Error(`Source column no longer exists: ${source}`);
    if (source && assigned.has(source))
      throw new Error(`Source column is mapped more than once: ${source}`);
    if (source) assigned.add(source);
  }
  const output = [definition.fields.map((f) => f.label)];
  for (const [index, cells] of parseImportCsv(text).slice(1).entries()) {
    output.push(
      definition.fields.map((field) => {
        const source = mapping[field.key];
        const value = source ? (cells[headers.indexOf(source)] ?? "").trim() : "";
        try {
          return field.key.endsWith("date") ? convertDate(value, format) : value;
        } catch (error) {
          throw new Error(
            `Row ${index + 2}: ${error instanceof Error ? error.message : "Invalid date"}`,
          );
        }
      }),
    );
  }
  return output.map((row) => row.map(transportCell).join(",")).join("\r\n") + "\r\n";
}

/** Same pure domain validators as server writers; database references remain server-authoritative. */
export function validateMigrationCsv(
  csv: string,
  definition: ImportDefinition,
  currency: string,
): void {
  const preview = previewImportCsv(csv, definition);
  if (preview.issues.length)
    throw new Error(`Row ${preview.issues[0]!.row}: ${preview.issues[0]!.message}`);
  if (!preview.records.length) throw new Error("File contains no records");
  if (definition.module === "sales" || definition.module === "purchases") {
    const docs = prepareTransactionCsv(csv, definition.module, currency);
    if (definition.module === "sales" && docs.some((doc) => doc.documentNumber.length > 40))
      throw new Error("Invoice number exceeds 40 characters");
  }
  if (definition.module === "products") prepareProductsCsv(csv, currency);
  if (definition.module === "projects") prepareProjectsCsv(csv);
}

export function migrationValidationReport(
  source: string,
  fileName: string,
  definition: ImportDefinition,
  mapping: MigrationMapping,
  error: string,
  companyId: string,
  currency: string,
): string {
  return toCsv(
    ["Check", "Result", "Detail"],
    [
      ["Source platform", source, fileName],
      ["Destination organisation", companyId, currency],
      ["Document type", definition.documentType, definition.module],
      [
        "File validation",
        error ? "BLOCKED" : "PASSED",
        error || "File structure and applicable domain checks passed",
      ],
      [
        "Database checks",
        "REQUIRED ON IMPORT",
        "Server verifies permissions, company-scoped references and existing records",
      ],
      [
        "Financial reconciliation",
        "NOT PERFORMED",
        "Reconcile trial balance, AR/AP, tax and bank balances before cutover",
      ],
      ...definition.fields.map((field) => [
        field.label,
        mapping[field.key] || "Unmapped",
        field.required ? "Required" : "Optional",
      ]),
    ],
  );
}

/** Stop known lossy conversions rather than silently dropping financial meaning. */
export function validateSourceFinancialSemantics(text: string, currency: string): void {
  const headers = migrationHeaders(text);
  for (const [row, cells] of parseImportCsv(text).slice(1).entries()) {
    for (const [column, header] of headers.entries()) {
      const key = normalise(header);
      const value = (cells[column] ?? "").trim();
      if (!value) continue;
      if (["currency", "currencycode"].includes(key) && value.toUpperCase() !== currency) {
        throw new Error(
          `Row ${row + 2}: foreign currency ${value} requires a separate migration workflow`,
        );
      }
      if (
        [
          "discount",
          "discountamount",
          "discountpercent",
          "discountpercentage",
          "amountpaid",
          "paidamount",
          "paymentamount",
        ].includes(key) &&
        !/^0+(\.0+)?%?$/.test(value)
      ) {
        throw new Error(
          `Row ${row + 2}: ${header} cannot be discarded; migrate payments or discounts separately`,
        );
      }
      if (
        ["taxinclusive", "istaxinclusive", "amountsare", "lineamounttypes"].includes(key) &&
        !["false", "no", "0", "exclusive", "tax exclusive", "taxexclusive"].includes(
          value.toLowerCase(),
        )
      ) {
        throw new Error(`Row ${row + 2}: confirm tax-exclusive prices before importing ${header}`);
      }
    }
  }
}
