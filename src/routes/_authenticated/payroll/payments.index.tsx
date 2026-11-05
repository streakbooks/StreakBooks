import { createFileRoute } from "@tanstack/react-router";
import { PayrollPaymentsPage } from "@/screens/payroll/payments";

export const Route = createFileRoute("/_authenticated/payroll/payments/")({
  head: () => ({ meta: [{ title: "Payroll payments — LinkBooks" }] }),
  component: PayrollPaymentsPage,
});
