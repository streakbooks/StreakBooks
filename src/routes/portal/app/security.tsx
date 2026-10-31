import { createFileRoute } from "@tanstack/react-router";
import { PortalSecurity } from "@/components/portals/customer-pages";

export const Route = createFileRoute("/portal/app/security")({
  component: PortalSecurity,
});
