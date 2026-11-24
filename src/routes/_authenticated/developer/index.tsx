import { createFileRoute } from "@tanstack/react-router";
import { DeveloperDashboardPage } from "@/screens/developer/dashboard";

export const Route = createFileRoute("/_authenticated/developer/")({
  head: () => ({
    meta: [
      { title: "Developer — StreakBooks" },
      {
        name: "description",
        content: "StreakBooks public API and developer portal.",
      },
    ],
  }),
  component: DeveloperDashboardPage,
});
