import { createFileRoute } from "@tanstack/react-router";
import { PayrollSalaryStructuresPage } from "@/screens/payroll/salary-structures";

export const Route = createFileRoute("/_authenticated/payroll/salary-structures")({
  head: () => ({
    meta: [
      { title: "Salary structures — StreakBooks" },
      { name: "description", content: "Configure reusable payroll salary structures." },
    ],
  }),
  component: PayrollSalaryStructuresPage,
});
