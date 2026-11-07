import { createFileRoute } from "@tanstack/react-router";
import { DeveloperDashboardPage } from "@/screens/developer/dashboard";

export const Route = createFileRoute("/_authenticated/developer/")({
  head: () => ({
    meta: [
      { title: "Developer — LinkBooks" },
      {
        name: "description",
        content: "LinkBooks public API and developer portal.",
      },
    ],
  }),
  component: DeveloperDashboardPage,
});
