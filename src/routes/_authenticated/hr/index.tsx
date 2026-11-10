import { createFileRoute } from "@tanstack/react-router";
import { HrOverviewPage } from "@/screens/hr/overview";

export const Route = createFileRoute("/_authenticated/hr/")({
  head: () => ({
    meta: [
      { title: "HR — LinkBooks" },
      {
        name: "description",
        content: "LinkBooks HR overview for workforce, organisation and employee lifecycle.",
      },
    ],
  }),
  component: HrOverviewPage,
  staticData: {
    moduleId: "hr",
    pageKind: "dashboard",
  },
});
