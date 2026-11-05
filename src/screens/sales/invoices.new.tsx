import { getRouteApi } from "@tanstack/react-router";

import { SalesDocumentEditor } from "@/components/sales/SalesDocumentEditor";
const routeApi = getRouteApi("/_authenticated/sales/invoices/new");

export function NewInvoiceRoute() {
  const { contactId } = routeApi.useSearch();
  return <SalesDocumentEditor kind="invoice" initialContactId={contactId} />;
}

/** Used by the Create-new panel, which renders the form outside a route. */
export function NewInvoice() {
  return <SalesDocumentEditor kind="invoice" />;
}
