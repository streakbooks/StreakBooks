import { createFileRoute } from "@tanstack/react-router";
import { PAYROLL_RUN_STATUSES } from "@/lib/payroll/types";
import { PayrollRunsPage } from "@/screens/payroll/runs";

export const Route = createFileRoute("/_authenticated/payroll/runs/")({
  validateSearch: (raw: Record<string, unknown>) => ({
    status: typeof raw.status === "string" && PAYROLL_RUN_STATUSES.some((status) => status === raw.status)
      ? raw.status
      : "all",
    q: typeof raw.q === "string" && raw.q.length <= 120 ? raw.q : "",
    sort: raw.sort === "payment-oldest" || raw.sort === "period-newest"
      ? raw.sort
      : "payment-newest",
  }),
  head: () => ({
    meta: [
      { title: "Payroll runs — LinkBooks" },
      { name: "description", content: "Create and manage payroll runs." },
    ],
  }),
  component: PayrollRunsPage,
});
