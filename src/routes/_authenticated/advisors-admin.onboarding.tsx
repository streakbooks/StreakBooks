import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsAdminOnboardingPage } from "@/screens/advisors/admin-onboarding";

export const Route = createFileRoute("/_authenticated/advisors-admin/onboarding")({
  head: () => ({
    meta: [{ title: "Onboarding — LinkBooks Advisors" }],
  }),
  component: AdvisorsAdminOnboardingPage,
});
