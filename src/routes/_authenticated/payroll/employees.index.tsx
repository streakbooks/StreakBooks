import { createFileRoute } from "@tanstack/react-router";
import { PayrollEmployeesPage } from "@/screens/payroll/employees";

export const Route = createFileRoute("/_authenticated/payroll/employees/")({
  head: () => ({
    meta: [
      { title: "Payroll employees — LinkBooks" },
      {
        name: "description",
        content: "Manage payroll employees, payment details and salary assignments.",
      },
    ],
  }),
  component: PayrollEmployeesPage,
});
