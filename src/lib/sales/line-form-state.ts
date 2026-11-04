export type SalesLineFormState = {
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
