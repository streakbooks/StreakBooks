import { createFileRoute } from "@tanstack/react-router";
import { PayrollRunsPage } from "@/screens/payroll/runs";

export const Route = createFileRoute("/_authenticated/payroll/runs/")({
  head: () => ({
    meta: [
      { title: "Payroll runs — LinkBooks" },
      { name: "description", content: "Create and manage payroll runs." },
    ],
  }),
  component: PayrollRunsPage,
});
