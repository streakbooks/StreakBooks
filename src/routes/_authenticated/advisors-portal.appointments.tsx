import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsPortalAppointmentsPage } from "@/screens/advisors/portal-appointments";

export const Route = createFileRoute("/_authenticated/advisors-portal/appointments")({
  head: () => ({
    meta: [{ title: "Appointments — Advisors portal" }],
  }),
  component: AdvisorsPortalAppointmentsPage,
});
