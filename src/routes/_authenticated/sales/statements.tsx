import { createFileRoute } from "@tanstack/react-router";

import { Statements } from "@/screens/sales/statements";

export const Route = createFileRoute("/_authenticated/sales/statements")({
  head: () => ({ meta: [{ title: "Customer statements — StreakBooks" }] }),
  component: Statements,
});
