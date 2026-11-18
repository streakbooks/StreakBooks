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
  tab?: FixedAssetSection | undefined;
  q?: string | undefined;
  status?: "all" | "active" | "disposed" | undefined;
  typeId?: string | undefined;
  accountId?: string | undefined;
  sort?: AssetRegisterSort | undefined;
  desc?: boolean | undefined;
};

const SECTIONS = new Set<string>(FIXED_ASSET_SECTIONS);
const STATUSES = new Set(["all", "active", "disposed"]);
const SORTS = new Set(["number", "name", "purchase", "cost"]);
const UNSAFE_SEARCH = /[\p{Cc}\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** URL parameters only describe a view; they cannot grant financial-data access. */
export function parseFixedAssetRegisterSearch(
  raw: Record<string, unknown>,
): FixedAssetRegisterSearch {
  const result: FixedAssetRegisterSearch = {};
  const tab = raw["tab"];
  if (typeof tab === "string" && SECTIONS.has(tab)) result.tab = tab as FixedAssetSection;
  const q = raw["q"];
  if (typeof q === "string" && !UNSAFE_SEARCH.test(q)) {
    const normalized = q.trim();
    if (normalized.length > 0 && normalized.length <= 120) result.q = normalized;
  }
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
