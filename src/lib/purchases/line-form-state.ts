export type PurchaseLineFormState = {
  productId: string;
  description: string;
  accountId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxRateBps: string;
  taxCodeId: string;
  classOptionId: string;
  locationOptionId: string;
  projectOptionId: string;
  customerContactId: string;
  isBillable: boolean;
};

export const emptyPurchaseLine = (): PurchaseLineFormState => ({
  productId: "",
  description: "",
  accountId: "",
  quantity: "1",
  unitPrice: "0.00",
  discount: "0",
  taxRateBps: "0",
  taxCodeId: "",
  classOptionId: "",
  locationOptionId: "",
  projectOptionId: "",
  customerContactId: "",
  isBillable: false,
});
