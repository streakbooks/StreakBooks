import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsAdminStaffPage } from "@/screens/advisors/admin-staff";

export const Route = createFileRoute("/_authenticated/advisors-admin/staff")({
  head: () => ({
    meta: [{ title: "Advisors — LinkBooks Advisors" }],
  }),
  component: AdvisorsAdminStaffPage,
});
