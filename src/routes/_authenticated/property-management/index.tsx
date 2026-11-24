import { createFileRoute } from "@tanstack/react-router";
import { PmOverviewPage } from "@/screens/property-management/overview";

export const Route = createFileRoute("/_authenticated/property-management/")({
  head: () => ({
    meta: [
      { title: "Property Management — StreakBooks" },
      {
        name: "description",
        content:
          "StreakBooks Property Management overview for portfolios, owners and settlement readiness.",
      },
    ],
  }),
  component: PmOverviewPage,
  staticData: {
    moduleId: "property-management",
    pageKind: "dashboard",
  },
});
