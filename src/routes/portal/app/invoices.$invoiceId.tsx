import { createFileRoute } from "@tanstack/react-router";
import { PortalInvoiceDetail } from "@/components/portals/customer-pages";

export const Route = createFileRoute("/portal/app/invoices/$invoiceId")({
  component: function InvoiceRoute() {
    const { invoiceId } = Route.useParams();
    return <PortalInvoiceDetail invoiceId={invoiceId} />;
  },
});
