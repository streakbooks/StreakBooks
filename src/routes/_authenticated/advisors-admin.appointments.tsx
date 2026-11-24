import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsAdminAppointmentsPage } from "@/screens/advisors/admin-appointments";

export const Route = createFileRoute("/_authenticated/advisors-admin/appointments")({
  head: () => ({
    meta: [{ title: "Appointments — StreakBooks Advisors" }],
  }),
  component: AdvisorsAdminAppointmentsPage,
});
