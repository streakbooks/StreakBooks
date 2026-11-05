import { createFileRoute } from "@tanstack/react-router";

import { NewExpense } from "@/screens/purchases/expenses.new";

export const Route = createFileRoute("/_authenticated/purchases/expenses/new")({
  head: () => ({ meta: [{ title: "New expense — LinkBooks" }] }),
  component: NewExpense,
});
