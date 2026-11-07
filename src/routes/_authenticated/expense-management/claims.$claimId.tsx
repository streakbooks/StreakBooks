import { createFileRoute } from "@tanstack/react-router";
import { ExpenseManagementClaimDetailPage } from "@/screens/expense-management/claim-detail";

export const Route = createFileRoute("/_authenticated/expense-management/claims/$claimId")({
  head: () => ({
    meta: [{ title: "Expense claim — LinkBooks" }],
  }),
  component: ExpenseManagementClaimDetailRoute,
});

function ExpenseManagementClaimDetailRoute() {
  const { claimId } = Route.useParams();
  return <ExpenseManagementClaimDetailPage claimId={claimId} />;
}
