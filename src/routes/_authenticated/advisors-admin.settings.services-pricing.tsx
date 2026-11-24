import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsServicesPricingPage } from "@/screens/advisors/settings-services-pricing";

export const Route = createFileRoute("/_authenticated/advisors-admin/settings/services-pricing")({
  head: () => ({
    meta: [
      { title: "Services & Pricing — StreakBooks Advisors" },
      {
        name: "description",
        content:
          "Draft, preview, publish and restore StreakBooks Advisors services and plan pricing.",
      },
    ],
  }),
  component: AdvisorsServicesPricingPage,
});
