import { createFileRoute } from "@tanstack/react-router";
import { PortalOrders } from "@/components/portals/supplier-pages";

export const Route = createFileRoute("/portal/app/orders")({
  component: PortalOrders,
});
