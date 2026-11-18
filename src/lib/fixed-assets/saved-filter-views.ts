import { hasAsciiControlCharacters } from "@/lib/text-validation";
import type { AssetRegisterFilters } from "./register-view";

/** A named view saves *filters and sorting*, not accounting data or permissions. */
export type SavedAssetFilterView = {
  name: string;
  filters: AssetRegisterFilters;
};

const STATUSES = ["all", "active", "disposed"];
const SORTS = ["number", "name", "purchase", "cost"];
const MAX_VIEWS = 10;
const MAX_NAME = 48;
const MAX_QUERY = 120;

export function normalizeAssetFilterView(value: unknown): SavedAssetFilterView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const name = typeof input["name"] === "string" ? input["name"].trim() : "";
  if (!name || name.length > MAX_NAME || hasAsciiControlCharacters(name)) return null;
  const raw = input["filters"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const f = raw as Record<string, unknown>;
  if (
    typeof f["search"] !== "string" ||
    f["search"].length > MAX_QUERY ||
    !STATUSES.includes(String(f["status"])) ||
    !SORTS.includes(String(f["sort"])) ||
    typeof f["typeId"] !== "string" ||
    f["typeId"].length > 80 ||
    typeof f["accountId"] !== "string" ||
    f["accountId"].length > 80 ||
    typeof f["descending"] !== "boolean"
  )
    return null;
  return {
    name,
    filters: {
      search: f["search"],
      status: f["status"] as AssetRegisterFilters["status"],
      typeId: f["typeId"],
      accountId: f["accountId"],
      sort: f["sort"] as AssetRegisterFilters["sort"],
      descending: f["descending"],
    },
  };
}

export function parseSavedAssetFilterViews(raw: string | null): SavedAssetFilterView[] {
  if (!raw || raw.length > 50_000) return [];
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    const result: SavedAssetFilterView[] = [];
    const names = new Set<string>();
    for (const value of values) {
      const view = normalizeAssetFilterView(value);
      if (!view) continue;
      const id = view.name.toLocaleLowerCase("en-US");
      if (names.has(id)) continue;
      names.add(id);
      result.push(view);
      if (result.length >= MAX_VIEWS) break;
    }
    return result;
  } catch {
    return [];
  }
}

export function saveAssetFilterView(
  views: readonly SavedAssetFilterView[],
  name: string,
  filters: AssetRegisterFilters,
): SavedAssetFilterView[] {
  const normalized = normalizeAssetFilterView({ name, filters });
  if (!normalized) throw new Error("Enter a view name of up to 48 characters and valid filters.");
  const idx = views.findIndex(
    (view) => view.name.toLocaleLowerCase("en-US") === normalized.name.toLocaleLowerCase("en-US"),
  );
  if (idx === -1 && views.length >= MAX_VIEWS) {
    throw new Error("You can save up to 10 named Fixed Assets views on this browser.");
  }
  if (idx >= 0) {
    return views.map((view, index) => (index === idx ? normalized : view));
  }
  return [...views, normalized];
}

export function removeAssetFilterView(
  views: readonly SavedAssetFilterView[],
  name: string,
): SavedAssetFilterView[] {
  return views.filter((view) => view.name !== name);
}
