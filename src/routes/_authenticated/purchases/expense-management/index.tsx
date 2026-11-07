import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy Purchases URL → top-level Expense Management module. */
export const Route = createFileRoute("/_authenticated/purchases/expense-management/")({
  beforeLoad: () => {
    throw redirect({ to: "/expense-management" });
  },
});
