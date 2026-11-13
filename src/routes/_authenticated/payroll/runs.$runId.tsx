import { createFileRoute } from "@tanstack/react-router";
import { requireRouteUuid } from "@/lib/navigation/route-params";
import { PayrollRunDetailPage } from "@/screens/payroll/run-detail";

export const Route = createFileRoute("/_authenticated/payroll/runs/$runId")({
  beforeLoad: ({ params }) => {
    requireRouteUuid(params.runId);
  },
  validateSearch: (raw: Record<string, unknown>) => ({
    tab: raw.tab === "journals" || raw.tab === "payments" ? raw.tab : "employees",
  }),
  head: () => ({
    meta: [{ title: "Payroll run — LinkBooks" }],
  }),
  component: function PayrollRunDetailRoute() {
    const { runId } = Route.useParams();
    return <PayrollRunDetailPage runId={runId} />;
  },
});
