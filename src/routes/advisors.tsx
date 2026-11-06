import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsLandingPage } from "@/screens/advisors/landing";

export const Route = createFileRoute("/advisors")({
  head: () => ({
    meta: [
      { title: "LinkBooks Advisors" },
      {
        name: "description",
        content:
          "Choose expert bookkeeping support or learn to manage your books with confidence through LinkBooks Advisors.",
      },
    ],
  }),
  component: AdvisorsLandingPage,
});
