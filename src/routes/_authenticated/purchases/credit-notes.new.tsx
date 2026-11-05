import { createFileRoute } from "@tanstack/react-router";

import { NewCreditNote } from "@/screens/purchases/credit-notes.new";

export const Route = createFileRoute("/_authenticated/purchases/credit-notes/new")({
  validateSearch: (s: Record<string, unknown>): { billId?: string } =>
    typeof s["billId"] === "string" && s["billId"] ? { billId: s["billId"] } : {},
  component: NewCreditNote,
});
