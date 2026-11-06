import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsAdminWorkspacesPage } from "@/screens/advisors/admin-workspaces";

export const Route = createFileRoute("/_authenticated/advisors-admin/workspaces")({
  head: () => ({
    meta: [{ title: "Workspaces — LinkBooks Advisors" }],
  }),
  component: AdvisorsAdminWorkspacesPage,
});
