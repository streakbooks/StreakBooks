/** Pure input checks shared with the authenticated bulk-price endpoint. */
export type BulkPriceField = "sales_price_minor" | "purchase_cost_minor";

export function normaliseBulkPriceChange(input: {
  productIds: string[];
  field: BulkPriceField;
  valueMinor: number;
}) {
  if (
    !Array.isArray(input.productIds) ||
    input.productIds.length < 1 ||
    input.productIds.length > 100
  ) {
    throw new Error("Select between 1 and 100 catalogue items");
  }
  if (input.productIds.some((id) => typeof id !== "string" || !id.trim())) {
    throw new Error("Invalid item selection");
  }
  if (!["sales_price_minor", "purchase_cost_minor"].includes(input.field)) {
    throw new Error("Invalid price field");
  }
  if (!Number.isSafeInteger(input.valueMinor) || input.valueMinor < 0) {
    throw new Error("Price must be a non-negative safe integer in minor units");
  }
  return {
    field: input.field,
    valueMinor: input.valueMinor,
    productIds: [...new Set(input.productIds)],
  };
}
