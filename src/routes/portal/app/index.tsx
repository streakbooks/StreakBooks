import { createFileRoute } from "@tanstack/react-router";
import { PortalHome } from "@/components/portals/customer-pages";

export const Route = createFileRoute("/portal/app/")({
  component: PortalHome,
});
