import { createFileRoute } from "@tanstack/react-router";
import { PortalBank } from "@/components/portals/supplier-pages";

export const Route = createFileRoute("/portal/app/bank")({
  component: PortalBank,
});
