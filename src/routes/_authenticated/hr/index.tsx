import { createFileRoute } from "@tanstack/react-router";
import { HrOverviewPage } from "@/screens/hr/overview";

export const Route = createFileRoute("/_authenticated/hr/")({
  head: () => ({
    meta: [
      { title: "HR — StreakBooks" },
      {
        name: "description",
        content: "StreakBooks HR overview for workforce, organisation and employee lifecycle.",
      },
    ],
  }),
  component: HrOverviewPage,
  staticData: {
    moduleId: "hr",
    pageKind: "dashboard",
  },
});
