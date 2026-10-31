import { createFileRoute } from "@tanstack/react-router";
import { PortalStatement } from "@/components/portals/customer-pages";

export const Route = createFileRoute("/portal/app/statement")({
  component: PortalStatement,
});
