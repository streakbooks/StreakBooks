import { createFileRoute } from "@tanstack/react-router";
import { CrmLeadDetailPage } from "@/screens/crm/lead-detail";

export const Route = createFileRoute("/_authenticated/crm/leads/$leadId")({
  head: () => ({
    meta: [{ title: "Lead — CRM — StreakBooks" }],
  }),
  component: CrmLeadDetailRoute,
  staticData: {
    moduleId: "crm",
    pageKind: "record",
  },
});

function CrmLeadDetailRoute() {
  const { leadId } = Route.useParams();
  return <CrmLeadDetailPage leadId={leadId} />;
}
