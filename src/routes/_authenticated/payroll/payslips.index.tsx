import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PayrollPayslipsPage } from "@/screens/payroll/payslips";

const searchSchema = z.object({
  runId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/payroll/payslips/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Payslips — LinkBooks" },
      { name: "description", content: "View issued employee payslips." },
    ],
  }),
  component: function PayrollPayslipsRoute() {
    const { runId } = Route.useSearch();
    return <PayrollPayslipsPage runIdFilter={runId ?? null} />;
  },
});
