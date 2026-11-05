import { createFileRoute } from "@tanstack/react-router";

import { NewOrder } from "@/screens/purchases/orders.new";

export const Route = createFileRoute("/_authenticated/purchases/orders/new")({
  validateSearch: (raw: Record<string, unknown>): { edit?: string } =>
    typeof raw["edit"] === "string" ? { edit: raw["edit"] } : {},
  component: NewOrder,
});
