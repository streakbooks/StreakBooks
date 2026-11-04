/** Validated, shared filters for the Contacts directory, counts and export. */
export const DEFAULT_CONTACT_ADVANCED_FILTERS = {
  city: "",
  region: "",
  country: "",
  currency: "",
  terms: "all",
} as const;

export type ContactAdvancedFilters = {
  city: string;
  region: string;
  country: string;
  currency: string;
  terms: "all" | "immediate" | "up_to_30" | "over_30";
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
  return {
    city: text("city"),
    region: text("region"),
    country: text("country"),
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "",
    terms: terms === "immediate" || terms === "up_to_30" || terms === "over_30" ? terms : "all",
  };
}

export function countActiveContactFilters(filters: ContactAdvancedFilters): number {
  return (
    [filters.city, filters.region, filters.country, filters.currency].filter(Boolean).length +
    (filters.terms !== "all" ? 1 : 0)
  );
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
