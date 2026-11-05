import { createFileRoute } from "@tanstack/react-router";

import { ContactsPage } from "@/screens/contacts/index";

export const Route = createFileRoute("/_authenticated/contacts/")({
  validateSearch: (search: Record<string, unknown>): { view?: string | undefined } => ({
    view: [
      "all",
      "customers",
      "suppliers",
      "both",
      "recent",
      "updated",
      "inactive",
      "archived",
    ].includes(String(search["view"]))
      ? String(search["view"])
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Contacts — LinkBooks" },
      { name: "description", content: "LinkBooks contact directory for customers and suppliers." },
    ],
  }),
  component: ContactsPage,
});
