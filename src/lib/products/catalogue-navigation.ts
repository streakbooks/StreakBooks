/** URL-addressable Products & Services sections. */
export const PRODUCT_SECTIONS = ["catalogue", "categories", "price-lists"] as const;
export type ProductSection = (typeof PRODUCT_SECTIONS)[number];

/** Malformed, unrelated and unsafe section values revert to the Catalogue. */
export function parseProductSection(value: unknown): ProductSection {
  if (typeof value !== "string") return "catalogue";
  return (PRODUCT_SECTIONS as readonly string[]).includes(value)
    ? (value as ProductSection)
    : "catalogue";
}
