import { createFileRoute } from "@tanstack/react-router";

import { ContactsPage } from "@/screens/contacts/index";
import { parseContactsDirectorySearch } from "@/lib/contacts/contact-view-navigation";

export const Route = createFileRoute("/_authenticated/contacts/")({
  validateSearch: parseContactsDirectorySearch,
  head: () => ({
    meta: [
      { title: "Contacts — LinkBooks" },
      { name: "description", content: "LinkBooks contact directory for customers and suppliers." },
    ],
  }),
  component: ContactsPage,
});
