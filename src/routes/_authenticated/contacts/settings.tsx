import { createFileRoute } from "@tanstack/react-router";
import { ContactSettingsContent } from "@/components/settings/ContactSettingsContent";
export const Route = createFileRoute("/_authenticated/contacts/settings")({
  head: () => ({ meta: [{ title: "Contact settings — LinkBooks" }] }),
  component: ContactSettingsContent,
});
