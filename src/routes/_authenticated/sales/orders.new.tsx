import { createFileRoute } from "@tanstack/react-router";

import { NewSalesOrder } from "@/screens/sales/orders.new";

export const Route = createFileRoute("/_authenticated/sales/orders/new")({
  head: () => ({ meta: [{ title: "New sales order — StreakBooks" }] }),
  component: NewSalesOrder,
});
