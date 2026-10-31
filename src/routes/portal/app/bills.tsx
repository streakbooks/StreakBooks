import { createFileRoute } from "@tanstack/react-router";
import { PortalBills } from "@/components/portals/supplier-pages";

export const Route = createFileRoute("/portal/app/bills")({
  component: PortalBills,
});
