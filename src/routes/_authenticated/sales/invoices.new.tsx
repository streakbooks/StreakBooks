import { createFileRoute } from "@tanstack/react-router";

import { NewInvoiceRoute } from "@/screens/sales/invoices.new";

export const Route = createFileRoute("/_authenticated/sales/invoices/new")({
  head: () => ({ meta: [{ title: "New invoice — StreakBooks" }] }),
  validateSearch: (s: Record<string, unknown>): { contactId?: string; returnContext?: string } => ({
    ...(typeof s["contactId"] === "string" ? { contactId: s["contactId"] } : {}),
    ...(typeof s["returnContext"] === "string" && s["returnContext"].length <= 2048
      ? { returnContext: s["returnContext"] }
      : {}),
  }),
  component: NewInvoiceRoute,
});
