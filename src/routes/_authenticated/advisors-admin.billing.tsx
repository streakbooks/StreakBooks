import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsAdminBillingPage } from "@/screens/advisors/admin-billing";

export const Route = createFileRoute("/_authenticated/advisors-admin/billing")({
  head: () => ({
    meta: [{ title: "Billing — StreakBooks Advisors" }],
  }),
  component: AdvisorsAdminBillingPage,
});
