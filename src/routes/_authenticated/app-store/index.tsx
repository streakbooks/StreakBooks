import { createFileRoute } from "@tanstack/react-router";
import { AppStoreOverviewPage } from "@/screens/app-store/overview";

export const Route = createFileRoute("/_authenticated/app-store/")({
  head: () => ({
    meta: [
      { title: "App Store — LinkBooks" },
      {
        name: "description",
        content: "LinkBooks App Store and open integrations marketplace.",
      },
    ],
  }),
  component: AppStoreOverviewPage,
});
