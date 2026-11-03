import { usageOverage } from "@/lib/platform/price-book";

export type UsageInvoiceDraft = {
  status: "none" | "unpriced" | "draft";
  posted: false;
  providerCalled: false;
  quantity: number;
  netMinor: number | null;
};

/** Builds an overage draft. It does not post an invoice or call a payment provider. */
export function usageOverageInvoice(input: {
  usedQty: number;
  includedQty: number;
  unitAmountMinor: number | null;
}): UsageInvoiceDraft {
  const priced = usageOverage(input);
  if (priced.overageQty === 0) {
    return {
      status: "none",
      posted: false,
      providerCalled: false,
      quantity: 0,
      netMinor: 0,
    };
  }
  if (priced.netMinor == null) {
    return {
      status: "unpriced",
      posted: false,
      providerCalled: false,
      quantity: priced.overageQty,
      netMinor: null,
    };
  }
  return {
    status: "draft",
    posted: false,
    providerCalled: false,
    quantity: priced.overageQty,
    netMinor: priced.netMinor,
  };
}
