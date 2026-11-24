import { createFileRoute } from "@tanstack/react-router";

import { RecurringInvoices } from "@/screens/sales/recurring";

export const Route = createFileRoute("/_authenticated/sales/recurring/")({
  head: () => ({ meta: [{ title: "Recurring invoices — StreakBooks" }] }),
  component: RecurringInvoices,
});
