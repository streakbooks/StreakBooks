import { createFileRoute } from "@tanstack/react-router";
import { PayrollReportsPage } from "@/screens/payroll/reports";

export const Route = createFileRoute("/_authenticated/payroll/reports")({
  head: () => ({
    meta: [
      { title: "Payroll reports — LinkBooks" },
      {
        name: "description",
        content: "Payroll summary, register, liabilities and payment reports.",
      },
    ],
  }),
  component: PayrollReportsPage,
});
