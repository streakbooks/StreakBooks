import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsLandingPage } from "@/screens/advisors/landing";
import { AdvisorPublicLayout } from "@/components/advisors/AdvisorPublicLayout";

export const Route = createFileRoute("/advisors")({
  head: () => ({
    meta: [
      { title: "StreakBooks Advisors" },
      {
        name: "description",
        content:
          "Choose expert bookkeeping support or learn to manage your books with confidence through StreakBooks Advisors.",
      },
    ],
  }),
  component: () => (
    <AdvisorPublicLayout>
      <AdvisorsLandingPage />
    </AdvisorPublicLayout>
  ),
});
