import { type Search } from "@/lib/navigation/workspace-search";

import { createFileRoute } from "@tanstack/react-router";

import { Transfers } from "@/screens/banking/transfers";

export const Route = createFileRoute("/_authenticated/banking/transfers/")({
  // Prefill from "Create transfer from this line": the statement line's account is the destination for money in
  // and the source for money out.
  validateSearch: (s: Record<string, unknown>): Search => {
    const out: Search = {};
    if (typeof s["bankAccountId"] === "string" && s["bankAccountId"])
      out.bankAccountId = s["bankAccountId"];
    if (typeof s["amount"] === "string" && s["amount"]) out.amount = s["amount"];
    if (s["direction"] === "in" || s["direction"] === "out") out.direction = s["direction"];
    if (typeof s["bankTransactionId"] === "string" && s["bankTransactionId"])
      out.bankTransactionId = s["bankTransactionId"];
    return out;
  },
  head: () => ({ meta: [{ title: "Transfers — StreakBooks" }] }),
  component: TransfersRoute,
});

function TransfersRoute() {
  const search = Route.useSearch();
  // Router search can retain raw parent values. Never pass numeric/JSON values to money inputs.
  return (
    <Transfers
      initialSearch={{
        ...(typeof search.bankAccountId === "string"
          ? { bankAccountId: search.bankAccountId }
          : {}),
        ...(typeof search.amount === "string" ? { amount: search.amount } : {}),
        ...(search.direction === "in" || search.direction === "out"
          ? { direction: search.direction }
          : {}),
        ...(typeof search.bankTransactionId === "string"
          ? { bankTransactionId: search.bankTransactionId }
          : {}),
      }}
    />
  );
}
