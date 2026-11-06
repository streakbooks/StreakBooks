import type { FixedAssetRow } from "./fixed-assets.functions";
import { assetStatusAsOf, validAssetAccumulatedAt } from "./register-view";

/**
 * Read-only Fixed Assets register CSV generator.
 *
 * Receives authorised register records and actual as-at SQL balances.
 * It cannot silently substitute opening depreciation for a missing balance.
 * Returns text only: the caller owns downloads and browser error feedback.
 */
export function buildFixedAssetRegisterCsv(
  assets: readonly FixedAssetRow[],
  accumulatedByAssetId: ReadonlyMap<string, number> | null,
  asOf: string,
  typeNames: ReadonlyMap<string, string>,
  accountNames: ReadonlyMap<string, string>,
): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(asOf)) {
    throw new Error("Choose a valid register reporting date.");
  }
  if (accumulatedByAssetId === null) {
    throw new Error("Current depreciation balances are unavailable; refresh the asset register.");
  }
  const safeCell = (value: string | number | null): string => {
    const raw = String(value ?? "");
    // Neutralise spreadsheet formulas from user-entered asset names, numbers,
    // types and GL names. Exact financial amounts remain numeric.
    const safe = typeof value === "string" && /^\s*[=+@-]/.test(raw)
      ? "'" + raw
      : raw;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  const headers = [
    "Asset number",
    "Name",
    "Status as at " + asOf,
    "Asset type",
    "Asset account",
    "Purchase date",
    "Depreciation start",
    "Method",
    "Cost (minor units)",
    "Accumulated as at " + asOf + " (minor units)",
    "Net book value as at " + asOf + " (minor units)",
    "Depreciated through",
  ];
  const seen = new Set<string>();
  const rows = assets.map((asset) => {
    if (seen.has(asset.id)) throw new Error("Duplicate asset in register CSV selection.");
    seen.add(asset.id);
    const status = assetStatusAsOf(asset, asOf);
    const future = status === "not_acquired";
    const accumulated = future
      ? null
      : validAssetAccumulatedAt(asset, accumulatedByAssetId.get(asset.id));
    if (!future && accumulated === null) {
      throw new Error(
        "Cannot export without an exact as-at depreciation balance for every acquired asset.",
      );
    }
    return [
      asset.asset_number,
      asset.name,
      future ? "Not yet purchased" : status,
      asset.asset_type_id ? typeNames.get(asset.asset_type_id) ?? "Unlisted type" : "",
      accountNames.get(asset.asset_account_id) ?? "Unlisted account",
      asset.purchase_date,
      asset.depreciation_start_date,
      asset.depreciation_method,
      asset.cost_minor,
      future ? null : accumulated,
      future ? null : status === "disposed" ? 0 : asset.cost_minor - accumulated!,
      asset.depreciated_through,
    ];
  });
  return [headers, ...rows].map((row) => row.map(safeCell).join(",")).join("\r\n");
}
