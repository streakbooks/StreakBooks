import { type Search } from "@/lib/navigation/workspace-search";
import { createFileRoute } from "@tanstack/react-router";

import { NewTransfer } from "@/screens/banking/transfers";

export const Route = createFileRoute("/_authenticated/banking/transfers/new")({
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
  head: () => ({ meta: [{ title: "New transfer — LinkBooks" }] }),
  component: NewTransferRoute,
});

function NewTransferRoute() {
  const search = Route.useSearch();
  return (
    <NewTransfer
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
