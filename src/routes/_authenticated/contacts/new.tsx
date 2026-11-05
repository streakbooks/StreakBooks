import { createFileRoute } from "@tanstack/react-router";

import { NewContactRoute } from "@/screens/contacts/new";

export const Route = createFileRoute("/_authenticated/contacts/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    kind: search["kind"] === "supplier" ? ("supplier" as const) : ("customer" as const),
  }),
  head: () => ({ meta: [{ title: "New contact — LinkBooks" }] }),
  component: NewContactRoute,
});
