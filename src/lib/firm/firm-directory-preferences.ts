import type { FirmClientStatus } from "./client-profiles.functions";
import {
  DEFAULT_FIRM_CLIENT_COLUMNS,
  STATUS_LABELS,
  normalizeFirmClientColumns,
  type FirmClientColumn,
  type FirmClientReviewFilter,
  type FirmClientSort,
} from "./client-portfolio";

export const FIRM_DIRECTORY_PREFERENCE_KEYS = {
  columns: "firm.directory.columns.v1",
  views: "firm.directory.views.v1",
} as const;

export type FirmDirectoryPreferenceKind = keyof typeof FIRM_DIRECTORY_PREFERENCE_KEYS;
export type FirmSavedView = {
  id: string;
  name: string;
  query: string;
  status: FirmClientStatus | "all";
  review: FirmClientReviewFilter;
  sort: FirmClientSort;
};
export type FirmDirectoryPreferences = {
  columns: FirmClientColumn[] | null;
  views: FirmSavedView[] | null;
};

const REVIEW_FILTERS: FirmClientReviewFilter[] = ["all", "due", "upcoming", "unscheduled"];
const SORTS: FirmClientSort[] = ["name", "name_desc", "review", "review_desc", "status", "service"];

export function normalizeFirmSavedViews(value: unknown): FirmSavedView[] {
  if (!Array.isArray(value)) return [];
  const names = new Set<string>();
  const ids = new Set<string>();
  const result: FirmSavedView[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    if (typeof item["id"] !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(item["id"])) continue;
    if (typeof item["name"] !== "string" || !item["name"].trim()) continue;
    const name = item["name"].trim().slice(0, 60);
    const normalizedName = name.toLocaleLowerCase();
    if (ids.has(item["id"]) || names.has(normalizedName)) continue;
    ids.add(item["id"]);
    names.add(normalizedName);
    result.push({
      id: item["id"],
      name,
      query: typeof item["query"] === "string" ? item["query"].trim().slice(0, 100) : "",
      status:
        item["status"] === "all" ||
        (typeof item["status"] === "string" &&
          Object.prototype.hasOwnProperty.call(STATUS_LABELS, item["status"]))
          ? (item["status"] as FirmSavedView["status"])
          : "all",
      review: REVIEW_FILTERS.some((review) => review === item["review"])
        ? (item["review"] as FirmClientReviewFilter)
        : "all",
      sort: SORTS.some((sort) => sort === item["sort"]) ? (item["sort"] as FirmClientSort) : "name",
    });
    if (result.length >= 20) break;
  }
  return result;
}

export function normalizeFirmDirectoryPreference(
  kind: FirmDirectoryPreferenceKind,
  value: unknown,
): FirmClientColumn[] | FirmSavedView[] {
  if (kind === "columns") return normalizeFirmClientColumns(value);
  return normalizeFirmSavedViews(value);
}

export function readFirmDirectoryPreferences(
  rows: { preference_key: string; preference_value: unknown }[],
): FirmDirectoryPreferences {
  const columns = rows.find((row) => row.preference_key === FIRM_DIRECTORY_PREFERENCE_KEYS.columns);
  const views = rows.find((row) => row.preference_key === FIRM_DIRECTORY_PREFERENCE_KEYS.views);
  return {
    columns: columns ? normalizeFirmClientColumns(columns.preference_value) : null,
    views: views ? normalizeFirmSavedViews(views.preference_value) : null,
  };
}

export function replaceFirmSavedView(views: FirmSavedView[], view: FirmSavedView): FirmSavedView[] {
  const current = normalizeFirmSavedViews(views);
  const normalized = normalizeFirmSavedViews([view])[0];
  if (!normalized) return current;
  const sameName = current.find(
    (item) => item["name"].toLocaleLowerCase() === normalized.name.toLocaleLowerCase(),
  );
  if (sameName) {
    return normalizeFirmSavedViews(
      current.map((item) =>
        item["id"] === sameName.id ? { ...normalized, id: sameName.id } : item,
      ),
    );
  }
  if (current.length >= 20) return current;
  return normalizeFirmSavedViews([...current, normalized]);
}

export const INITIAL_FIRM_DIRECTORY_PREFERENCES: FirmDirectoryPreferences = {
  columns: [...DEFAULT_FIRM_CLIENT_COLUMNS],
  views: [],
};
