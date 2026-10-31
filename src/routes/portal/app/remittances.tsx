import { createFileRoute } from "@tanstack/react-router";
import { PortalRemittances } from "@/components/portals/supplier-pages";

export const Route = createFileRoute("/portal/app/remittances")({
  component: PortalRemittances,
});
