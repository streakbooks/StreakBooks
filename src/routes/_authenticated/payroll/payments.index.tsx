import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PayrollPaymentsPage } from "@/screens/payroll/payments";

const searchSchema = z.object({
  runId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/payroll/payments/")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Payroll payments — StreakBooks" }] }),
  component: function PayrollPaymentsRoute() {
    const { runId } = Route.useSearch();
    return <PayrollPaymentsPage runIdFilter={runId ?? null} />;
  },
});
