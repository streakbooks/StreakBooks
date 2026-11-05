import { createFileRoute } from "@tanstack/react-router";

import { NewCreditRoute } from "@/screens/sales/credit-notes.new";

export const Route = createFileRoute("/_authenticated/sales/credit-notes/new")({
  head: () => ({ meta: [{ title: "New credit note — LinkBooks" }] }),
  validateSearch: (s: Record<string, unknown>): { invoiceId?: string } =>
    typeof s["invoiceId"] === "string" ? { invoiceId: s["invoiceId"] } : {},
  component: NewCreditRoute,
});
