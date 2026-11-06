import { decimalPlacesFor } from "@/lib/accounting/money";
import { normaliseMoneyInput, tryParseMinor } from "@/lib/purchases/money-input";

/** Item prices must be non-negative, exact for the company currency and JSON-safe. */
export function validCataloguePrice(raw: string, currency: string): boolean {
  const normalised = normaliseMoneyInput(raw || "0");
  const minor = tryParseMinor(raw || "0", currency);
  return (
    normalised !== null &&
    minor !== null &&
    minor >= 0n &&
    minor <= BigInt(Number.MAX_SAFE_INTEGER) &&
    (normalised.split(".")[1]?.length ?? 0) <= decimalPlacesFor(currency)
  );
}

/** Blank SKUs are allowed; non-blank SKUs follow the CSV import convention. */
export function productSkuProblem(raw: string): string | null {
  const sku = raw.trim();
  return !sku || /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(sku)
    ? null
    : "Code / SKU must start with a letter or number and contain at most 40 letters, numbers, dots, underscores or hyphens.";
}
