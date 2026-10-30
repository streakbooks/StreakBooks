import { describe, expect, it } from "vitest";
import { prepareFixedAssetsCsv } from "./fixed-assets-import";
import { getImportDefinition } from "./import-definitions";
import { toCsv } from "@/lib/sales/csv";

const definition = getImportDefinition("fixed_assets", "Asset register");
const defaults: Record<string, string> = {
  asset_code: "OLD-001", description: "Office laptop", acquisition_date: "2025-04-01",
  cost: "1200.00", accumulated_depreciation: "200.00",
  asset_account_code: "1500", accumulated_account_code: "1590", expense_account_code: "7000",
  depreciation_method: "straight_line", useful_life_months: "36", annual_rate_percent: "",
  residual_value: "100.00", depreciation_start_date: "2025-04-01", asset_type: "",
};
const makeCsv = (...overrides: Array<Record<string,string>>) => toCsv(
  definition.fields.map(f => f.label),
  overrides.map(o => definition.fields.map(f => ({ ...defaults, ...o })[f.key] ?? "")),
);

describe("fixed asset CSV full-file preflight (no writes)", () => {
  it("validates account codes, opening depreciation and monthly terms", () => {
    const rows = prepareFixedAssetsCsv(makeCsv({}), "USD");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.externalCode).toBe("OLD-001");
    expect(rows[0]!.costMinor).toBe(120000);
    expect(rows[0]!.openingAccumulatedMinor).toBe(20000);
    expect(rows[0]!.residualMinor).toBe(10000);
    expect(rows[0]!.usefulLifeMonths).toBe(36);
  });
  it("handles annual rate as integer basis points", () => {
    const rows = prepareFixedAssetsCsv(makeCsv({ depreciation_method:"reducing_balance", useful_life_months:"", annual_rate_percent:"20.25" }),"USD");
    expect(rows[0]!.annualRateBps).toBe(2025);
  });
  it("rejects duplicate external references regardless of case", () => {
    expect(() => prepareFixedAssetsCsv(makeCsv({}, { asset_code:"old-001" }), "USD")).toThrow(/duplicate external/);
  });
  it("rejects invalid dates, unsupported precision and opening value exceeding cost", () => {
    expect(() => prepareFixedAssetsCsv(makeCsv({acquisition_date:"2026-02-30"}),"USD")).toThrow(/calendar date/);
    expect(() => prepareFixedAssetsCsv(makeCsv({cost:"123.999"}),"USD")).toThrow(/precision/);
    expect(() => prepareFixedAssetsCsv(makeCsv({accumulated_depreciation:"1150.00",residual_value:"100.00"}),"USD")).toThrow(/exceed cost/);
  });
  it("requires explicit depreciation terms and distinct GL accounts", () => {
    expect(() => prepareFixedAssetsCsv(makeCsv({useful_life_months:""}),"USD")).toThrow(/useful life/);
    expect(() => prepareFixedAssetsCsv(makeCsv({accumulated_account_code:"1500"}),"USD")).toThrow(/accounts must differ/);
    expect(() => prepareFixedAssetsCsv(makeCsv({depreciation_method:"reducing_balance",useful_life_months:"", annual_rate_percent:""}),"USD")).toThrow(/annual rate/);
  });
  it("limits batch size and rejects malformed CSV without writes", () => {
    expect(() => prepareFixedAssetsCsv(makeCsv(...Array.from({length:101},(_,i)=>({asset_code:"REF-"+i}))),"USD")).toThrow(/maximum import rows/);
    expect(() => prepareFixedAssetsCsv("Asset Code,Description\nX,A","USD")).toThrow(/required column/);
  });
});
