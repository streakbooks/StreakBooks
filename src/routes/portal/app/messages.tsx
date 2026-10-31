import { createFileRoute } from "@tanstack/react-router";
import { PortalMessages } from "@/components/portals/customer-pages";

export const Route = createFileRoute("/portal/app/messages")({
  component: PortalMessages,
});
