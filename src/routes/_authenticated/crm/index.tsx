import { createFileRoute } from "@tanstack/react-router";
import { CrmOverviewPage } from "@/screens/crm/overview";

export const Route = createFileRoute("/_authenticated/crm/")({
  head: () => ({
    meta: [
      { title: "CRM — LinkBooks" },
      {
        name: "description",
        content: "LinkBooks CRM overview for leads, pipelines and relationships.",
      },
    ],
  }),
  component: CrmOverviewPage,
  staticData: {
    moduleId: "crm",
    pageKind: "dashboard",
  },
});
