import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout route: the detail page lives in the index route so child routes (edit) can render.
export const Route = createFileRoute("/_authenticated/sales/invoices/$invoiceId")({
  validateSearch: (raw: Record<string, unknown>) => {
    const context = raw["returnContext"];
    return typeof context === "string" && context.length <= 2048 ? { returnContext: context } : {};
  },
  component: () => <Outlet />,
});
