import type { AssetAccount, AssetTypeRow, FixedAssetRow } from "./fixed-assets.functions";

export type AssetRegisterSort = "number" | "name" | "purchase" | "cost";

export type AssetRegisterFilters = {
  search: string;
  status: "all" | "active" | "disposed";
  typeId: string;
  accountId: string;
  sort: AssetRegisterSort;
  descending: boolean;
};

const byNumber = (a: FixedAssetRow, b: FixedAssetRow) =>
  a.asset_number.localeCompare(b.asset_number, undefined, { numeric: true });

/** Pure, tenant-scoped selection over records already authorised by the register endpoint. */
export function selectRegisterAssets(
  assets: readonly FixedAssetRow[],
  filters: AssetRegisterFilters,
  types: readonly Pick<AssetTypeRow, "id" | "name">[],
  accounts: readonly Pick<AssetAccount, "id" | "code" | "name">[],
): FixedAssetRow[] {
  const typeNames = new Map(types.map((type) => [type.id, type.name]));
  const accountNames = new Map(
    accounts.map((account) => [account.id, account.code + " " + account.name]),
  );
  const term = filters.search.trim().toLocaleLowerCase("en-US");
  const result = assets.filter((asset) => {
    if (filters.status !== "all" && asset.status !== filters.status) return false;
    if (filters.typeId && asset.asset_type_id !== filters.typeId) return false;
    if (filters.accountId && asset.asset_account_id !== filters.accountId) return false;
    if (!term) return true;
    return [
      asset.asset_number,
      asset.name,
      asset.description ?? "",
      asset.notes ?? "",
      asset.asset_type_id ? (typeNames.get(asset.asset_type_id) ?? "") : "",
      accountNames.get(asset.asset_account_id) ?? "",
    ].some((value) => value.toLocaleLowerCase("en-US").includes(term));
  });
  result.sort((a, b) => {
    let compared = 0;
    if (filters.sort === "name") compared = a.name.localeCompare(b.name);
    if (filters.sort === "purchase") compared = a.purchase_date.localeCompare(b.purchase_date);
    if (filters.sort === "cost") compared = a.cost_minor - b.cost_minor;
    if (filters.sort === "number") compared = byNumber(a, b);
    return (filters.descending ? -compared : compared) || byNumber(a, b);
  });
  return result;
}

/** Effective register state as at a date; future purchases/disposals are not misclassified. */
export function assetStatusAsOf(
  asset: Pick<FixedAssetRow, "purchase_date" | "status" | "disposal_date">,
  asOf: string,
): "not_acquired" | "active" | "disposed" {
  if (asset.purchase_date > asOf) return "not_acquired";
  return asset.status === "disposed" && asset.disposal_date !== null && asset.disposal_date <= asOf
    ? "disposed"
    : "active";
}

export type ActiveAssetSummary = {
  activeCount: number;
  costMinor: number | null;
  accumulatedMinor: number | null;
  netBookValueMinor: number | null;
};

/**
 * Only exact as-at accumulated depreciation within the saved asset's
 * depreciation terms can be displayed or exported as an accounting balance.
 * A missing or contradictory balance must not be substituted with a guess.
 */
export function validAssetAccumulatedAt(
  asset: Pick<FixedAssetRow, "cost_minor" | "residual_minor" | "opening_accumulated_minor">,
  amount: number | undefined,
): number | null {
  if (
    !Number.isSafeInteger(asset.cost_minor) ||
    asset.cost_minor <= 0 ||
    !Number.isSafeInteger(asset.residual_minor) ||
    asset.residual_minor < 0 ||
    !Number.isSafeInteger(asset.opening_accumulated_minor) ||
    asset.opening_accumulated_minor < 0 ||
    asset.residual_minor + asset.opening_accumulated_minor > asset.cost_minor ||
    amount === undefined ||
    !Number.isSafeInteger(amount) ||
    amount < asset.opening_accumulated_minor ||
    amount > asset.cost_minor - asset.residual_minor
  )
    return null;
  return amount;
}

/**
 * Use only real as-at register balances. Missing/stale balances must never be
 * replaced by opening depreciation: doing so understates posted depreciation.
 */
export function summariseActiveAssets(
  assets: readonly FixedAssetRow[],
  asOf: string,
  accumulatedByAssetId: ReadonlyMap<string, number> | null,
): ActiveAssetSummary {
  const active = assets.filter((asset) => assetStatusAsOf(asset, asOf) === "active");
  let cost = 0;
  for (const asset of active) {
    if (
      !Number.isSafeInteger(asset.cost_minor) ||
      asset.cost_minor <= 0 ||
      !Number.isSafeInteger(asset.residual_minor) ||
      asset.residual_minor < 0 ||
      !Number.isSafeInteger(asset.opening_accumulated_minor) ||
      asset.opening_accumulated_minor < 0 ||
      asset.residual_minor + asset.opening_accumulated_minor > asset.cost_minor
    ) {
      return {
        activeCount: active.length,
        costMinor: null,
        accumulatedMinor: null,
        netBookValueMinor: null,
      };
    }
    cost += asset.cost_minor;
    if (!Number.isSafeInteger(cost)) {
      return {
        activeCount: active.length,
        costMinor: null,
        accumulatedMinor: null,
        netBookValueMinor: null,
      };
    }
  }
  if (!accumulatedByAssetId) {
    return {
      activeCount: active.length,
      costMinor: cost,
      accumulatedMinor: null,
      netBookValueMinor: null,
    };
  }
  let accumulated = 0;
  for (const asset of active) {
    const value = validAssetAccumulatedAt(asset, accumulatedByAssetId.get(asset.id));
    if (value === null) {
      return {
        activeCount: active.length,
        costMinor: cost,
        accumulatedMinor: null,
        netBookValueMinor: null,
      };
    }
    accumulated += value;
    if (!Number.isSafeInteger(accumulated)) {
      return {
        activeCount: active.length,
        costMinor: cost,
        accumulatedMinor: null,
        netBookValueMinor: null,
      };
    }
  }
  const nbv = cost - accumulated;
  return {
    activeCount: active.length,
    costMinor: cost,
    accumulatedMinor: accumulated,
    netBookValueMinor: Number.isSafeInteger(nbv) ? nbv : null,
  };
}
