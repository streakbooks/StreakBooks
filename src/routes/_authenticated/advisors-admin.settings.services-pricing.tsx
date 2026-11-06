import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsServicesPricingPage } from "@/screens/advisors/settings-services-pricing";

export const Route = createFileRoute("/_authenticated/advisors-admin/settings/services-pricing")({
  head: () => ({
    meta: [
      { title: "Services & Pricing — LinkBooks Advisors" },
      {
        name: "description",
        content:
          "Draft, preview, publish and restore LinkBooks Advisors services and plan pricing.",
      },
    ],
  }),
  component: AdvisorsServicesPricingPage,
});
