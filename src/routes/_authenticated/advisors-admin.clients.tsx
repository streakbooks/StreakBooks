import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsAdminClientsPage } from "@/screens/advisors/admin-clients";

export const Route = createFileRoute("/_authenticated/advisors-admin/clients")({
  head: () => ({
    meta: [{ title: "Clients — LinkBooks Advisors" }],
  }),
  component: AdvisorsAdminClientsPage,
});
