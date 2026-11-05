import { createFileRoute } from "@tanstack/react-router";
import { PayrollPayslipDetailPage } from "@/screens/payroll/payslip-detail";

export const Route = createFileRoute("/_authenticated/payroll/payslips/$payslipId")({
  head: () => ({
    meta: [{ title: "Payslip — LinkBooks" }],
  }),
  component: function PayrollPayslipDetailRoute() {
    const { payslipId } = Route.useParams();
    return <PayrollPayslipDetailPage payslipId={payslipId} />;
  },
});
