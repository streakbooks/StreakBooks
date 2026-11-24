import { createFileRoute } from "@tanstack/react-router";
import { requireRouteUuid } from "@/lib/navigation/route-params";
import { PayrollPayslipDetailPage } from "@/screens/payroll/payslip-detail";

export const Route = createFileRoute("/_authenticated/payroll/payslips/$payslipId")({
  beforeLoad: ({ params }) => {
    requireRouteUuid(params.payslipId);
  },
  head: () => ({
    meta: [{ title: "Payslip — StreakBooks" }],
  }),
  component: function PayrollPayslipDetailRoute() {
    const { payslipId } = Route.useParams();
    return <PayrollPayslipDetailPage payslipId={payslipId} />;
  },
});
