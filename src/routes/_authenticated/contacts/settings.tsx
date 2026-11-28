import { createFileRoute, redirect } from "@tanstack/react-router";
import { ContactSettingsContent } from "@/components/settings/ContactSettingsContent";
export const Route = createFileRoute("/_authenticated/contacts/settings")({
  beforeLoad: () => {
    throw redirect({
      to: "/settings/$group/$page",
      params: { group: "contacts", page: "general" },
      search: { section: "contacts", returnTo: "/contacts" },
    });
  },
  head: () => ({ meta: [{ title: "Contact settings — StreakBooks" }] }),
  component: ContactSettingsContent,
});
