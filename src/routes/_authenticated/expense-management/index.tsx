import { createFileRoute } from "@tanstack/react-router";
import { ExpenseManagementOverviewPage } from "@/screens/expense-management/overview";

export const Route = createFileRoute("/_authenticated/expense-management/")({
  head: () => ({
    meta: [
      { title: "Expense Management — LinkBooks" },
      {
        name: "description",
        content: "Expense Management overview for LinkBooks organisations.",
      },
    ],
  }),
  component: ExpenseManagementOverviewPage,
});
