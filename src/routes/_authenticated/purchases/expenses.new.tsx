import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy Purchases create URL — redirects to canonical Banking Spend Money.
 * Record detail routes under `/purchases/expenses/$id` remain for posted documents.
 */
export const Route = createFileRoute("/_authenticated/purchases/expenses/new")({
  beforeLoad: () => {
    throw redirect({ to: "/banking/spend-money" });
  },
  head: () => ({ meta: [{ title: "Spend money — StreakBooks" }] }),
  component: () => null,
});
