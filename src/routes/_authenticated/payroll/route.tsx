import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/payroll")({
  component: PayrollLayout,
});

function PayrollLayout() {
  return <Outlet />;
}
