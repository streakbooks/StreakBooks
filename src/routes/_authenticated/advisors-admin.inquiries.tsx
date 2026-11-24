import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsAdminInquiriesPage } from "@/screens/advisors/admin-inquiries";

export const Route = createFileRoute("/_authenticated/advisors-admin/inquiries")({
  head: () => ({
    meta: [{ title: "Inquiries — StreakBooks Advisors" }],
  }),
  component: AdvisorsAdminInquiriesPage,
});
