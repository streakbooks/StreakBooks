import { createFileRoute } from "@tanstack/react-router";

import { NewInvoiceRoute } from "@/screens/sales/invoices.new";

export const Route = createFileRoute("/_authenticated/sales/invoices/new")({
  head: () => ({ meta: [{ title: "New invoice — LinkBooks" }] }),
  validateSearch: (s: Record<string, unknown>): { contactId?: string } =>
    typeof s["contactId"] === "string" ? { contactId: s["contactId"] } : {},
  component: NewInvoiceRoute,
});
