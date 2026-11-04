/** Validated, shared filters for the Contacts directory, counts and export. */
export const DEFAULT_CONTACT_ADVANCED_FILTERS = {
  city: "",
  region: "",
  country: "",
  currency: "",
  terms: "all",
  groupId: "",
  tagId: "",
} as const;

export type ContactAdvancedFilters = {
  city: string;
  region: string;
  country: string;
  currency: string;
  terms: "all" | "immediate" | "up_to_30" | "over_30";
  groupId: string;
  tagId: string;
};

export function normalizeContactAdvancedFilters(value: unknown): ContactAdvancedFilters {
  const source =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const text = (key: "city" | "region" | "country") =>
    typeof source[key] === "string" ? source[key].trim().slice(0, 80) : "";
  const currency =
    typeof source["currency"] === "string" ? source["currency"].trim().toUpperCase() : "";
  const terms = source["terms"];
  const validLabelId = (key: "groupId" | "tagId") => {
    const candidate = source[key];
    return typeof candidate === "string" &&
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(candidate)
      ? candidate.toLowerCase()
      : "";
  };
  return {
    city: text("city"),
    region: text("region"),
    country: text("country"),
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "",
    terms: terms === "immediate" || terms === "up_to_30" || terms === "over_30" ? terms : "all",
    groupId: validLabelId("groupId"),
    tagId: validLabelId("tagId"),
  };
}

export function countActiveContactFilters(filters: ContactAdvancedFilters): number {
  return (
    [filters.city, filters.region, filters.country, filters.currency].filter(Boolean).length +
    (filters.terms !== "all" ? 1 : 0) +
    (filters.groupId ? 1 : 0) +
    (filters.tagId ? 1 : 0)
  );
}

/**
 * Request scoped, inner-joined membership rows only when filtering by labels.
 * The embedded relation names are compile-time constants, never user input.
 * This must be shared by list, count and CSV export to avoid mismatched results.
 */
export function contactDirectoryMembershipSelect(
  columns: string,
  filters: Pick<ContactAdvancedFilters, "groupId" | "tagId">,
): string {
  const projections = [columns];
  if (filters.groupId) projections.push("contact_group_members!inner(group_id)");
  if (filters.tagId) projections.push("contact_tag_assignments!inner(tag_id)");
  return projections.join(",");
}

export type ContactSavedView = {
  id: string;
  name: string;
  view: string;
  query: string;
  sort: string;
  filters: ContactAdvancedFilters;
};

const VALID_VIEWS = [
  "all",
  "customers",
  "suppliers",
  "both",
  "recent",
  "updated",
  "inactive",
  "archived",
];

export function normalizeContactSavedViews(value: unknown): ContactSavedView[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  const saved: ContactSavedView[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj["id"] !== "string" || !/^[\w-]{1,80}$/.test(obj["id"])) continue;
    if (typeof obj["name"] !== "string" || !obj["name"].trim()) continue;
    const name = obj["name"].trim().slice(0, 60);
    if (unique.has(name.toLowerCase())) continue;
    unique.add(name.toLowerCase());
    saved.push({
      id: obj["id"],
      name,
      view: VALID_VIEWS.includes(String(obj["view"])) ? String(obj["view"]) : "all",
      query: typeof obj["query"] === "string" ? obj["query"].slice(0, 100) : "",
      sort: typeof obj["sort"] === "string" ? obj["sort"].slice(0, 40) : "default",
      filters: normalizeContactAdvancedFilters(obj["filters"]),
    });
    if (saved.length === 20) break;
  }
  return saved;
}
