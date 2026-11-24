import { createFileRoute } from "@tanstack/react-router";
import { AppStoreOverviewPage } from "@/screens/app-store/overview";

export const Route = createFileRoute("/_authenticated/app-store/")({
  head: () => ({
    meta: [
      { title: "App Store — StreakBooks" },
      {
        name: "description",
        content: "StreakBooks App Store and open integrations marketplace.",
      },
    ],
  }),
  component: AppStoreOverviewPage,
});
