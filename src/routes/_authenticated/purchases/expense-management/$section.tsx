import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy Purchases section URL → top-level Expense Management module. */
export const Route = createFileRoute("/_authenticated/purchases/expense-management/$section")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/expense-management/$section",
      params: { section: params.section },
    });
  },
});
