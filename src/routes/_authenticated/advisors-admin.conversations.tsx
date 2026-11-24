import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsAdminConversationsPage } from "@/screens/advisors/admin-conversations";

export const Route = createFileRoute("/_authenticated/advisors-admin/conversations")({
  head: () => ({
    meta: [{ title: "Conversations — StreakBooks Advisors" }],
  }),
  component: AdvisorsAdminConversationsPage,
});
