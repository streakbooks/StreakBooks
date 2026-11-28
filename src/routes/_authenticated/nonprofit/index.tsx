import { createFileRoute } from "@tanstack/react-router";
import { NonprofitPage } from "@/screens/nonprofit/workspace";

export const Route = createFileRoute("/_authenticated/nonprofit/")({
  head: () => ({
    meta: [
      { title: "Nonprofit — StreakBooks" },
      {
        name: "description",
        content: "Nonprofit dashboard for funds, donations, grants and programme balances.",
      },
    ],
  }),
  component: NonprofitOverviewRoute,
  staticData: { moduleId: "nonprofit", pageKind: "dashboard" },
});

function NonprofitOverviewRoute() {
  return <NonprofitPage sectionKey="overview" />;
}
