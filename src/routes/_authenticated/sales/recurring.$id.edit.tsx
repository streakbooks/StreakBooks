import { createFileRoute } from "@tanstack/react-router";

import { EditRecurringInvoice } from "@/screens/sales/recurring";

export const Route = createFileRoute("/_authenticated/sales/recurring/$id/edit")({
  head: () => ({ meta: [{ title: "Edit recurring invoice — LinkBooks" }] }),
  component: EditRecurringInvoiceRoute,
});

function EditRecurringInvoiceRoute() {
  const { id } = Route.useParams();
  return <EditRecurringInvoice recurringId={id} />;
}
