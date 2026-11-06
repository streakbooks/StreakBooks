import { monthEnd, monthStart, addMonthsIso } from "@/lib/accounting/fiscal-year";
import type { FixedAssetRow, AssetTypeRow } from "./fixed-assets.functions";
import { assetStatusAsOf } from "./register-view";

/**
 * Read-only portfolio snapshot. Derived from the tenant-scoped asset register plus
 * actual as-at depreciation register balances; no future purchases or disposals
 * are included in current-value totals.
 */
export type AssetPortfolioSnapshot = {
  activeCount: number;
  disposedCount: number;
  acquiredThisMonth: number;
  disposedThisMonth: number;
  possibleDepreciationOverdue: number | null;
  costMinor: string;
  accumulatedMinor: string | null;
  netBookValueMinor: string | null;
  categoryRows: Array<{
    key: string;
    name: string;
    count: number;
    costMinor: string;
    shareBps: number;
  }>;
  recentAcquisitions: FixedAssetRow[];
};

export function buildAssetPortfolioSnapshot(
  assets: readonly FixedAssetRow[],
  types: readonly Pick<AssetTypeRow, "id" | "name">[],
  asOf: string,
  accumulatedByAsset: ReadonlyMap<string, number> | null,
): AssetPortfolioSnapshot {
  const month = monthStart(asOf);
  const priorMonthEnd = monthEnd(addMonthsIso(month, -1));
  const active = assets.filter((asset) => assetStatusAsOf(asset, asOf) === "active");
  const disposed = assets.filter((asset) => assetStatusAsOf(asset, asOf) === "disposed");
  const names = new Map(types.map((t) => [t.id, t.name]));
  const group = new Map<string, { key: string; name: string; count: number; cost: bigint }>();
  let cost = 0n;
  let accumulated = 0n;
  let completeBalances = accumulatedByAsset !== null;
  let possibleOverdue = 0;

  for (const asset of active) {
    if (!Number.isSafeInteger(asset.cost_minor) || asset.cost_minor <= 0) {
      throw new Error("Asset dashboard requires exact positive register costs.");
    }
    const amount = BigInt(asset.cost_minor);
    cost += amount;
    const key = asset.asset_type_id ?? "unclassified";
    const category = group.get(key) ?? {
      key,
      name: asset.asset_type_id ? (names.get(asset.asset_type_id) ?? "Unlisted type") : "Unclassified",
      count: 0,
      cost: 0n,
    };
    category.count += 1;
    category.cost += amount;
    group.set(key, category);

    if (completeBalances) {
      const charge = accumulatedByAsset?.get(asset.id);
      if (
        charge === undefined || !Number.isSafeInteger(charge) ||
        charge < 0 || charge > asset.cost_minor
      ) {
        completeBalances = false;
      } else {
        accumulated += BigInt(charge);
        const cap = BigInt(asset.cost_minor) - BigInt(asset.residual_minor);
        if (
          asset.depreciation_method !== "none" &&
          asset.depreciation_start_date <= priorMonthEnd &&
          BigInt(charge) < cap &&
          (!asset.depreciated_through || asset.depreciated_through < priorMonthEnd)
        ) {
          possibleOverdue += 1;
        }
      }
    }
  }

  const categoryRows = [...group.values()]
    .sort((a, b) => a.cost === b.cost ? a.name.localeCompare(b.name) : a.cost > b.cost ? -1 : 1)
    .map((row) => ({
      key: row.key,
      name: row.name,
      count: row.count,
      costMinor: row.cost.toString(),
      shareBps: cost === 0n ? 0 : Number((row.cost * 10_000n) / cost),
    }));

  return {
    activeCount: active.length,
    disposedCount: disposed.length,
    acquiredThisMonth: assets.filter(
      (a) => a.purchase_date >= month && a.purchase_date <= asOf,
    ).length,
    disposedThisMonth: disposed.filter(
      (a) => a.disposal_date !== null && a.disposal_date >= month && a.disposal_date <= asOf,
    ).length,
    possibleDepreciationOverdue: completeBalances ? possibleOverdue : null,
    costMinor: cost.toString(),
    accumulatedMinor: completeBalances ? accumulated.toString() : null,
    netBookValueMinor: completeBalances ? (cost - accumulated).toString() : null,
    categoryRows,
    recentAcquisitions: assets
      .filter((a) => a.purchase_date <= asOf)
      .sort((a, b) => b.purchase_date.localeCompare(a.purchase_date) ||
        b.asset_number.localeCompare(a.asset_number))
      .slice(0, 6),
  };
}
