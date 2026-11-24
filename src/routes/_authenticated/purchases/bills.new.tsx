import { createFileRoute } from "@tanstack/react-router";

import { NewBill } from "@/screens/purchases/bills.new";

export const Route = createFileRoute("/_authenticated/purchases/bills/new")({
  head: () => ({ meta: [{ title: "New bill — StreakBooks" }] }),
  component: NewBill,
});
