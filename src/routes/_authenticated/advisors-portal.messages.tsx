import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsPortalMessagesPage } from "@/screens/advisors/portal-messages";

export const Route = createFileRoute("/_authenticated/advisors-portal/messages")({
  head: () => ({
    meta: [{ title: "Messages — Advisors portal" }],
  }),
  component: AdvisorsPortalMessagesPage,
});
