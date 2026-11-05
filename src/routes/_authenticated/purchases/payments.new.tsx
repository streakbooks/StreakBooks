import { createFileRoute } from "@tanstack/react-router";

import { NewPayment } from "@/screens/purchases/payments.new";

export const Route = createFileRoute("/_authenticated/purchases/payments/new")({
  component: NewPayment,
});
