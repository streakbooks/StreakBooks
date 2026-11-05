import { createFileRoute } from "@tanstack/react-router";

import { EmployeeExpensesPage } from "@/screens/purchases/employee-expenses";

export const Route = createFileRoute("/_authenticated/purchases/employee-expenses")({
  component: EmployeeExpensesPage,
});
