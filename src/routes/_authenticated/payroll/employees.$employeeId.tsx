import { createFileRoute } from "@tanstack/react-router";
import { PayrollEmployeeDetailPage } from "@/screens/payroll/employee-detail";

export const Route = createFileRoute("/_authenticated/payroll/employees/$employeeId")({
  head: () => ({
    meta: [
      { title: "Payroll employee — LinkBooks" },
      { name: "description", content: "Payroll employee profile, payment and salary details." },
    ],
  }),
  component: PayrollEmployeeDetailRoute,
});

function PayrollEmployeeDetailRoute() {
  const { employeeId } = Route.useParams();
  return <PayrollEmployeeDetailPage employeeId={employeeId} />;
}
