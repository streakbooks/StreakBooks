import { createFileRoute } from "@tanstack/react-router";

import { NewRecurringInvoice } from "@/screens/sales/recurring";

export const Route = createFileRoute("/_authenticated/sales/recurring/new")({
  head: () => ({ meta: [{ title: "New recurring invoice — LinkBooks" }] }),
  component: NewRecurringInvoice,
});
