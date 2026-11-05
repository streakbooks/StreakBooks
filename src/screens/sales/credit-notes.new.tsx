import { getRouteApi } from "@tanstack/react-router";

import { SalesDocumentEditor } from "@/components/sales/SalesDocumentEditor";
const routeApi = getRouteApi("/_authenticated/sales/credit-notes/new");

export function NewCreditRoute() {
  const { invoiceId } = routeApi.useSearch();
  return <SalesDocumentEditor kind="credit_note" fromInvoiceId={invoiceId} />;
}

export function NewCredit() {
  return <SalesDocumentEditor kind="credit_note" />;
}
