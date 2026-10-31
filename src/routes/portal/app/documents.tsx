import { createFileRoute } from "@tanstack/react-router";
import { PortalDocuments } from "@/components/portals/customer-pages";

export const Route = createFileRoute("/portal/app/documents")({
  component: PortalDocuments,
});
