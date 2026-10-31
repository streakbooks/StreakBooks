import { createFileRoute } from "@tanstack/react-router";
import { PortalCredits } from "@/components/portals/customer-pages";

export const Route = createFileRoute("/portal/app/credits")({
  component: PortalCredits,
});
