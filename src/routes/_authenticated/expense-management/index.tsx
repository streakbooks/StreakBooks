import { createFileRoute } from "@tanstack/react-router";
import { ExpenseManagementOverviewPage } from "@/screens/expense-management/overview";

export const Route = createFileRoute("/_authenticated/expense-management/")({
  head: () => ({
    meta: [
      { title: "Expenses — LinkBooks" },
      {
        name: "description",
        content: "Expenses overview for LinkBooks organisations.",
      },
    ],
  }),
  component: ExpenseManagementOverviewPage,
});
