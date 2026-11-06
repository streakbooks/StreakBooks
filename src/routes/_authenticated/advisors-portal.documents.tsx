import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsPortalDocumentsPage } from "@/screens/advisors/portal-documents";

export const Route = createFileRoute("/_authenticated/advisors-portal/documents")({
  head: () => ({
    meta: [{ title: "Documents — Advisors portal" }],
  }),
  component: AdvisorsPortalDocumentsPage,
});
