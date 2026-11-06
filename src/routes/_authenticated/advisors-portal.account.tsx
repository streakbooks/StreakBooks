import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsPortalAccountPage } from "@/screens/advisors/portal-account";

export const Route = createFileRoute("/_authenticated/advisors-portal/account")({
  head: () => ({
    meta: [{ title: "Account — Advisors portal" }],
  }),
  component: AdvisorsPortalAccountPage,
});
