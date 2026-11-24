import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsAdminEngagementsPage } from "@/screens/advisors/admin-engagements";

export const Route = createFileRoute("/_authenticated/advisors-admin/engagements")({
  head: () => ({
    meta: [{ title: "Engagements — StreakBooks Advisors" }],
  }),
  component: AdvisorsAdminEngagementsPage,
});
