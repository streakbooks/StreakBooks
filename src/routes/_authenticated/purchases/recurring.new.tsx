import { createFileRoute } from "@tanstack/react-router";

import { NewBill } from "@/screens/purchases/bills.new";

export const Route = createFileRoute("/_authenticated/purchases/recurring/new")({
  head: () => ({ meta: [{ title: "New recurring bill — StreakBooks" }] }),
  component: NewRecurringBillRoute,
});

function NewRecurringBillRoute() {
  return <NewBill mode="template" />;
}
