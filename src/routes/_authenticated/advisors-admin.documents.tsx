import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsAdminDocumentsPage } from "@/screens/advisors/admin-documents";

export const Route = createFileRoute("/_authenticated/advisors-admin/documents")({
  head: () => ({
    meta: [{ title: "Documents — StreakBooks Advisors" }],
  }),
  component: AdvisorsAdminDocumentsPage,
});
