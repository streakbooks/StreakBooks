import { describe, expect, it } from "vitest";
import { getImportDefinition } from "./import-definitions";
import { prepareFixedAssetsCsv } from "./fixed-assets-import";
import { fixedAssetSourceHeaders, mapFixedAssetCsv } from "./fixed-assets-header-mapping";
import { toCsv } from "@/lib/sales/csv";

const fields = getImportDefinition("fixed_assets", "Asset register").fields;
const data: Record<string, string> = {
  asset_code: "OLD-123", description: "Imported laptop", acquisition_date: "2024-01-02",
  cost: "1250.00", accumulated_depreciation: "250.00", opening_depreciation_through: "2026-09-30", depreciation_start_date: "2026-10-01", asset_account_code: "1500",
  accumulated_account_code: "1590", expense_account_code: "7000",
  depreciation_method: "straight_line", useful_life_months: "24",
};

describe("fixed asset CSV field-mapping wizard", () => {
  it("accepts the published template without manual mapping", () => {
    const raw = toCsv(fields.map((f) => f.label), [fields.map((f) => data[f.key] ?? "")]);
    expect(fixedAssetSourceHeaders(raw)).toHaveLength(fields.length);
    expect(prepareFixedAssetsCsv(mapFixedAssetCsv(raw, {}), "USD")[0]!.externalCode).toBe("OLD-123");
  });
  it("maps arbitrary legacy column headings while preserving exact minor units", () => {
    const raw = toCsv(fields.map((f) => f.key === "asset_code" ? "Legacy ID" : f.key === "cost" ? "Original Amount" : f.label),
      [fields.map((f) => data[f.key] ?? "")]);
    const normalized = mapFixedAssetCsv(raw, { asset_code: "Legacy ID", cost: "Original Amount" });
    const asset = prepareFixedAssetsCsv(normalized, "USD")[0]!;
    expect(asset.costMinor).toBe(125000);
    expect(asset.openingAccumulatedMinor).toBe(25000);
  });
  it("rejects missing required mapping, reused source columns and duplicate headings", () => {
    const headers = fields.map((f) => f.label);
    const raw = toCsv(headers, [fields.map((f) => data[f.key] ?? "")]);
    expect(() => mapFixedAssetCsv(raw, { asset_code: "" })).toThrow(/Map required field/);
    expect(() => mapFixedAssetCsv(raw, { description: "Asset Code" })).toThrow(/multiple asset fields/);
    expect(() => fixedAssetSourceHeaders("A,a\n1,2")).toThrow(/Duplicate source column/);
  });
  it("rejects mismatched row widths before any record can be written", () => {
    expect(() => mapFixedAssetCsv("Asset Code,Description\nONE", {})).toThrow(/column count/);
  });
});
