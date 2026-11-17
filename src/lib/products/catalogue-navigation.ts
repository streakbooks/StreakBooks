/** URL-addressable Products & Services workspaces and catalogue browsing state. */
export const PRODUCT_SECTIONS = ["catalogue", "categories", "price-lists"] as const;
export type ProductSection = (typeof PRODUCT_SECTIONS)[number];

export type CatalogueSearch = {
  section: ProductSection;
  q?: string;
  kind?: "all" | "service" | "product" | "non_inventory";
  category?: string;
  status?: "active" | "archived" | "all";
  sort?: "name" | "name_desc" | "code" | "price_asc" | "price_desc" | "recent";
  page?: number;
  pageSize?: 25 | 50 | 100;
};

const KINDS = new Set(["all", "service", "product", "non_inventory"]);
const STATUSES = new Set(["active", "archived", "all"]);
const SORTS = new Set(["name", "name_desc", "code", "price_asc", "price_desc", "recent"]);
const PAGE_SIZES = new Set([25, 50, 100]);

/** Malformed, unrelated and unsafe section values revert to the Catalogue. */
export function parseProductSection(value: unknown): ProductSection {
  if (typeof value !== "string") return "catalogue";
  return (PRODUCT_SECTIONS as readonly string[]).includes(value)
    ? (value as ProductSection)
    : "catalogue";
}

/** Only catalogue filters, never redirects or arbitrary user-supplied URLs, survive navigation. */
export function parseCatalogueSearch(raw: Record<string, unknown>): CatalogueSearch {
  const out: CatalogueSearch = { section: parseProductSection(raw["section"]) };
  const q = raw["q"];
  if (typeof q === "string" && q.length > 0 && q.length <= 100) out.q = q;

  const kind = raw["kind"];
  if (typeof kind === "string" && KINDS.has(kind))
    out.kind = kind as "all" | "service" | "product" | "non_inventory";

  const category = raw["category"];
  if (typeof category === "string" && category.length <= 80 &&
      (category === "all" || /^[a-zA-Z0-9_-]+$/.test(category)))
    out.category = category;

  const status = raw["status"];
  if (typeof status === "string" && STATUSES.has(status))
    out.status = status as "active" | "archived" | "all";

  const sort = raw["sort"];
  if (typeof sort === "string" && SORTS.has(sort))
    out.sort = sort as "name" | "name_desc" | "code" | "price_asc" | "price_desc" | "recent";

  const page = raw["page"];
  if (typeof page === "number" && Number.isSafeInteger(page) && page >= 1)
    out.page = Math.min(page, 1_000_000);
  else if (typeof page === "string" && /^\d{1,7}$/.test(page) && Number(page) >= 1)
    out.page = Math.min(Number(page), 1_000_000);

  const pageSize = raw["pageSize"];
  if ((typeof pageSize === "string" || typeof pageSize === "number") &&
      PAGE_SIZES.has(Number(pageSize)))
    out.pageSize = Number(pageSize) as 25 | 50 | 100;

  return out;
}
