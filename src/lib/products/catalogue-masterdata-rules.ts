/** Pure validation for category names, price lists and exact catalogue prices. */
export function validateCatalogueName(raw: string): string {
  const name = (raw ?? "").trim();
  if (!name || name.length > 100) throw new Error("Name must contain 1–100 characters");
  return name;
}

export function validateCatalogueDescription(raw?: string): string {
  const description = (raw ?? "").trim();
  if (description.length > 500) throw new Error("Description must contain at most 500 characters");
  return description;
}

export function validateCataloguePriceMinor(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Price must be a non-negative safe amount in minor currency units");
  }
  return value;
}

export function assertMatchingCatalogueCurrency(
  listCurrency: string,
  companyCurrency: string,
): void {
  if (listCurrency !== companyCurrency) {
    throw new Error("This price list uses a different currency from the organisation");
  }
}
