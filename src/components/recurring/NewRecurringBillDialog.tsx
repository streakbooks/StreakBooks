"use client";

/**
 * @deprecated Batch 46 — recurring bills open at `/purchases/recurring/new` (full-page
 * NewBill mode=template). This Sheet wrapper is retained only so stale imports fail loudly
 * in review rather than silently regressing to a half-screen create experience.
 */
export function NewRecurringBillDialog(_props: {
  companyId: string;
  currencyCode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (recurringBillId: string) => void;
}): null {
  throw new Error(
    "NewRecurringBillDialog was removed. Navigate to /purchases/recurring/new instead.",
  );
}
