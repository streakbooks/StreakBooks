import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsAdminOverviewPage } from "@/screens/advisors/admin-overview";

export const Route = createFileRoute("/_authenticated/advisors-admin/")({
  head: () => ({
    meta: [{ title: "Advisors overview — LinkBooks" }],
  }),
  component: AdvisorsAdminOverviewPage,
});
