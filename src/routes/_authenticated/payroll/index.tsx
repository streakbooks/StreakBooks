import { createFileRoute } from "@tanstack/react-router";
import { PayrollOverviewPage } from "@/screens/payroll/overview";

export const Route = createFileRoute("/_authenticated/payroll/")({
  head: () => ({
    meta: [
      { title: "Payroll — StreakBooks" },
      {
        name: "description",
        content: "Basic Global Payroll overview for StreakBooks organisations.",
      },
    ],
  }),
  component: PayrollOverviewPage,
});
