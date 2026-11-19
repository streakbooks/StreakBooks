import type { PriceListLineSnapshot } from "@/lib/products/price-list-provenance";

export type SalesLineFormState = {
  pricingTrace?: PriceListLineSnapshot | null;
  productId: string;
  description: string;
  accountId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxRateBps: string;
  /** tax_codes.id; when set the server derives the rate from the code. */
  taxCodeId: string;
};

export const emptySalesLine = (): SalesLineFormState => ({
  productId: "",
  description: "",
  accountId: "",
  quantity: "1",
  unitPrice: "0.00",
  discount: "0",
  taxRateBps: "0",
  taxCodeId: "",
});

/** Untouched grid rows do not belong in the saved document. */
export function isBlankSalesLine(line: SalesLineFormState): boolean {
  return (
    !line.description.trim() &&
    !line.productId &&
    !line.accountId &&
    !line.taxCodeId &&
    !line.pricingTrace &&
    Number(line.quantity) === 1 &&
    Number(line.unitPrice) === 0 &&
    Number(line.discount) === 0 &&
    Number(line.taxRateBps) === 0
  );
}
