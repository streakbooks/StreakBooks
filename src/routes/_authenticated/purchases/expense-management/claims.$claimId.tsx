import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy Purchases claim URL → top-level Expense Management module. */
export const Route = createFileRoute(
  "/_authenticated/purchases/expense-management/claims/$claimId",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/expense-management/claims/$claimId",
      params: { claimId: params.claimId },
    });
  },
});
