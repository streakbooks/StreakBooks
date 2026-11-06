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
  description: string | null;
  unit: string;
  salesTaxRateBps: number;
  purchaseTaxRateBps: number;
  incomeAccountId: string | null;
  expenseAccountId: string | null;
};

const DEFINITION = getImportDefinition("products", "Products and services");
const SKU = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const KINDS = new Set(["service", "product", "non_inventory"]);
const UUID = /^[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12}$/;

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

/** Read percentage strings exactly as integer basis points, never using float rounding. */
function percentToBps(raw: string, row: number, label: string): number {
  if (!raw) return 0;
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error(`Row ${row}: ${label} requires 0–100 with up to 2 decimals`);
  }
  const [whole = "0", fraction = ""] = raw.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(bps) || bps > 10000) {
    throw new Error(`Row ${row}: ${label} must be between 0% and 100%`);
  }
  return bps;
}

function optionalAccountId(raw: string, row: number, label: string): string | null {
  if (!raw) return null;
  if (!UUID.test(raw)) throw new Error(`Row ${row}: ${label} must be a UUID`);
  return raw;
}

/** Validates all catalogue CSV fields before any database write; no stock or journal posting. */
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
    if (!SKU.test(code)) {
      throw new Error(
        `Row ${sourceRow}: SKU must contain 1–40 letters, digits, dots, underscores or hyphens`,
      );
    }
    const key = code.toLowerCase();
    if (seen.has(key)) throw new Error(`Row ${sourceRow}: Duplicate SKU ${code} in file`);
    seen.add(key);
    if (name.length > 200) throw new Error(`Row ${sourceRow}: Name exceeds 200 characters`);
    if (!KINDS.has(kind)) {
      throw new Error(`Row ${sourceRow}: Type must be service, product or non_inventory`);
    }
    const description = values["description"] ?? "";
    if (description.length > 2000) {
      throw new Error(`Row ${sourceRow}: Description exceeds 2000 characters`);
    }
    const unit = values["unit"] || "each";
    if (unit.length > 40) throw new Error(`Row ${sourceRow}: Unit exceeds 40 characters`);
    const status = (values["status"] || "Active").toLowerCase();
    if (status !== "active") {
      throw new Error(
        `Row ${sourceRow}: Only Active items can be imported; filter out archived items first`,
      );
    }
    return {
      sourceRow,
      code,
      name,
      kind: kind as ProductImportRow["kind"],
      salesPriceMinor: amountInMinor(values["sale_price"] ?? "", currency, sourceRow, "Sale price"),
      purchaseCostMinor: amountInMinor(
        values["purchase_price"] ?? "",
        currency,
        sourceRow,
        "Purchase price",
      ),
      description: description || null,
      unit,
      salesTaxRateBps: percentToBps(values["sales_tax_percent"] || "", sourceRow, "Sales Tax (%)"),
      purchaseTaxRateBps: percentToBps(
        values["purchase_tax_percent"] || "",
        sourceRow,
        "Purchase Tax (%)",
      ),
      incomeAccountId: optionalAccountId(
        values["income_account_id"] || "",
        sourceRow,
        "Income Account ID",
      ),
      expenseAccountId: optionalAccountId(
        values["expense_account_id"] || "",
        sourceRow,
        "Expense Account ID",
      ),
    };
  });
}
