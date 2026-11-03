import { createFileRoute } from "@tanstack/react-router";
import { ReminderSettingsContent } from "@/components/settings/ReminderSettingsContent";
export const Route = createFileRoute("/_authenticated/sales/reminders")({
  head: () => ({ meta: [{ title: "Payment reminders — LinkBooks" }] }),
  component: ReminderSettingsContent,
});
