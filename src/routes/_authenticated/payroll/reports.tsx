import { createFileRoute } from "@tanstack/react-router";
import { PAYROLL_REPORT_IDS } from "@/lib/payroll/payroll-reports";
import { PayrollReportsPage } from "@/screens/payroll/reports";

export const Route = createFileRoute("/_authenticated/payroll/reports")({
  validateSearch: (raw: Record<string, unknown>) => ({
    reportId:
      typeof raw["reportId"] === "string" && PAYROLL_REPORT_IDS.some((id) => id === raw["reportId"])
        ? (raw["reportId"] as (typeof PAYROLL_REPORT_IDS)[number])
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Payroll reports — StreakBooks" },
      {
        name: "description",
        content: "Payroll summary, register, liabilities and payment reports.",
      },
    ],
  }),
  component: PayrollReportsPage,
});
