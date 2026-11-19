import { createFileRoute } from "@tanstack/react-router";
import { PayrollEmployeesPage } from "@/screens/payroll/employees";
import { parseCreateSearchFlag } from "@/lib/navigation/create-search";

export const Route = createFileRoute("/_authenticated/payroll/employees/")({
  validateSearch: (raw: Record<string, unknown>): { create?: boolean } =>
    parseCreateSearchFlag(raw) ? { create: true } : {},
  head: () => ({
    meta: [
      { title: "Payroll employees — LinkBooks" },
      {
        name: "description",
        content: "Manage payroll employees, payment details and salary assignments.",
      },
    ],
  }),
  component: PayrollEmployeesRoute,
});

function PayrollEmployeesRoute() {
  const { create } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PayrollEmployeesPage
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
