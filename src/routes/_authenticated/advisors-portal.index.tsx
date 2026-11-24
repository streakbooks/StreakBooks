import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsPortalHomePage } from "@/screens/advisors/portal-home";

export const Route = createFileRoute("/_authenticated/advisors-portal/")({
  head: () => ({
    meta: [{ title: "Advisors portal — StreakBooks" }],
  }),
  component: AdvisorsPortalHomePage,
});
