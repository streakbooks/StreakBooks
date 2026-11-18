import { createFileRoute } from "@tanstack/react-router";
import { requireRouteUuid } from "@/lib/navigation/route-params";
import { PayrollRunDetailPage } from "@/screens/payroll/run-detail";

export const Route = createFileRoute("/_authenticated/payroll/runs/$runId")({
  beforeLoad: ({ params }) => {
    requireRouteUuid(params.runId);
  },
  validateSearch: (
    raw: Record<string, unknown>,
  ): {
    tab?: string | undefined;
    returnStatus?: string | undefined;
    returnQ?: string | undefined;
    returnSort?: string | undefined;
  } => ({
    tab: raw["tab"] === "journals" || raw["tab"] === "payments" ? raw["tab"] : "employees",
    returnStatus:
      typeof raw["returnStatus"] === "string" &&
      [
        "all",
        "draft",
        "calculated",
        "reviewed",
        "approved",
        "posted",
        "paid",
        "complete",
        "void",
      ].includes(raw["returnStatus"])
        ? raw["returnStatus"]
        : "all",
    returnQ: typeof raw["returnQ"] === "string" ? raw["returnQ"].slice(0, 120) : "",
    returnSort:
      raw["returnSort"] === "payment-oldest" || raw["returnSort"] === "period-newest"
        ? raw["returnSort"]
        : "payment-newest",
  }),
  head: () => ({
    meta: [{ title: "Payroll run — LinkBooks" }],
  }),
  component: function PayrollRunDetailRoute() {
    const { runId } = Route.useParams();
    return <PayrollRunDetailPage runId={runId} />;
  },
});
