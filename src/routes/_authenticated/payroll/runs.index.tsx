import { createFileRoute } from "@tanstack/react-router";
import { PayrollRunsPage } from "@/screens/payroll/runs";
import { parseCreateSearchFlag } from "@/lib/navigation/create-search";

export const Route = createFileRoute("/_authenticated/payroll/runs/")({
  validateSearch: (raw: Record<string, unknown>): { create?: boolean } =>
    parseCreateSearchFlag(raw) ? { create: true } : {},
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
