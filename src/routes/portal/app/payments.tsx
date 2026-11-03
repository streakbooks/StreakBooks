import { createFileRoute } from "@tanstack/react-router";
import { PortalPayments } from "@/components/portals/customer-pages";

export const Route = createFileRoute("/portal/app/payments")({
  component: PortalPayments,
});
