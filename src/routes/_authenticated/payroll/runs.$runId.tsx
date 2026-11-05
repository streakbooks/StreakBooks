import { createFileRoute } from "@tanstack/react-router";
import { PayrollRunDetailPage } from "@/screens/payroll/run-detail";

export const Route = createFileRoute("/_authenticated/payroll/runs/$runId")({
  head: () => ({
    meta: [{ title: "Payroll run — LinkBooks" }],
  }),
  component: function PayrollRunDetailRoute() {
    const { runId } = Route.useParams();
    return <PayrollRunDetailPage runId={runId} />;
  },
});
