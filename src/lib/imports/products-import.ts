import { decimalPlacesFor, toMinorUnits } from "@/lib/accounting/money";
import { getImportDefinition } from "./import-definitions";
import { previewImportCsv } from "./import-preflight";

export type ProductImportRow = {
  sourceRow: number;
  code: string;
  name: string;
  kind: "service" | "product" | "non_inventory";
  salesPriceMinor: number;
  purchaseCostMinor: number;
};

const DEFINITION = getImportDefinition("products", "Products and services");
const SKU = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const KINDS = new Set(["service", "product", "non_inventory"]);

function amountInMinor(raw: string, currency: string, row: number, field: string): number {
  const value = raw || "0";
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error(`Row ${row}: ${field} must be a non-negative decimal amount`);
  }
  const decimals = value.split(".")[1]?.length ?? 0;
  if (decimals > decimalPlacesFor(currency)) {
    throw new Error(`Row ${row}: ${field} has more precision than ${currency} permits`);
  }
  const minor = toMinorUnits(value, currency);
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Row ${row}: ${field} exceeds the safe integer amount limit`);
  }
  return Number(minor);
}

/** Validates the entire file before any database write; the catalogue does not post journals. */
export function prepareProductsCsv(csvText: string, currency: string): ProductImportRow[] {
  if (csvText.length > 5 * 1024 * 1024) throw new Error("CSV exceeds the 5 MB limit");
  const preview = previewImportCsv(csvText, DEFINITION, { maxRows: 250, uniqueBy: ["sku"] });
  if (preview.issues.length) {
    const issue = preview.issues[0]!;
    throw new Error(`Row ${issue.row}: ${issue.message}`);
  }
  if (!preview.records.length) throw new Error("CSV has no product rows");
  const seen = new Set<string>();
  return preview.records.map(({ sourceRow, values }) => {
    const code = values["sku"] ?? "";
    const name = values["name"] ?? "";
    const kind = (values["type"] ?? "").toLowerCase();
    if (!SKU.test(code)) throw new Error(`Row ${sourceRow}: SKU must contain 1–40 letters, digits, dots, underscores or hyphens`);
    const key = code.toLowerCase();
    if (seen.has(key)) throw new Error(`Row ${sourceRow}: Duplicate SKU ${code} in file`);
    seen.add(key);
    if (name.length > 200) throw new Error(`Row ${sourceRow}: Name exceeds 200 characters`);
    if (!KINDS.has(kind)) throw new Error(`Row ${sourceRow}: Type must be service, product or non_inventory`);
    return {
      sourceRow,
      code,
      name,
      kind: kind as ProductImportRow["kind"],
      salesPriceMinor: amountInMinor(values["sale_price"] ?? "", currency, sourceRow, "Sale price"),
      purchaseCostMinor: amountInMinor(values["purchase_price"] ?? "", currency, sourceRow, "Purchase price"),
    };
  });
}
