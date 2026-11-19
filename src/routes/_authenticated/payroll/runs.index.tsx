import { createFileRoute } from "@tanstack/react-router";
import { PAYROLL_RUN_STATUSES } from "@/lib/payroll/types";
import { PayrollRunsPage } from "@/screens/payroll/runs";
import { parseCreateSearchFlag } from "@/lib/navigation/create-search";
import { normalizePayrollRunSearch } from "@/lib/payroll/run-search";

export const Route = createFileRoute("/_authenticated/payroll/runs/")({
  validateSearch: (
    raw: Record<string, unknown>,
  ): {
    status?: string | undefined;
    q?: string | undefined;
    sort?: string | undefined;
    create?: boolean | undefined;
  } => ({
    ...(parseCreateSearchFlag(raw) ? { create: true } : {}),
    status:
      typeof raw["status"] === "string" &&
      PAYROLL_RUN_STATUSES.some((status) => status === raw["status"])
        ? raw["status"]
        : "all",
    q: normalizePayrollRunSearch(raw["q"]),
    sort:
      raw["sort"] === "payment-oldest" || raw["sort"] === "period-newest"
        ? raw["sort"]
        : "payment-newest",
  }),
  head: () => ({
    meta: [
      { title: "Payroll runs — LinkBooks" },
      { name: "description", content: "Create and manage payroll runs." },
    ],
  }),
  component: PayrollRunsRoute,
});

function PayrollRunsRoute() {
  const { create } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PayrollRunsPage
      forceCreate={Boolean(create)}
      onCreateClosed={() => {
        if (!create) return;
        void navigate({
          search: (prev) => {
            const { create: _create, ...rest } = prev;
            return rest;
          },
          replace: true,
        });
      }}
    />
  );
}
