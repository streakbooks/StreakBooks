import { createFileRoute } from "@tanstack/react-router";

import { NewReceiptRoute } from "@/screens/sales/receipts.new";

export const Route = createFileRoute("/_authenticated/sales/receipts/new")({
  head: () => ({ meta: [{ title: "Record receipt — StreakBooks" }] }),
  validateSearch: (s: Record<string, unknown>): { contactId?: string; invoiceId?: string } => ({
    ...(typeof s["contactId"] === "string" ? { contactId: s["contactId"] } : {}),
    ...(typeof s["invoiceId"] === "string" ? { invoiceId: s["invoiceId"] } : {}),
  }),
  component: NewReceiptRoute,
});
