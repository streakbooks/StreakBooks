import { createFileRoute } from "@tanstack/react-router";

import { NewQuote } from "@/screens/sales/quotes.new";

export const Route = createFileRoute("/_authenticated/sales/quotes/new")({
  head: () => ({ meta: [{ title: "New quote — StreakBooks" }] }),
  component: NewQuote,
});
