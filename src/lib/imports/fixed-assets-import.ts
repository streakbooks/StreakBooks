import { decimalPlacesFor, toMinorUnits } from "@/lib/accounting/money";
import { validateAssetTerms, type DepreciationMethod } from "@/lib/fixed-assets/depreciation";
import { getImportDefinition } from "./import-definitions";
import { previewImportCsv } from "./import-preflight";

export type AssetImportRow = {
  sourceRow: number;
  externalCode: string;
  name: string;
  purchaseDate: string;
  depreciationStartDate: string;
  costMinor: number;
  openingAccumulatedMinor: number;
  residualMinor: number;
  method: DepreciationMethod;
  usefulLifeMonths: number | null;
  annualRateBps: number | null;
  assetAccountCode: string;
  accumulatedAccountCode: string;
  expenseAccountCode: string;
  assetTypeName: string | null;
};

function actualDate(raw: string, row: number, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error("Row " + row + ": " + label + " must be YYYY-MM-DD");
  const d = new Date(raw + "T00:00:00Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== raw) {
    throw new Error("Row " + row + ": " + label + " is not a calendar date");
  }
  return raw;
}

function money(raw: string, currency: string, row: number, label: string): number {
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error("Row " + row + ": " + label + " must be a non-negative amount");
  if ((raw.split(".")[1] ?? "").length > decimalPlacesFor(currency)) {
    throw new Error("Row " + row + ": " + label + " exceeds " + currency + " precision");
  }
  const value = toMinorUnits(raw, currency);
  if (value > 900000000000000n) throw new Error("Row " + row + ": " + label + " exceeds the supported asset limit");
  return Number(value);
}

/** Full-file, read-only preflight; never creates assets or journal entries. */
export function prepareFixedAssetsCsv(csvText: string, currency: string): AssetImportRow[] {
  if (typeof csvText !== "string" || csvText.length > 5 * 1024 * 1024) {
    throw new Error("Invalid CSV or file exceeds 5 MB");
  }
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid organisation currency");
  const preview = previewImportCsv(csvText, getImportDefinition("fixed_assets", "Asset register"), { maxRows: 100 });
  if (preview.issues.length) {
    const issue = preview.issues[0]!;
    throw new Error("Row " + issue.row + ": " + issue.message);
  }
  if (!preview.records.length) throw new Error("No asset rows to import");
  const seen = new Set<string>();
  const out: AssetImportRow[] = [];
  for (const { sourceRow, values: v } of preview.records) {
    const externalCode = (v["asset_code"] ?? "").trim();
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(externalCode)) throw new Error("Row " + sourceRow + ": invalid external asset reference");
    const key = externalCode.toLocaleLowerCase("en-US");
    if (seen.has(key)) throw new Error("Row " + sourceRow + ": duplicate external asset reference");
    seen.add(key);
    const name = (v["description"] ?? "").trim();
    if (name.length < 1 || name.length > 160) throw new Error("Row " + sourceRow + ": asset description must be 1–160 characters");
    const purchaseDate = actualDate(v["acquisition_date"] ?? "", sourceRow, "Acquisition date");
    const depreciationStartDate = actualDate(v["depreciation_start_date"] || purchaseDate, sourceRow, "Depreciation start date");
    if (depreciationStartDate < purchaseDate) throw new Error("Row " + sourceRow + ": depreciation start cannot precede acquisition");
    const costMinor = money(v["cost"] ?? "", currency, sourceRow, "Cost");
    const openingAccumulatedMinor = money(v["accumulated_depreciation"] || "0", currency, sourceRow, "Accumulated depreciation");
    const residualMinor = money(v["residual_value"] || "0", currency, sourceRow, "Residual value");
    const method = (v["depreciation_method"] ?? "").trim() as DepreciationMethod;
    if (!["straight_line", "reducing_balance", "none"].includes(method)) throw new Error("Row " + sourceRow + ": invalid depreciation method");
    const lifeRaw = (v["useful_life_months"] ?? "").trim();
    const usefulLifeMonths = lifeRaw ? Number(lifeRaw) : null;
    if (lifeRaw && (!/^\d+$/.test(lifeRaw) || !Number.isSafeInteger(usefulLifeMonths))) throw new Error("Row " + sourceRow + ": invalid useful life");
    const rateRaw = (v["annual_rate_percent"] ?? "").trim();
    if (rateRaw && !/^\d+(\.\d{1,2})?$/.test(rateRaw)) throw new Error("Row " + sourceRow + ": invalid annual rate precision");
    const annualRateBps = rateRaw ? Number(toMinorUnits(rateRaw, "USD")) : null;
    if (method !== "straight_line" && lifeRaw) throw new Error("Row " + sourceRow + ": useful life applies to straight line only");
    if (method !== "reducing_balance" && rateRaw) throw new Error("Row " + sourceRow + ": annual rate applies to reducing balance only");
    const problems = validateAssetTerms({ method, costMinor, residualMinor, openingAccumulatedMinor, usefulLifeMonths, annualRateBps });
    if (problems.length) throw new Error("Row " + sourceRow + ": " + problems[0]);
    const readCode = (field: string) => {
      const code = (v[field] ?? "").trim();
      if (!/^[A-Za-z0-9._-]{1,40}$/.test(code)) throw new Error("Row " + sourceRow + ": invalid " + field.replaceAll("_", " "));
      return code;
    };
    const assetAccountCode = readCode("asset_account_code");
    const accumulatedAccountCode = readCode("accumulated_account_code");
    const expenseAccountCode = readCode("expense_account_code");
    if (assetAccountCode === accumulatedAccountCode) throw new Error("Row " + sourceRow + ": asset and accumulated accounts must differ");
    const assetTypeName = (v["asset_type"] ?? "").trim() || null;
    if (assetTypeName && assetTypeName.length > 160) throw new Error("Row " + sourceRow + ": asset type is too long");
    out.push({ sourceRow, externalCode, name, purchaseDate, depreciationStartDate, costMinor,
      openingAccumulatedMinor, residualMinor, method, usefulLifeMonths, annualRateBps,
      assetAccountCode, accumulatedAccountCode, expenseAccountCode, assetTypeName });
  }
  return out;
}
