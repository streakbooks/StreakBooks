import { createFileRoute } from "@tanstack/react-router";
import { PayrollSettingsPage } from "@/screens/payroll/settings";

export const Route = createFileRoute("/_authenticated/payroll/settings")({
  head: () => ({
    meta: [
      { title: "Payroll settings — StreakBooks" },
      {
        name: "description",
        content: "Configure Basic Global Payroll settings, schedules and components.",
      },
    ],
  }),
  component: PayrollSettingsPage,
});
