import { createFileRoute } from "@tanstack/react-router";
import { PortalInvoices } from "@/components/portals/customer-pages";

export const Route = createFileRoute("/portal/app/invoices")({
  component: PortalInvoices,
});
