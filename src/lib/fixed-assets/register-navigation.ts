import type { AssetRegisterSort } from "./register-view";

export const FIXED_ASSET_SECTIONS = [
  "dashboard",
  "register",
  "depreciation",
  "types",
  "reconciliation",
  "bill-review",
] as const;
export type FixedAssetSection = (typeof FIXED_ASSET_SECTIONS)[number];

export type FixedAssetRegisterSearch = {
  tab?: FixedAssetSection;
  q?: string;
  status?: "all" | "active" | "disposed";
  typeId?: string;
  accountId?: string;
  sort?: AssetRegisterSort;
  desc?: boolean;
};

const SECTIONS = new Set<string>(FIXED_ASSET_SECTIONS);
const STATUSES = new Set(["all", "active", "disposed"]);
const SORTS = new Set(["number", "name", "purchase", "cost"]);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** URL parameters only describe a view; they cannot grant financial-data access. */
export function parseFixedAssetRegisterSearch(
  raw: Record<string, unknown>,
): FixedAssetRegisterSearch {
  const result: FixedAssetRegisterSearch = {};
  const tab = raw["tab"];
  if (typeof tab === "string" && SECTIONS.has(tab)) result.tab = tab as FixedAssetSection;
  const q = raw["q"];
  if (typeof q === "string" && q.length > 0 && q.length <= 120) result.q = q;
  const status = raw["status"];
  if (typeof status === "string" && STATUSES.has(status)) {
    result.status = status as NonNullable<FixedAssetRegisterSearch["status"]>;
  }
  for (const key of ["typeId", "accountId"] as const) {
    const id = raw[key];
    if (typeof id === "string" && UUID.test(id)) result[key] = id;
  }
  const sort = raw["sort"];
  if (typeof sort === "string" && SORTS.has(sort)) result.sort = sort as AssetRegisterSort;
  if (raw["desc"] === true || raw["desc"] === "true" || raw["desc"] === "1") {
    result.desc = true;
  }
  return result;
}
